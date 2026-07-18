-- Remove browser-readable Stripe credentials and protect clinic bank/tax fields.
--
-- Stripe credentials are provided only through Edge Function environment
-- secrets. Clinic roles retain operational settings through a redacting RPC;
-- full clinic_settings rows are finance-admin only.

BEGIN;

DO $preflight$
DECLARE
  actual text[];
  expected_old text[] := ARRAY[
    'clinic_settings|clinic_settings_clinic_roles_read|{authenticated}|PERMISSIVE|SELECT|is_staff_or_clinicalauth.uid|'
  ];
  expected_final text[] := ARRAY[
    'clinic_settings|clinic_settings_finance_admin_read|{authenticated}|PERMISSIVE|SELECT|is_finance_admin|'
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
     AND tablename = 'clinic_settings'
     AND cmd = 'SELECT';

  IF actual IS DISTINCT FROM expected_old AND actual IS DISTINCT FROM expected_final THEN
    RAISE EXCEPTION 'settings-secrets preflight failed; clinic_settings SELECT-policy inventory drifted: %', actual;
  END IF;

  IF to_regprocedure('public.is_finance_admin()') IS NULL THEN
    RAISE EXCEPTION 'settings-secrets preflight failed; public.is_finance_admin() is missing';
  END IF;

  IF to_regprocedure('public.is_staff_or_clinical(uuid)') IS NULL THEN
    RAISE EXCEPTION 'settings-secrets preflight failed; public.is_staff_or_clinical(uuid) is missing';
  END IF;

  IF to_regclass('public.clinic_settings') IS NULL
     OR to_regclass('public.app_settings') IS NULL THEN
    RAISE EXCEPTION 'settings-secrets preflight failed; required settings table is missing';
  END IF;
END
$preflight$;

DROP POLICY IF EXISTS "clinic_settings_clinic_roles_read"
  ON public.clinic_settings;
DROP POLICY IF EXISTS "clinic_settings_finance_admin_read"
  ON public.clinic_settings;

CREATE POLICY "clinic_settings_finance_admin_read"
  ON public.clinic_settings
  FOR SELECT TO authenticated
  USING (public.is_finance_admin());

CREATE OR REPLACE FUNCTION public.get_clinic_settings()
RETURNS SETOF public.clinic_settings
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

  IF public.is_finance_admin() THEN
    RETURN QUERY
    SELECT cs.*
    FROM public.clinic_settings AS cs;
  ELSE
    RETURN QUERY
    SELECT (jsonb_populate_record(
      NULL::public.clinic_settings,
      to_jsonb(cs) || jsonb_build_object(
        'bank_name', NULL,
        'bank_account_no', NULL,
        'bank_account_holder', NULL,
        'sst_number', NULL
      )
    )).*
    FROM public.clinic_settings AS cs;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_clinic_settings() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_clinic_settings() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_clinic_settings() TO authenticated;

DELETE FROM public.app_settings
WHERE key IN ('stripe_secret_key', 'stripe_restricted_key');

ALTER TABLE public.app_settings
  DROP CONSTRAINT IF EXISTS app_settings_forbid_browser_secrets;

ALTER TABLE public.app_settings
  ADD CONSTRAINT app_settings_forbid_browser_secrets
  CHECK (key NOT IN ('stripe_secret_key', 'stripe_restricted_key'));

DO $postflight$
DECLARE
  actual text[];
  expected text[] := ARRAY[
    'clinic_settings|clinic_settings_finance_admin_read|{authenticated}|PERMISSIVE|SELECT|is_finance_admin|'
  ];
  function_definition text;
  function_config text[];
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
     AND tablename = 'clinic_settings'
     AND cmd = 'SELECT';

  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'settings-secrets postflight failed; expected %, got %', expected, actual;
  END IF;

  SELECT pg_get_functiondef(p.oid), p.proconfig
    INTO function_definition, function_config
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'get_clinic_settings'
     AND pg_get_function_identity_arguments(p.oid) = '';

  IF function_definition IS NULL
     OR position('is_finance_admin' in function_definition) = 0
     OR position('is_staff_or_clinical' in function_definition) = 0
     OR function_config IS DISTINCT FROM ARRAY['search_path=""'] THEN
    RAISE EXCEPTION 'settings-secrets postflight failed; safe RPC definition/config is invalid';
  END IF;

  IF has_function_privilege('anon', 'public.get_clinic_settings()', 'EXECUTE') THEN
    RAISE EXCEPTION 'settings-secrets postflight failed; anon can execute get_clinic_settings';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.get_clinic_settings()', 'EXECUTE') THEN
    RAISE EXCEPTION 'settings-secrets postflight failed; authenticated execute grant is missing';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.app_settings
     WHERE key IN ('stripe_secret_key', 'stripe_restricted_key')
  ) THEN
    RAISE EXCEPTION 'settings-secrets postflight failed; forbidden Stripe rows remain';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint AS c
      JOIN pg_class AS t ON t.oid = c.conrelid
      JOIN pg_namespace AS n ON n.oid = t.relnamespace
     WHERE n.nspname = 'public'
       AND t.relname = 'app_settings'
       AND c.conname = 'app_settings_forbid_browser_secrets'
       AND c.contype = 'c'
       AND c.convalidated
  ) THEN
    RAISE EXCEPTION 'settings-secrets postflight failed; forbidden-key constraint is missing';
  END IF;
END
$postflight$;

COMMIT;
