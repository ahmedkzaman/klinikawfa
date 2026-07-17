-- Forward-only production migration promoted from the staging-validated v7
-- proposal. Any policy drift raises and rolls back the entire transaction.

BEGIN;

DO $preflight$
DECLARE
  actual   text[];
  expected_old text[] := ARRAY[
    'clinic_appointments|Authenticated can read clinic_appointments|{authenticated}|PERMISSIVE|SELECT|true|',
    'consultation_items|consultation_items_read_active|{authenticated}|PERMISSIVE|SELECT|deleted_atisnull|',
    'consultation_items|consultation_items_special_admin_read_voided|{authenticated}|PERMISSIVE|SELECT|is_special_adminauth.uidanddeleted_atisnotnull|',
    'panel_claims|Strict doctors and admins can view panel claims|{public}|PERMISSIVE|SELECT|has_strict_roleauth.uid,''doctor''::textoris_adminauth.uid|',
    'panel_claims|panel_claims_read_all|{authenticated}|PERMISSIVE|SELECT|true|',
    'payments|Strict doctors and admins can view payments|{public}|PERMISSIVE|SELECT|has_strict_roleauth.uid,''doctor''::textoris_adminauth.uid|',
    'payments|payments_read_active|{authenticated}|PERMISSIVE|SELECT|deleted_atisnull|',
    'payments|payments_special_admin_read_voided|{authenticated}|PERMISSIVE|SELECT|is_special_adminauth.uidanddeleted_atisnotnull|'
  ];
  expected_final text[] := ARRAY[
    'clinic_appointments|clinic_appointments_internal_read|{authenticated}|PERMISSIVE|SELECT|is_internal_staffauth.uid|',
    'clinic_appointments|clinic_appointments_own_clinician_read|{authenticated}|PERMISSIVE|SELECT|doctor_id=get_doctor_id_for_userauth.uid|',
    'consultation_items|consultation_items_active_read|{authenticated}|PERMISSIVE|SELECT|deleted_atisnulland[is_ops_or_adminauth.uidoris_current_user_consultation_doctorconsultation_id]|',
    'consultation_items|consultation_items_special_admin_read_voided|{authenticated}|PERMISSIVE|SELECT|is_special_adminauth.uidanddeleted_atisnotnull|',
    'panel_claims|panel_claims_finance_admin_read|{authenticated}|PERMISSIVE|SELECT|is_finance_admin|',
    'payments|payments_active_staff_read|{authenticated}|PERMISSIVE|SELECT|deleted_atisnullandis_staff_or_adminauth.uid|',
    'payments|payments_own_clinician_read|{authenticated}|PERMISSIVE|SELECT|deleted_atisnullandis_current_user_consultation_doctorconsultation_id|',
    'payments|payments_special_admin_read_voided|{authenticated}|PERMISSIVE|SELECT|is_special_adminauth.uidanddeleted_atisnotnull|'
  ];
BEGIN
  SELECT array_agg(
      tablename || '|' || policyname || '|' || roles::text || '|' ||
      permissive || '|' || cmd || '|' ||
      regexp_replace(
        replace(replace(lower(coalesce(qual,'')),
          '(is_ops_or_admin(auth.uid()) or is_current_user_consultation_doctor(consultation_id))',
          '[is_ops_or_admin(auth.uid()) or is_current_user_consultation_doctor(consultation_id)]'
        ), '  ', ' '),
        '[[:space:]()]', '', 'g'
      ) || '|' ||
      regexp_replace(lower(coalesce(with_check,'')), '[[:space:]()]', '', 'g')
      ORDER BY tablename, policyname
    )
    INTO actual
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('clinic_appointments','consultation_items','panel_claims','payments')
     AND cmd = 'SELECT';

  IF actual IS DISTINCT FROM expected_old AND actual IS DISTINCT FROM expected_final THEN
    RAISE EXCEPTION 'v7 preflight failed. Policy inventory drifted: %', actual;
  END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION public.is_finance_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
     WHERE ur.user_id = auth.uid()
       AND ur.role IN ('operations','ops_staff','doctor_admin','admin','special_admin')
  );
$$;
REVOKE ALL ON FUNCTION public.is_finance_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_finance_admin() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_current_user_consultation_doctor(_consultation_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.consultations c
      JOIN public.doctors d ON d.id = c.doctor_id
     WHERE c.id = _consultation_id AND d.user_id = auth.uid()
  );
