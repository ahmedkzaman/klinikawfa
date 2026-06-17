
-- Create performance_appraisals table
CREATE TABLE public.performance_appraisals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  appraisal_period_from date NOT NULL,
  appraisal_period_to date NOT NULL,
  date_of_appraisal date,
  status text NOT NULL DEFAULT 'draft',
  overall_weighted_score numeric,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create appraisal_responses table
CREATE TABLE public.appraisal_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appraisal_id uuid NOT NULL REFERENCES public.performance_appraisals(id) ON DELETE CASCADE,
  evaluator_id uuid NOT NULL,
  evaluator_role text NOT NULL,
  status text NOT NULL DEFAULT 'draft',

  -- Part B: Clinical Skills ratings (1-5)
  clinical_knowledge_rating int,
  clinical_knowledge_evidence text,
  diagnostic_accuracy_rating int,
  diagnostic_accuracy_evidence text,
  treatment_planning_rating int,
  treatment_planning_evidence text,
  procedural_competence_rating int,
  procedural_competence_evidence text,
  clinical_documentation_rating int,
  clinical_documentation_evidence text,
  guidelines_adherence_rating int,
  guidelines_adherence_evidence text,
  medication_management_rating int,
  medication_management_evidence text,
  emergency_response_rating int,
  emergency_response_evidence text,
  clinical_strength_summary text,
  clinical_development_summary text,

  -- Part C: Patient Satisfaction metrics
  patient_satisfaction_score numeric,
  patient_satisfaction_source text,
  patient_reviews_count int,
  patient_complaints_count int,
  complaints_resolved int,
  complaints_pending int,
  -- Part C ratings
  patient_communication_rating int,
  patient_communication_evidence text,
  compassion_empathy_rating int,
  compassion_empathy_evidence text,
  informed_consent_rating int,
  informed_consent_evidence text,
  response_complaints_rating int,
  response_complaints_evidence text,
  cultural_sensitivity_rating int,
  cultural_sensitivity_evidence text,
  challenging_case_summary text,

  -- Part D: Attendance metrics
  total_working_days int,
  days_present int,
  approved_leave_days int,
  unapproved_absences int,
  late_arrivals int,
  early_departures int,
  -- Part D ratings
  ontime_arrival_rating int,
  ontime_arrival_evidence text,
  schedule_adherence_rating int,
  schedule_adherence_evidence text,
  absence_notification_rating int,
  absence_notification_evidence text,
  oncall_compliance_rating int,
  oncall_compliance_evidence text,
  attendance_overall_comments text,

  -- Part E: KPIs (JSONB array)
  kpi_responses jsonb DEFAULT '[]'::jsonb,

  -- Part F: Scores
  section_b_score numeric,
  section_c_score numeric,
  section_d_score numeric,
  section_e_score numeric,

  -- Part G: Development Plan (JSONB array)
  development_objectives jsonb DEFAULT '[]'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.performance_appraisals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appraisal_responses ENABLE ROW LEVEL SECURITY;

-- RLS for performance_appraisals
CREATE POLICY "Admin can manage all appraisals" ON public.performance_appraisals
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Staff can view own appraisals" ON public.performance_appraisals
  FOR SELECT TO authenticated USING (doctor_id = auth.uid());

-- RLS for appraisal_responses
CREATE POLICY "Admin can manage all responses" ON public.appraisal_responses
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Evaluator can view own responses" ON public.appraisal_responses
  FOR SELECT TO authenticated USING (evaluator_id = auth.uid());

CREATE POLICY "Evaluator can insert own responses" ON public.appraisal_responses
  FOR INSERT TO authenticated WITH CHECK (evaluator_id = auth.uid());

CREATE POLICY "Evaluator can update own draft responses" ON public.appraisal_responses
  FOR UPDATE TO authenticated USING (evaluator_id = auth.uid() AND status = 'draft');

-- Triggers for updated_at
CREATE TRIGGER update_performance_appraisals_updated_at
  BEFORE UPDATE ON public.performance_appraisals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_appraisal_responses_updated_at
  BEFORE UPDATE ON public.appraisal_responses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
