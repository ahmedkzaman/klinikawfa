-- ============================================================
-- Internal-Staff Segregation: DB Layer
-- Helper + precision RLS on HR-only tables.
-- Locums legitimately use attendance/roster tables — those are
-- intentionally NOT touched here.
-- ============================================================

-- 1. Helper: caller is a permanent employee (NOT locum, NOT guest).
--    Exclusion-style: any future permanent role inherits access automatically.
CREATE OR REPLACE FUNCTION public.is_internal_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text NOT IN ('locum', 'guest')
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_internal_staff(uuid) TO authenticated;

-- ============================================================
-- 2. CIRCULAR NOTICES — replace is_staff_or_clinical (which admits locums)
-- ============================================================
DROP POLICY IF EXISTS "Staff can view active notices" ON public.circular_notices;
CREATE POLICY "Internal staff can view active notices"
  ON public.circular_notices FOR SELECT
  TO authenticated
  USING (is_active = true AND public.is_internal_staff(auth.uid()));

-- ============================================================
-- 3. CIRCULAR ACKNOWLEDGEMENTS — close missing WITH CHECK + gate self ops
-- ============================================================
DROP POLICY IF EXISTS "Staff can insert own acknowledgements" ON public.circular_notice_acknowledgements;
CREATE POLICY "Internal staff can insert own acknowledgements"
  ON public.circular_notice_acknowledgements FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_internal_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can view own acknowledgements" ON public.circular_notice_acknowledgements;
CREATE POLICY "Internal staff can view own acknowledgements"
  ON public.circular_notice_acknowledgements FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id AND public.is_internal_staff(auth.uid()));

-- ============================================================
-- 4. LEAVE REQUESTS — close missing WITH CHECK + gate all self ops
-- ============================================================
DROP POLICY IF EXISTS "Staff can insert leave" ON public.leave_requests;
CREATE POLICY "Internal staff can insert own leave"
  ON public.leave_requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_internal_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can view own leave" ON public.leave_requests;
CREATE POLICY "Internal staff can view own leave"
  ON public.leave_requests FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id AND public.is_internal_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can update own pending leave" ON public.leave_requests;
CREATE POLICY "Internal staff can update own pending leave"
  ON public.leave_requests FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id AND status = 'pending' AND public.is_internal_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can delete own pending leave" ON public.leave_requests;
CREATE POLICY "Internal staff can delete own pending leave"
  ON public.leave_requests FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id AND status = 'pending' AND public.is_internal_staff(auth.uid()));

-- ============================================================
-- 5. STAFF ONBOARDING — restrict self-manage to permanent employees
-- ============================================================
DROP POLICY IF EXISTS "Users can manage own onboarding" ON public.staff_onboarding;
CREATE POLICY "Internal staff can manage own onboarding"
  ON public.staff_onboarding FOR ALL
  TO authenticated
  USING (auth.uid() = user_id AND public.is_internal_staff(auth.uid()))
  WITH CHECK (auth.uid() = user_id AND public.is_internal_staff(auth.uid()));

-- ============================================================
-- 6. APPRAISAL RESPONSES — close missing WITH CHECK + gate self ops
-- ============================================================
DROP POLICY IF EXISTS "Evaluator can insert own responses" ON public.appraisal_responses;
CREATE POLICY "Internal evaluator can insert own responses"
  ON public.appraisal_responses FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = evaluator_id AND public.is_internal_staff(auth.uid()));

DROP POLICY IF EXISTS "Evaluator can view own responses" ON public.appraisal_responses;
CREATE POLICY "Internal evaluator can view own responses"
  ON public.appraisal_responses FOR SELECT
  TO authenticated
  USING (evaluator_id = auth.uid() AND public.is_internal_staff(auth.uid()));

DROP POLICY IF EXISTS "Evaluator can update own draft responses" ON public.appraisal_responses;
CREATE POLICY "Internal evaluator can update own draft responses"
  ON public.appraisal_responses FOR UPDATE
  TO authenticated
  USING (evaluator_id = auth.uid() AND status = 'draft' AND public.is_internal_staff(auth.uid()));

-- ============================================================
-- 7. PAYROLL self-view trio — gate to internal (admin ALL policies untouched)
-- ============================================================
DROP POLICY IF EXISTS "Staff can view own payroll profile" ON public.staff_payroll_profiles;
CREATE POLICY "Internal staff can view own payroll profile"
  ON public.staff_payroll_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id AND public.is_internal_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can view own payroll summaries" ON public.monthly_payroll_summaries;
CREATE POLICY "Internal staff can view own payroll summaries"
  ON public.monthly_payroll_summaries FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id AND public.is_internal_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can view own attendance payroll" ON public.attendance_payroll_records;
CREATE POLICY "Internal staff can view own attendance payroll"
  ON public.attendance_payroll_records FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id AND public.is_internal_staff(auth.uid()));

-- ============================================================
-- 8. PERFORMANCE APPRAISALS self-view — gate to internal
-- ============================================================
DROP POLICY IF EXISTS "Staff can view own appraisals" ON public.performance_appraisals;
CREATE POLICY "Internal staff can view own appraisals"
  ON public.performance_appraisals FOR SELECT
  TO authenticated
  USING (doctor_id = auth.uid() AND public.is_internal_staff(auth.uid()));