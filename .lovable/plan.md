

## Add Staff Nurse / Medical Assistant Appraisal Type

### Overview
Add a third appraisal type (`staff_nurse`) alongside the existing Doctor and Clinic Assistant types. The Staff Nurse/MA form uses the same competency-based structure as the Clinic Assistant (JSONB `competency_responses`), with its own 5 categories, 19 KPIs, and identical weights. Evaluator roles: Self, Manager, Peer (no Nursing).

### No database changes needed
The `appraisal_type` column already exists on `performance_appraisals` and accepts any text. The `competency_responses` JSONB column on `appraisal_responses` already handles dynamic competency structures.

### Constants — `src/lib/appraisalConstants.ts`

Add (all translated to English):

- `SN_EVALUATOR_ROLES`: `['Self', 'Manager', 'Peer']`
- `SN_COMPETENCY_CATEGORIES` — 5 categories, 4 indicators each:
  - **B1. Core Competency & Professional Certification**: Maintain valid APC annually; comply with Malaysian Nursing Board / Medical Assistant Board registration; complete required Credentialing & Privileging (e.g. Dorsal Slit Circumcision for MA); keep clinical knowledge current through CPD
  - **B2. Patient Management & Administration**: Greet patients warmly, register accurately, ensure zero duplicate registrations; manage appointments with ≤2% missed rate; handle daily financial records with zero billing errors; answer phone calls promptly and manage appointments efficiently
  - **B3. Patient Care & Clinical Procedures**: Perform and document vital signs (BP, temp, pulse, SpO2) accurately; perform clinical procedures (wound care, injections, blood draws, swabs, cannulation, ECG) per SOP; assist doctor in clinical procedures (I&D, antenatal, emergencies) safely; ensure 100% accuracy in room, injection, and equipment preparation
  - **B4. Clinic Maintenance & Inventory**: Maintain cleanliness of treatment rooms, counter area, and waiting area at all times; supervise medication and medical supply stock with weekly checks and no shortages; ensure medical equipment (nebulizer, ECG, etc.) is clean and faults reported within 24 hours; ensure all investigation data is entered into records system without errors
  - **B5. Patient Education & Professionalism**: Provide clear and effective health education to patients and families; provide emotional support to patients and ensure their comfort at all times; assist with clinic health promotion campaigns including monthly promotional videos; adhere to professional ethics, dress code, and patient confidentiality standards

- `SN_KPIS` — 19 KPIs with targets:
  1. Valid APC maintained annually (100%)
  2. Positive patient feedback rate (≥ 95%)
  3. Zero duplicate patient registrations (0 cases)
  4. Missed appointments ≤ 2% (≤ 2%)
  5. Phone answer rate (≥ 95%)
  6. Vital signs recording accuracy (≥ 95%)
  7. Billing accuracy — zero discrepancies (100%)
  8. Investigation data entered without errors (100%)
  9. Zero cleanliness complaints (0 complaints)
  10. Weekly stock checks with no shortages (100%)
  11. Equipment faults reported within 24 hours (≤ 24 hrs)
  12. FBC/blood draw count per month (> 30)
  13. Room/injection/equipment preparation accuracy (100%)
  14. Zero errors assisting doctor in procedures (0 errors)
  15. ILI swab compliance for eligible patients (> 80%)
  16. Zero procedural errors during clinical procedures (0 errors)
  17. Monthly promotional video produced (1 per month)
  18. Daily cleanliness maintained to standard (100%)
  19. C&P for Dorsal Slit Circumcision obtained (Obtained)

- `SN_SECTION_WEIGHTS`: B=0.30, C=0.40, D=0.10, E=0.10, F=0.10 (same as CA)

- Update `AppraisalType` to: `'doctor' | 'clinic_assistant' | 'staff_nurse'`
- Update `APPRAISAL_TYPE_LABELS` to include `staff_nurse: 'Staff Nurse / MA'`

### UI Changes

**`src/pages/staff/PerformanceAppraisal.tsx`**:
- Add `staff_nurse` to `typeColors` map
- The type selector dropdown already uses `APPRAISAL_TYPE_LABELS` so it will automatically show the new option

**`src/pages/staff/AppraisalForm.tsx`**:
- Add imports for `SN_COMPETENCY_CATEGORIES`, `SN_KPIS`, `SN_SECTION_WEIGHTS`, `SN_EVALUATOR_ROLES`
- Extend the conditional logic that currently checks `isCA` to also handle `isSN`:
  - `isSN` uses `SN_COMPETENCY_CATEGORIES` for Part B (rendered via the existing `CACompetencySection` component, which works for any competency category structure)
  - Part C uses `SN_KPIS`
  - Parts D, E, F, G same as existing
  - Weights use `SN_SECTION_WEIGHTS`
  - Evaluator roles use `SN_EVALUATOR_ROLES`
- Update title to show "Staff Nurse / Medical Assistant" when applicable
- Review panel adapts to show SN competencies

### Technical details
- The `CACompetencySection` component is generic enough to render any competency category array — it will be reused for SN without changes
- The `calcOverall` function in the Review panel needs to select correct weights based on appraisal type
- KPI initialization (`initKpis`) needs to branch for staff_nurse type