$$;
REVOKE ALL ON FUNCTION public.is_current_user_consultation_doctor(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_current_user_consultation_doctor(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Authenticated can read clinic_appointments"      ON public.clinic_appointments;
DROP POLICY IF EXISTS "consultation_items_read_active"                  ON public.consultation_items;
DROP POLICY IF EXISTS "panel_claims_read_all"                           ON public.panel_claims;
DROP POLICY IF EXISTS "Strict doctors and admins can view panel claims" ON public.panel_claims;
DROP POLICY IF EXISTS "payments_read_active"                            ON public.payments;
DROP POLICY IF EXISTS "Strict doctors and admins can view payments"     ON public.payments;

-- Also remove an already-final inventory so this migration converges safely
-- when the scanner is stale or the SQL was applied manually before history
-- synchronization. The exact preflight above prevents accepting any drift.
DROP POLICY IF EXISTS "clinic_appointments_internal_read"            ON public.clinic_appointments;
DROP POLICY IF EXISTS "clinic_appointments_own_clinician_read"       ON public.clinic_appointments;
DROP POLICY IF EXISTS "consultation_items_active_read"               ON public.consultation_items;
DROP POLICY IF EXISTS "panel_claims_finance_admin_read"              ON public.panel_claims;
DROP POLICY IF EXISTS "payments_active_staff_read"                   ON public.payments;
DROP POLICY IF EXISTS "payments_own_clinician_read"                  ON public.payments;

CREATE POLICY "clinic_appointments_internal_read"
  ON public.clinic_appointments FOR SELECT TO authenticated
  USING (public.is_internal_staff(auth.uid()));

CREATE POLICY "clinic_appointments_own_clinician_read"
  ON public.clinic_appointments FOR SELECT TO authenticated
  USING (doctor_id = public.get_doctor_id_for_user(auth.uid()));

CREATE POLICY "consultation_items_active_read"
  ON public.consultation_items FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      public.is_ops_or_admin(auth.uid())
      OR public.is_current_user_consultation_doctor(consultation_id)
    )
  );

CREATE POLICY "panel_claims_finance_admin_read"
  ON public.panel_claims FOR SELECT TO authenticated
  USING (public.is_finance_admin());

CREATE POLICY "payments_active_staff_read"
  ON public.payments FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.is_staff_or_admin(auth.uid()));

CREATE POLICY "payments_own_clinician_read"
  ON public.payments FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.is_current_user_consultation_doctor(consultation_id)
  );

DO $postflight$
DECLARE
  actual   text[];
  expected text[] := ARRAY[
    'clinic_appointments|clinic_appointments_internal_read|{authenticated}|PERMISSIVE|SELECT|is_internal_staffauth.uid|',
    'clinic_appointments|clinic_appointments_own_clinician_read|{authenticated}|PERMISSIVE|SELECT|doctor_id=get_doctor_id_for_userauth.uid|',
    'consultation_items|consultation_items_active_read|{authenticated}|PERMISSIVE|SELECT|deleted_atisnulland[is_ops_or_adminauth.uidoris_current_user_consultation_doctorconsultation_id]|',
    'consultation_items|consultation_items_special_admin_read_voided|{authenticated}|PERMISSIVE|SELECT|is_special_adminauth.uidanddeleted_atisnotnull|',
    'panel_claims|panel_claims_finance_admin_read|{authenticated}|PERMISSIVE|SELECT|is_finance_admin|',
    'payments|payments_active_staff_read|{authenticated}|PERMISSIVE|SELECT|deleted_atisnullandis_staff_or_adminauth.uid|',
    'payments|payments_own_clinician_read|{authenticated}|PERMISSIVE|SELECT|deleted_atisnullandis_current_user_consultation_doctorconsultation_id|',
    'payments|payments_special_admin_read_voided|{authenticated}|PERMISSIVE|SELECT|is_special_adminauth.uidanddeleted_atisnotnull|'
  ];
  blanket_count int;
BEGIN
  SELECT array_agg(
      tablename || '|' || policyname || '|' || roles::text || '|' ||
      permissive || '|' || cmd || '|' ||
      regexp_replace(
        replace(replace(lower(coalesce(qual,'')),
          '(is_ops_or_admin(auth.uid()) or is_current_user_consultation_doctor(consultation_id))',
          '[is_ops_or_admin(auth.uid()) or is_current_user_consultation_doctor(consultation_id)]'
        ), '  ', ' '),
        '[[:space:]()]', '', 'g'
      ) || '|' ||
      regexp_replace(lower(coalesce(with_check,'')), '[[:space:]()]', '', 'g')
      ORDER BY tablename, policyname
    )
    INTO actual
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('clinic_appointments','consultation_items','panel_claims','payments')
     AND cmd = 'SELECT';

  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'v7 postflight failed. Expected % got %', expected, actual;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='consultation_items'
       AND policyname='consultation_items_special_admin_read_voided'
       AND permissive='PERMISSIVE' AND cmd='SELECT'
       AND roles = '{authenticated}'::name[]
       AND regexp_replace(lower(coalesce(qual,'')), '[[:space:]()]','','g')
           = 'is_special_adminauth.uidanddeleted_atisnotnull'
  ) THEN
    RAISE EXCEPTION 'v7 postflight: preserved CI voided policy definition drifted';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='payments'
       AND policyname='payments_special_admin_read_voided'
       AND permissive='PERMISSIVE' AND cmd='SELECT'
       AND roles = '{authenticated}'::name[]
       AND regexp_replace(lower(coalesce(qual,'')), '[[:space:]()]','','g')
           = 'is_special_adminauth.uidanddeleted_atisnotnull'
  ) THEN
    RAISE EXCEPTION 'v7 postflight: preserved payments voided policy definition drifted';
  END IF;

  SELECT count(*) INTO blanket_count
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('clinic_appointments','consultation_items','panel_claims','payments')
     AND cmd = 'SELECT'
     AND regexp_replace(lower(coalesce(qual,'')), '[[:space:]()]', '', 'g') = 'true';
  IF blanket_count > 0 THEN
    RAISE EXCEPTION 'v7 postflight: % blanket USING(true) policy(ies) remain', blanket_count;
  END IF;
END
$postflight$;

COMMIT;
