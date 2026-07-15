-- =============================================================================
-- EMERGENCY ONLY — re-opens the publishing blocker.
--
-- Restores the six prior insecure/dead SELECT policies verbatim and drops the
-- two v6 helper functions. Leaves the two preserved voided policies untouched.
--
-- Deliberately lives OUTSIDE supabase/migrations/ so it is never auto-applied.
-- Run manually with psql only if the v6 migration must be reverted.
-- =============================================================================

BEGIN;

-- 1. Drop new SELECT policies that depend on the v6 helpers.
DROP POLICY IF EXISTS "clinic_appointments_internal_read"       ON public.clinic_appointments;
DROP POLICY IF EXISTS "clinic_appointments_own_clinician_read"  ON public.clinic_appointments;
DROP POLICY IF EXISTS "consultation_items_active_read"          ON public.consultation_items;
DROP POLICY IF EXISTS "consultation_items_own_clinician_read"   ON public.consultation_items;
DROP POLICY IF EXISTS "panel_claims_finance_admin_read"         ON public.panel_claims;
DROP POLICY IF EXISTS "payments_active_staff_read"              ON public.payments;
DROP POLICY IF EXISTS "payments_own_clinician_read"             ON public.payments;

-- 2. Drop v6 helpers now that no policy references them.
DROP FUNCTION IF EXISTS public.is_current_user_consultation_doctor(uuid);
DROP FUNCTION IF EXISTS public.is_finance_admin();

-- 3. Restore the six prior policies verbatim.
CREATE POLICY "Authenticated can read clinic_appointments"
  ON public.clinic_appointments FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "consultation_items_read_active"
  ON public.consultation_items FOR SELECT TO authenticated
  USING (deleted_at IS NULL);

CREATE POLICY "panel_claims_read_all"
  ON public.panel_claims FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Strict doctors and admins can view panel claims"
  ON public.panel_claims FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'doctor'));

CREATE POLICY "payments_read_active"
  ON public.payments FOR SELECT TO authenticated
  USING (deleted_at IS NULL);

CREATE POLICY "Strict doctors and admins can view payments"
  ON public.payments FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'doctor'));

-- Preserved voided policies are intentionally NOT touched by this rollback.

COMMIT;
