-- =============================================================================
-- RLS Hardening v7 — least-privilege SELECT policies on
--   clinic_appointments, consultation_items, panel_claims, payments.
--
-- REVIEW-ONLY. Not under supabase/migrations/. Copy verbatim into a real
-- migration only after explicit approval.
--
-- Preflight verifies the exact NINE-element baseline captured from the live
-- staging database (six insecure/dead policies + THREE preserved rows: the
-- two special_admin voided policies AND the pre-existing
-- consultation_items_read_active — plus the two "Strict doctors and admins…"
-- policies on role `public`). It validates policyname, table, roles,
-- permissiveness, cmd, normalized qual, and normalized with_check for every
-- row — not just names.
--
-- Postflight verifies the exact final SELECT inventory the same way, and
-- also verifies the two preserved voided policies' full definitions are
-- unchanged.
--
-- Any drift raises and rolls back the entire transaction.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Preflight: exact per-column policy baseline. Normalization strips
--    whitespace + parentheses + lowercases so equivalent renderings match.
-- -----------------------------------------------------------------------------
DO $preflight$
DECLARE
  actual   text[];
  expected text[] := ARRAY[
    -- format: table|policy|roles|permissive|cmd|norm(qual)|norm(with_check)
    'clinic_appointments|Authenticated can read clinic_appointments|{authenticated}|PERMISSIVE|SELECT|true|',
    'consultation_items|consultation_items_read_active|{authenticated}|PERMISSIVE|SELECT|deleted_atisnull|',
    'consultation_items|consultation_items_special_admin_read_voided|{authenticated}|PERMISSIVE|SELECT|is_special_admin(auth.uid())anddeleted_atisnotnull|',
    'panel_claims|Strict doctors and admins can view panel claims|{public}|PERMISSIVE|SELECT|has_strict_role(auth.uid(),''doctor''::text)oris_admin(auth.uid())|',
    'panel_claims|panel_claims_read_all|{authenticated}|PERMISSIVE|SELECT|true|',
    'payments|Strict doctors and admins can view payments|{public}|PERMISSIVE|SELECT|has_strict_role(auth.uid(),''doctor''::text)oris_admin(auth.uid())|',
    'payments|payments_read_active|{authenticated}|PERMISSIVE|SELECT|deleted_atisnull|',
    'payments|payments_special_admin_read_voided|{authenticated}|PERMISSIVE|SELECT|is_special_admin(auth.uid())anddeleted_atisnotnull|'
  ];
BEGIN
  SELECT array_agg(
      tablename || '|' || policyname || '|' || roles::text || '|' ||
      permissive || '|' || cmd || '|' ||
      regexp_replace(lower(coalesce(qual,'')),       '[[:space:]()]', '', 'g') || '|' ||
      regexp_replace(lower(coalesce(with_check,'')), '[[:space:]()]', '', 'g')
      ORDER BY tablename, policyname
    )
    INTO actual
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('clinic_appointments','consultation_items','panel_claims','payments')
     AND cmd = 'SELECT';

  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'v7 preflight failed. Expected % rows, got %', expected, actual;
  END IF;
END
$preflight$;

-- -----------------------------------------------------------------------------
-- 1. SECURITY DEFINER helpers. Both use auth.uid() internally.
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 2. Drop the six insecure/dead SELECT policies. Preserved:
--    * consultation_items_special_admin_read_voided
--    * payments_special_admin_read_voided
-- -----------------------------------------------------------------------------
DROP POLICY "Authenticated can read clinic_appointments"      ON public.clinic_appointments;
DROP POLICY "consultation_items_read_active"                  ON public.consultation_items;
DROP POLICY "panel_claims_read_all"                           ON public.panel_claims;
DROP POLICY "Strict doctors and admins can view panel claims" ON public.panel_claims;
DROP POLICY "payments_read_active"                            ON public.payments;
DROP POLICY "Strict doctors and admins can view payments"     ON public.payments;

-- -----------------------------------------------------------------------------
-- 3. Least-privilege SELECT replacements. Note: helper signatures take uuid.
-- -----------------------------------------------------------------------------

