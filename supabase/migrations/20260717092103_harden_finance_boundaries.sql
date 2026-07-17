-- Close the two error-level findings reported by the 2026-07-17 security scan.
--
-- 1. Full insurance-provider rows contain tax identifiers and negotiated terms,
--    so they are finance-admin only. Clinical roles use the deliberately small
--    directory RPC below instead.
-- 2. save_client_invoice_items remains available, but authorization is enforced
--    inside the SECURITY DEFINER boundary and its execute grants are explicit.
--
-- No application data or user-facing content is changed by this migration.

BEGIN;

DO $preflight$
DECLARE
  actual text[];
  expected_old text[] := ARRAY[
    'insurance_providers|insurance_providers_clinic_roles_read|{authenticated}|PERMISSIVE|SELECT|is_staff_or_clinicalauth.uid|'
  ];
  expected_final text[] := ARRAY[
    'insurance_providers|insurance_providers_finance_admin_read|{authenticated}|PERMISSIVE|SELECT|is_finance_admin|'
  ];
BEGIN
  SELECT array_agg(
      tablename || '|' || policyname || '|' || roles::text || '|' ||
      permissive || '|' || cmd || '|' ||
      regexp_replace(lower(coalesce(qual, '')), '[[:space:]()]', '', 'g') || '|' ||
      regexp_replace(lower(coalesce(with_check, '')), '[[:space:]()]', '', 'g')
      ORDER BY policyname
    )
    INTO actual
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'insurance_providers'
     AND cmd = 'SELECT';

  IF actual IS DISTINCT FROM expected_old AND actual IS DISTINCT FROM expected_final THEN
    RAISE EXCEPTION 'finance-boundary preflight failed; insurance SELECT-policy inventory drifted: %', actual;
  END IF;

  IF to_regprocedure('public.is_finance_admin()') IS NULL THEN
    RAISE EXCEPTION 'finance-boundary preflight failed; public.is_finance_admin() is missing';
  END IF;

  IF to_regprocedure('public.save_client_invoice_items(uuid,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'finance-boundary preflight failed; save_client_invoice_items(uuid,jsonb) is missing';
  END IF;
END
$preflight$;

DROP POLICY IF EXISTS "insurance_providers_clinic_roles_read"
  ON public.insurance_providers;
DROP POLICY IF EXISTS "insurance_providers_finance_admin_read"
  ON public.insurance_providers;

CREATE POLICY "insurance_providers_finance_admin_read"
  ON public.insurance_providers
  FOR SELECT TO authenticated
  USING (public.is_finance_admin());

CREATE OR REPLACE FUNCTION public.get_insurance_provider_directory(
  _active_only boolean DEFAULT false
)
RETURNS TABLE(id uuid, name text, status text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.is_staff_or_clinical(auth.uid())
    OR public.is_finance_admin()
  ) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT ip.id, ip.name, ip.status
    FROM public.insurance_providers AS ip
   WHERE NOT _active_only OR ip.status = 'active'
   ORDER BY ip.name;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_insurance_provider_directory(boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_insurance_provider_directory(boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_insurance_provider_directory(boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_client_invoice_items(
  _invoice_id uuid,
  _items jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_finance_admin() THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'INVALID_ITEMS' USING ERRCODE = '22023';
  END IF;

  PERFORM 1
    FROM public.client_invoices
   WHERE id = _invoice_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVOICE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.client_invoice_items
   WHERE invoice_id = _invoice_id;

  INSERT INTO public.client_invoice_items
    (invoice_id, description, quantity, unit_price)
  SELECT
    _invoice_id,
    (item->>'description')::text,
    COALESCE((item->>'quantity')::numeric, 1),
    COALESCE((item->>'unit_price')::numeric, 0)
  FROM jsonb_array_elements(_items) AS item
  WHERE COALESCE(trim(item->>'description'), '') <> '';
END;
$function$;

REVOKE ALL ON FUNCTION public.save_client_invoice_items(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_client_invoice_items(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_client_invoice_items(uuid, jsonb) TO authenticated;

DO $postflight$
DECLARE
  actual text[];
  expected text[] := ARRAY[
    'insurance_providers|insurance_providers_finance_admin_read|{authenticated}|PERMISSIVE|SELECT|is_finance_admin|'
  ];
BEGIN
  SELECT array_agg(
      tablename || '|' || policyname || '|' || roles::text || '|' ||
      permissive || '|' || cmd || '|' ||
      regexp_replace(lower(coalesce(qual, '')), '[[:space:]()]', '', 'g') || '|' ||
      regexp_replace(lower(coalesce(with_check, '')), '[[:space:]()]', '', 'g')
      ORDER BY policyname
    )
    INTO actual
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'insurance_providers'
     AND cmd = 'SELECT';

  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'finance-boundary postflight failed; expected %, got %', expected, actual;
  END IF;

  IF has_function_privilege('anon', 'public.get_insurance_provider_directory(boolean)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.save_client_invoice_items(uuid,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'finance-boundary postflight failed; anon can execute a protected RPC';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.get_insurance_provider_directory(boolean)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.save_client_invoice_items(uuid,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'finance-boundary postflight failed; authenticated execute grant is missing';
  END IF;
END
$postflight$;

COMMIT;
