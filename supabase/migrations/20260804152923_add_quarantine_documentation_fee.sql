-- Add quarantine letters to the existing official-document fee lifecycle.

ALTER TABLE public.clinic_document_fees
  DROP CONSTRAINT clinic_document_fees_document_type_check;
ALTER TABLE public.clinic_document_fees
  ADD CONSTRAINT clinic_document_fees_document_type_check
  CHECK (document_type IN ('mc', 'prescription', 'referral', 'quarantine'));

ALTER TABLE public.consultation_items
  DROP CONSTRAINT consultation_items_source_document_metadata_check;
ALTER TABLE public.consultation_items
  ADD CONSTRAINT consultation_items_source_document_metadata_check
  CHECK (
    (
      source_document_id IS NULL
      AND source_document_type IS NULL
    )
    OR (
      source_document_id IS NOT NULL
      AND source_document_type IN ('mc', 'prescription', 'referral', 'quarantine')
      AND item_name = 'Official Documentation Fees'
      AND quantity = 1
      AND price >= 0
      AND item_id IS NULL
      AND service_id IS NULL
      AND package_id IS NULL
      AND billing_adjustment_kind IS NULL
      AND clinic_charge_type_id IS NULL
    )
  );

INSERT INTO public.clinic_document_fees (document_type, amount)
VALUES ('quarantine', 15.00)
ON CONFLICT (document_type) DO NOTHING;

CREATE OR REPLACE FUNCTION public.set_clinic_document_fee(
  _document_type text,
  _amount numeric
)
RETURNS public.clinic_document_fees
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_document_type text := lower(btrim(coalesce(_document_type, '')));
  v_role text;
  v_result public.clinic_document_fees;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  IF v_document_type NOT IN ('mc', 'prescription', 'referral', 'quarantine')
     OR _amount IS NULL
     OR _amount::text IN ('NaN', 'Infinity', '-Infinity')
     OR _amount < 0
     OR _amount > 99999999.99
     OR round(_amount, 2) <> _amount THEN
    RAISE EXCEPTION 'INVALID_DOCUMENT_FEE' USING ERRCODE = '22023';
  END IF;

  SELECT ur.role::text
    INTO v_role
  FROM public.user_roles ur
  WHERE ur.user_id = auth.uid();

  IF (
    v_document_type = 'mc'
    AND v_role NOT IN (
      'ops_staff',
      'operations',
      'staff',
      'resident_doctor',
      'admin',
      'doctor_admin'
    )
  ) OR (
    v_document_type IN ('prescription', 'referral', 'quarantine')
    AND v_role NOT IN ('admin', 'doctor_admin')
  ) OR v_role IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  UPDATE public.clinic_document_fees
  SET amount = _amount,
      updated_by = auth.uid(),
      updated_at = now()
  WHERE document_type = v_document_type
  RETURNING * INTO STRICT v_result;

  RETURN v_result;
END;
$function$;

ALTER FUNCTION public.set_clinic_document_fee(text, numeric) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_clinic_document_fee(text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_clinic_document_fee(text, numeric) TO authenticated;

-- Preserve the reviewed atomic billing implementation and extend only its
-- supported document-type branch. Abort if the expected definition differs.
DO $migration$
DECLARE
  v_definition text;
  v_updated_definition text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO STRICT v_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'sync_consultation_document_fee'
    AND p.prokind = 'f';

  v_updated_definition := replace(
    v_definition,
    'v_document_type NOT IN (''mc'', ''prescription'', ''referral'')',
    'v_document_type NOT IN (''mc'', ''prescription'', ''referral'', ''quarantine'')'
  );

  IF v_updated_definition = v_definition THEN
    RAISE EXCEPTION 'UNEXPECTED_DOCUMENT_FEE_FUNCTION_DEFINITION';
  END IF;

  EXECUTE v_updated_definition;
END;
$migration$;

-- Charge only currently open quarantine documents created after the official
-- fee feature existed. Historical completed bills remain untouched.
INSERT INTO public.consultation_items (
  consultation_id,
  item_name,
  quantity,
  price,
  unit_cost,
  source_document_id,
  source_document_type
)
SELECT
  cd.consultation_id,
  'Official Documentation Fees',
  1,
  cdf.amount,
  0,
  cd.id,
  'quarantine'
FROM public.consultation_documents cd
JOIN public.consultations c ON c.id = cd.consultation_id
JOIN public.queue_entries qe ON qe.id = c.queue_entry_id
JOIN public.clinic_document_fees cdf ON cdf.document_type = 'quarantine'
WHERE lower(btrim(coalesce(cd.type, ''))) = 'quarantine'
  AND cd.created_at >= timestamptz '2026-07-29 00:00:00+00'
  AND c.status IS DISTINCT FROM 'completed'
  AND qe.clinic_status IS DISTINCT FROM 'completed'
  AND NOT EXISTS (
    SELECT 1
    FROM public.consultation_items ci
    WHERE ci.source_document_id = cd.id
      AND ci.deleted_at IS NULL
  )
ON CONFLICT (source_document_id)
  WHERE deleted_at IS NULL
  DO NOTHING;