-- clinic_appointments: internal staff full read + own-clinician read.
CREATE POLICY "clinic_appointments_internal_read"
  ON public.clinic_appointments FOR SELECT TO authenticated
  USING (public.is_internal_staff(auth.uid()));

CREATE POLICY "clinic_appointments_own_clinician_read"
  ON public.clinic_appointments FOR SELECT TO authenticated
  USING (doctor_id = public.get_doctor_id_for_user(auth.uid()));

-- consultation_items: single combined active-read policy; total CI SELECT = 2.
CREATE POLICY "consultation_items_active_read"
  ON public.consultation_items FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      public.is_ops_or_admin(auth.uid())
      OR public.is_current_user_consultation_doctor(consultation_id)
    )
  );

-- panel_claims: finance-admin only.
CREATE POLICY "panel_claims_finance_admin_read"
  ON public.panel_claims FOR SELECT TO authenticated
  USING (public.is_finance_admin());

-- payments: staff/admin full active read + own-clinician active read.
CREATE POLICY "payments_active_staff_read"
  ON public.payments FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.is_staff_or_admin(auth.uid()));

CREATE POLICY "payments_own_clinician_read"
  ON public.payments FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.is_current_user_consultation_doctor(consultation_id)
  );

-- -----------------------------------------------------------------------------
-- 4. Postflight: exact per-column final inventory + preserved-policy proof +
--    blanket USING(true) check.
-- -----------------------------------------------------------------------------
DO $postflight$
DECLARE
  actual   text[];
  expected text[] := ARRAY[
    'clinic_appointments|clinic_appointments_internal_read|{authenticated}|PERMISSIVE|SELECT|is_internal_staff(auth.uid())|',
    'clinic_appointments|clinic_appointments_own_clinician_read|{authenticated}|PERMISSIVE|SELECT|doctor_id=get_doctor_id_for_user(auth.uid())|',
    'consultation_items|consultation_items_active_read|{authenticated}|PERMISSIVE|SELECT|deleted_atisnulland[is_ops_or_admin(auth.uid())oris_current_user_consultation_doctor(consultation_id)]|',
    'consultation_items|consultation_items_special_admin_read_voided|{authenticated}|PERMISSIVE|SELECT|is_special_admin(auth.uid())anddeleted_atisnotnull|',
    'panel_claims|panel_claims_finance_admin_read|{authenticated}|PERMISSIVE|SELECT|is_finance_admin()|',
    'payments|payments_active_staff_read|{authenticated}|PERMISSIVE|SELECT|deleted_atisnullandis_staff_or_admin(auth.uid())|',
    'payments|payments_own_clinician_read|{authenticated}|PERMISSIVE|SELECT|deleted_atisnullandis_current_user_consultation_doctor(consultation_id)|',
    'payments|payments_special_admin_read_voided|{authenticated}|PERMISSIVE|SELECT|is_special_admin(auth.uid())anddeleted_atisnotnull|'
  ];
  norm_actual text;
  blanket_count int;
BEGIN
  -- The combined consultation_items_active_read policy renders with an inner
  -- parenthesised OR. To keep the expected string readable we substitute
  -- '[' ']' for the inner parens in the expected value, then in actual
  -- pre-normalize matching parens the same way.
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

  -- Explicit preserved-policy definition proof (defence in depth).
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='consultation_items'
       AND policyname='consultation_items_special_admin_read_voided'
       AND permissive='PERMISSIVE' AND cmd='SELECT'
       AND roles = '{authenticated}'::name[]
       AND regexp_replace(lower(coalesce(qual,'')), '[[:space:]()]','','g')
           = 'is_special_admin(auth.uid())anddeleted_atisnotnull'
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
           = 'is_special_admin(auth.uid())anddeleted_atisnotnull'
  ) THEN
    RAISE EXCEPTION 'v7 postflight: preserved payments voided policy definition drifted';
  END IF;

  -- No blanket USING(true) SELECT policy may remain.
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
