## Goal
A single clinical-age helper shown next to the patient identity across all clinical views, derived purely from `date_of_birth`. No DB changes.

## 1. New helper — `src/lib/clinic/clinicalAge.ts`
```ts
export function calculateClinicalAge(dob?: string | null): string {
  if (!dob) return 'Age: Unknown';
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return 'Age: Unknown';
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();
  if (now.getDate() < birth.getDate()) months -= 1;
  if (months < 0) { years -= 1; months += 12; }
  if (years < 0) return 'Age: Unknown';
  if (years < 1) return `${Math.max(months, 0)}m`;
  if (years <= 3) return `${years}y ${months}m`;
  return `${years}y`;
}
```
Wrapped in try/catch at call sites is unnecessary because the helper itself never throws.

The existing one-off `formatAge` in `src/pages/clinic/Consultation.tsx` will be removed in favor of this helper.

## 2. Patient banners (inject `(Age: …)` next to DOB/IC)
- **Patient profile** — `src/components/patients/PatientProfileSheet.tsx` (DOB row at line 338).
- **Consultation banner** — `src/pages/clinic/ConsultationDetail.tsx` (DOB chip at line 1173–1174).
- **Dispensary checkout banner** — `src/pages/clinic/DispenseCheckout.tsx` (header block around the DOB `Field`, lines 285–348).
- **Visit / Billing banner** — `src/pages/clinic/VisitDetail.tsx` (DOB display around lines 90–122; this is the invoice/visit view powering Billing).

Each shows `(Age: 45y)` (or `Age: Unknown`) right after the formatted DOB text.

## 3. Queue surfaces
- **`src/pages/clinic/QueueBoard.tsx`** — append the age next to patient name at lines 86, 266, 303.
- **`src/pages/clinic/Consultation.tsx`** — replace local `formatAge` import/use with the new helper (line 55 + line 306).

## 4. Document templates (MC / Referral)
Single insertion point: `src/components/clinic/consultation/IssueDocumentModal.tsx`, in the `substitutions` map (line 58):
- Add `'{{patient_age}}': calculateClinicalAge(patient?.date_of_birth)`.
- Update the help text in `src/pages/clinic/settings/DocumentTemplates.tsx` to advertise the new `{{patient_age}}` token alongside `{{patient_name}}`.

Templates that already exist keep working; new MC / Referral templates can include `{{patient_age}}` to print the live age at issue time.

To do this, `IssueDocumentModal` needs the patient's `date_of_birth`. Confirm the `patient` prop type includes it — extend the local Patient type / select if needed (frontend-only).

## 5. Drug labels — `src/lib/clinic/printDrugLabel.ts`
- Extend `generateDrugLabelPdf(items, patientName, toggles, clinic, patientDob?)` with an optional `patientDob?: string | null` argument. When provided, compose the display name as `${patientName} (${calculateClinicalAge(dob)})` before truncation logic at line 170.
- Update the three callers:
  - `src/components/clinic/visit/VisitDetailsColumn.tsx` (pass `patient?.date_of_birth`).
  - `src/pages/clinic/settings/DrugLabelSettings.tsx` (preview — pass `null`, prints `AHMAD BIN ABU` unchanged).
  - `src/components/clinic/settings/PrinterCalibration.tsx` (calibration — pass `null`).
- Receipt's `PrintReceiptDialog` / `ReceiptTemplate` already render the patient header — extend `ReceiptData` with optional `patientAge: string` and append `(Age: …)` after the name in `ReceiptTemplate` (line 99). `PrintReceiptDialog` computes it from the fetched patient DOB.

## Constraints honored
- No DB column added; everything derives from `date_of_birth`.
- Helper short-circuits on missing/invalid DOB → `Age: Unknown`. No app-crash path; no `try/catch` boilerplate needed.
- Existing UI text and layout otherwise untouched.

## Out of scope
- Translations / BM labels for "Age" (matches existing English-only chips).
- Editing saved document content retroactively — only newly-issued docs get the live age.
- Changes to RLS, hooks, or printDocument printing pipeline.
