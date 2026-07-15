-- =============================================================================
-- RLS Hardening v6 — Least-privilege SELECT policies on
--   clinic_appointments, consultation_items, panel_claims, payments
--
-- REVIEW-ONLY. This file is intentionally NOT under supabase/migrations/ so
-- it is never auto-applied. Copy verbatim into a real migration file only
-- after explicit approval.
--
-- Single atomic transaction. Preflight verifies the exact sorted eight-policy
-- baseline (six insecure/dead policies + two preserved voided policies).
-- Postflight verifies the exact final SELECT inventory. Any mismatch raises
-- and rolls back the transaction.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Preflight: current SELECT policy inventory MUST equal the exact sorted
--    eight-element baseline. If any drift is detected, abort.
-- -----------------------------------------------------------------------------
DO $preflight$
DECLARE
  actual   text[];
  expected text[] := ARRAY[
    'clinic_appointments|Authenticated can read clinic_appointments',
    'consultation_items|Special admins can view voided consultation_items',
    'consultation_items|consultation_items_read_active',
    'panel_claims|Strict doctors and admins can view panel claims',
    'panel_claims|panel_claims_read_all',
    'payments|Special admins can view voided payments',
    'payments|Strict doctors and admins can view payments',
    'payments|payments_read_active'
  ];
BEGIN


  SELECT array_agg(tablename || '|' || policyname ORDER BY tablename, policyname)
    INTO actual
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('clinic_appointments','consultation_items','panel_claims','payments')
     AND cmd = 'SELECT';

  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION
      'v6 preflight failed. Expected eight SELECT policies (sorted): %, got: %',
      expected, actual;
  END IF;
END
$preflight$;

-- -----------------------------------------------------------------------------
-- 1. New SECURITY DEFINER helpers. Both use auth.uid() internally — callers
--    cannot inject an arbitrary user id.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_finance_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.user_roles ur
     WHERE ur.user_id = auth.uid()
       AND ur.role IN ('operations','ops_staff','doctor_admin','admin','special_admin')
  );
$$;

REVOKE ALL ON FUNCTION public.is_finance_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_finance_admin() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_current_user_consultation_doctor(_consultation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.consultations c
      JOIN public.doctors d ON d.id = c.doctor_id
     WHERE c.id = _consultation_id
       AND d.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_current_user_consultation_doctor(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_current_user_consultation_doctor(uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. Drop only the six named insecure/dead SELECT policies.
--    The two preserved voided policies are intentionally NOT touched.
-- -----------------------------------------------------------------------------
DROP POLICY "Authenticated can read clinic_appointments"      ON public.clinic_appointments;
DROP POLICY "consultation_items_read_active"                  ON public.consultation_items;
DROP POLICY "panel_claims_read_all"                           ON public.panel_claims;
DROP POLICY "Strict doctors and admins can view panel claims" ON public.panel_claims;
DROP POLICY "payments_read_active"                            ON public.payments;
DROP POLICY "Strict doctors and admins can view payments"     ON public.payments;

-- -----------------------------------------------------------------------------
-- 3. Least-privilege SELECT replacements.
-- -----------------------------------------------------------------------------

-- clinic_appointments: internal staff full read; assigned clinician own read.
CREATE POLICY "clinic_appointments_internal_read"
  ON public.clinic_appointments FOR SELECT TO authenticated
  USING (public.is_internal_staff());

CREATE POLICY "clinic_appointments_own_clinician_read"
  ON public.clinic_appointments FOR SELECT TO authenticated
  USING (doctor_id = public.get_doctor_id_for_user(auth.uid()));

-- consultation_items: single combined SELECT policy so total CI SELECT count
-- (this + preserved voided) equals two. Grants active read to ops/admin OR to
-- the owning clinician.
CREATE POLICY "consultation_items_active_read"
  ON public.consultation_items FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      public.is_ops_or_admin()
      OR public.is_current_user_consultation_doctor(consultation_id)
    )
  );

-- panel_claims: finance-admin only.
CREATE POLICY "panel_claims_finance_admin_read"
  ON public.panel_claims FOR SELECT TO authenticated
  USING (public.is_finance_admin());

-- payments: staff/admin full active read; clinician own active read.
CREATE POLICY "payments_active_staff_read"
  ON public.payments FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.is_staff_or_admin());

CREATE POLICY "payments_own_clinician_read"
  ON public.payments FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.is_current_user_consultation_doctor(consultation_id)
  );

-- -----------------------------------------------------------------------------
-- 4. Postflight: verify the final SELECT inventory equals the exact sorted
--    expected array (eight policies: 2 CA + 2 CI + 1 PC + 3 P). Then verify
--    no blanket USING(true) SELECT policy remains.
-- -----------------------------------------------------------------------------
DO $postflight$
DECLARE
  actual        text[];
  expected      text[] := ARRAY[
    'clinic_appointments|clinic_appointments_internal_read',
    'clinic_appointments|clinic_appointments_own_clinician_read',
    'consultation_items|Special admins can view voided consultation_items',
    'consultation_items|consultation_items_active_read',
    'panel_claims|panel_claims_finance_admin_read',
    'payments|Special admins can view voided payments',
    'payments|payments_active_staff_read',
    'payments|payments_own_clinician_read'
  ];

  blanket_count int;
BEGIN
  SELECT array_agg(tablename || '|' || policyname ORDER BY tablename, policyname)
    INTO actual
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('clinic_appointments','consultation_items','panel_claims','payments')
     AND cmd = 'SELECT';

  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION
      'v6 postflight failed. Expected sorted SELECT policies %, got %',
      expected, actual;
  END IF;

  -- Blanket-permissive check: no SELECT policy that normalizes to USING(true).
  SELECT count(*)
    INTO blanket_count
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('clinic_appointments','consultation_items','panel_claims','payments')
     AND cmd = 'SELECT'
     AND regexp_replace(lower(coalesce(qual,'')), '[[:space:]()]', '', 'g') = 'true';

  IF blanket_count > 0 THEN
    RAISE EXCEPTION
      'v6 postflight failed: % blanket USING(true) SELECT policy(ies) remain',
      blanket_count;
  END IF;
END
$postflight$;

COMMIT;
