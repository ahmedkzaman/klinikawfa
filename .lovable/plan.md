

## Add Clinic Assistant Performance Appraisal

### Overview
Add a second appraisal type for clinic assistants alongside the existing doctor appraisal. The clinic assistant form has different competency categories, KPIs, weights, and evaluator roles (Self, Manager, Peer — no Nursing).

### Database Changes (1 migration)

1. Add `appraisal_type` column to `performance_appraisals` (text, default `'doctor'`, not null)
2. Add `competency_responses` JSONB column to `appraisal_responses` (default `'{}'::jsonb`) — stores `{criteriaKey: {rating: number, evidence: string}}` for clinic assistant ratings (avoids adding 20+ new columns per role type)

### Constants — `src/lib/appraisalConstants.ts`

Add clinic assistant data (all in English):

- `CA_EVALUATOR_ROLES`: `['Self', 'Manager', 'Peer']`
- 5 competency categories, each with 4 indicators:
  - **A1. Patient Management**: Customer service greeting, patient registration, appointment scheduling, phone handling
  - **A2. Clinic Administration**: Patient records (Yezza), billing & cash, vital signs recording, daily reports
  - **A3. Maintenance & Inventory**: Cleanliness, stock management (FIFO), equipment maintenance, weekly inventory checks
  - **A4. Procedure Assistance**: Room & equipment preparation, doctor consultation support, procedure assistance, ILI swab compliance
  - **A5. Additional Duties & Professionalism**: Monthly promo videos, patient education, ethics & dress code, teamwork & initiative
- `CA_KPIS`: 15 KPIs with targets (positive patient feedback ≥95%, zero duplicate registrations, missed appointments ≤2%, phone answer rate ≥95%, vital signs accuracy >95%, billing accuracy 100%, zero cleanliness complaints, weekly stock checks 100%, stock above threshold >95%, equipment reports ≤24hrs, room prep 100%, zero procedure errors, ILI swab >80%, monthly promo video, daily cleanliness 100%)
- `CA_SECTION_WEIGHTS`: B=0.30, C=0.40, D=0.10, E=0.10, F=0.10

### UI Changes

**`src/pages/staff/PerformanceAppraisal.tsx`**:
- Add appraisal type selector (Doctor / Clinic Assistant) in create dialog
- Pass `appraisal_type` when inserting
- Show appraisal type badge on cards
- Change label from "Doctor" to "Staff"

**`src/pages/staff/AppraisalForm.tsx`**:
- Read `appraisal.appraisal_type` to determine which form to show
- For clinic assistants:
  - Part B renders the 5 competency categories using `competency_responses` JSONB (not individual columns)
  - Part C (KPIs) uses `CA_KPIS` instead of `DOCTOR_KPIS`
  - Parts D (Attendance) and E (Patient Feedback) use the same data fields as existing
  - Part F (Development) reuses existing dev objectives logic
  - Weights use `CA_SECTION_WEIGHTS`
  - Evaluator roles use `CA_EVALUATOR_ROLES` (no Nursing option)
- Title changes from "360° Doctor Performance Appraisal" to reflect actual type
- Review panel adapts to show clinic assistant competencies when applicable

### No routing changes needed
Same routes serve both types; the form adapts based on `appraisal_type`.

