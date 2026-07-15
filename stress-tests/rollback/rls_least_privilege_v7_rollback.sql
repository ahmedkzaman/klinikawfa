-- =============================================================================
-- EMERGENCY ONLY — RLS Hardening v7 rollback.
--
-- Pre-v7 SELECT baseline across the four affected tables was EIGHT policies.
-- v7 dropped SIX of them and preserved TWO — both special_admin voided
-- policies:
--   * consultation_items_special_admin_read_voided
--   * payments_special_admin_read_voided
--
-- This script restores the six dropped policies verbatim from the captured
-- staging pre-state (name, role, permissiveness, command, USING, WITH CHECK).
-- The two preserved policies are NOT re-created here because v7 never
-- dropped them. `consultation_items_read_active` WAS dropped by v7 and is
-- restored below — it is not one of the preserved policies.
--
-- REVIEW-ONLY. Lives outside supabase/migrations/. Run manually only if the
-- v7 migration must be reverted.
-- =============================================================================

BEGIN;

-- 1. Drop v7 policies that depend on the new helpers.
DROP POLICY IF EXISTS "clinic_appointments_internal_read"       ON public.clinic_appointments;
DROP POLICY IF EXISTS "clinic_appointments_own_clinician_read"  ON public.clinic_appointments;
DROP POLICY IF EXISTS "consultation_items_active_read"          ON public.consultation_items;
DROP POLICY IF EXISTS "panel_claims_finance_admin_read"         ON public.panel_claims;
DROP POLICY IF EXISTS "payments_active_staff_read"              ON public.payments;
DROP POLICY IF EXISTS "payments_own_clinician_read"             ON public.payments;

-- 2. Drop v7 helpers.
DROP FUNCTION IF EXISTS public.is_current_user_consultation_doctor(uuid);
DROP FUNCTION IF EXISTS public.is_finance_admin();

-- 3. Restore the six prior policies. Each definition below matches the
--    captured pre-state (roles, permissive, cmd, qual, with_check) exactly.

-- clinic_appointments — role authenticated, USING(true), no WITH CHECK
CREATE POLICY "Authenticated can read clinic_appointments"
  ON public.clinic_appointments
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

-- panel_claims — role authenticated, USING(true), no WITH CHECK
CREATE POLICY "panel_claims_read_all"
  ON public.panel_claims
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

-- panel_claims — role public (NOT authenticated),
-- USING(has_strict_role(auth.uid(),'doctor'::text) OR is_admin(auth.uid()))
CREATE POLICY "Strict doctors and admins can view panel claims"
  ON public.panel_claims
  AS PERMISSIVE FOR SELECT TO public
  USING (
    public.has_strict_role(auth.uid(), 'doctor'::text)
    OR public.is_admin(auth.uid())
  );

-- payments — role authenticated, USING(deleted_at IS NULL), no WITH CHECK
CREATE POLICY "payments_read_active"
  ON public.payments
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (deleted_at IS NULL);

-- payments — role public, same doctor/admin check
CREATE POLICY "Strict doctors and admins can view payments"
  ON public.payments
  AS PERMISSIVE FOR SELECT TO public
  USING (
    public.has_strict_role(auth.uid(), 'doctor'::text)
    OR public.is_admin(auth.uid())
  );

-- consultation_items — role authenticated, USING(deleted_at IS NULL)
CREATE POLICY "consultation_items_read_active"
  ON public.consultation_items
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (deleted_at IS NULL);

-- Preserved policies (consultation_items_special_admin_read_voided,
-- payments_special_admin_read_voided) are intentionally NOT re-created.

COMMIT;
