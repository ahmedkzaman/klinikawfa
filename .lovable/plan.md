

## Add Performance Appraisal Feature (Doctors)

### Overview
Add a "Performance Appraisal" item under the collapsible Applications section in the staff sidebar. Digitizes the 360° Medical Doctor Performance Appraisal form from the uploaded document. Doctors can complete self-appraisals; supervisors/admins complete the appraiser evaluations.

### Database (2 new tables via migration)

**`performance_appraisals`** — One record per appraisal cycle per doctor
- `id`, `doctor_id` (uuid, references profiles), `appraisal_period_from` (date), `appraisal_period_to` (date), `date_of_appraisal` (date nullable), `status` (text, default 'draft' — draft/submitted/reviewed/completed), `overall_weighted_score` (numeric nullable), `created_by` (uuid), `created_at`, `updated_at`
- RLS: staff can view own, admin can view/manage all

**`appraisal_responses`** — Each evaluator's submission (self, manager, peer, nursing)
- `id`, `appraisal_id` (uuid FK to performance_appraisals), `evaluator_id` (uuid), `evaluator_role` (text — 'Self', 'Manager', 'Peer', 'Nursing'), `status` (text, default 'draft')
- Part B ratings: `clinical_knowledge_rating`, `diagnostic_accuracy_rating`, `treatment_planning_rating`, `procedural_competence_rating`, `clinical_documentation_rating`, `guidelines_adherence_rating`, `medication_management_rating`, `emergency_response_rating` (all int nullable) + corresponding `_evidence` text columns
- Part B summary: `clinical_strength_summary` (text), `clinical_development_summary` (text)
- Part C metrics: `patient_satisfaction_score` (numeric), `patient_reviews_count` (int), `patient_complaints_count` (int), `complaints_resolved` (int), `complaints_pending` (int)
- Part C ratings: `patient_communication_rating`, `compassion_empathy_rating`, `informed_consent_rating`, `response_complaints_rating`, `cultural_sensitivity_rating` (all int nullable) + `_evidence` text columns
- Part C summary: `challenging_case_summary` (text)
- Part D metrics: `total_working_days`, `days_present`, `approved_leave_days`, `unapproved_absences`, `late_arrivals`, `early_departures` (all int nullable)
- Part D ratings: `ontime_arrival_rating`, `schedule_adherence_rating`, `absence_notification_rating`, `oncall_compliance_rating` (int nullable) + `_evidence` text columns
- Part D summary: `attendance_overall_comments` (text)
- Part E: `kpi_responses` (jsonb — array of {kpi_number, target, actual_result, status, comments})
- Part F: `section_b_score`, `section_c_score`, `section_d_score`, `section_e_score` (numeric nullable)
- Part G: `development_objectives` (jsonb — array of {objective, action, resources, target_date, success_measure})
- `created_at`, `updated_at`
- RLS: evaluators can view/edit own responses, admin can manage all

### New Files

**`src/pages/staff/PerformanceAppraisal.tsx`** — Main page with:
- List of appraisals for current user (as doctor or evaluator)
- Admin can create new appraisal cycles for doctors
- Card-based list showing status, period, score

**`src/pages/staff/AppraisalForm.tsx`** — Multi-step form with tabs matching document parts:
- Tab per Part (B through G), each rendering rating inputs (1-5 radio/select), text areas for evidence, and metric inputs
- Self-evaluation fields shown to the doctor; appraiser fields shown to supervisor/admin
- Auto-calculates Part F weighted score (B=30%, C=30%, D=20%, E=20%)
- Save as draft or submit

### Route & Navigation Changes

**`src/components/staff/StaffLayout.tsx`**:
- Add `{ href: '/staff/appraisal', label: 'Performance Appraisal', icon: ClipboardCheck }` to `applicationsNavItems`

**`src/App.tsx`**:
- Add route `<Route path="appraisal" element={<PerformanceAppraisal />} />`
- Add route `<Route path="appraisal/:id" element={<AppraisalForm />} />`

### Permissions Logic
- **Doctors** see their own appraisals and can fill in the "Self" evaluator role sections
- **Admin/Supervisors** can create appraisal cycles, assign evaluators, and fill in Manager/Peer/Nursing evaluator sections
- Rating fields are disabled/read-only based on evaluator role match

### KPI Definitions (hardcoded for doctors)
The 13 KPIs from the document are stored as a constant array with their targets, rendered dynamically in the Part E tab.

