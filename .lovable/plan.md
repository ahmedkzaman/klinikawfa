## Goal
Per-patient panel balance/remarks note that persists on the `patients` record, is editable during check-in, and is always shown to doctors/dispensary regardless of today's payment method.

## 1. Database
Migration:
```sql
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS panel_remarks text;
```
`types.ts` regenerates automatically.

## 2. Shared schema — `src/components/clinic/patientFormSchema.ts`
- Add `panel_remarks: z.string().optional().nullable()` to the zod schema and TS type.

## 3. Registration check-in — `src/components/clinic/RegisterAndCheckInDialog.tsx`
- Add a `<Textarea>` **"Patient's Panel Balance / Remarks"** in the panel section. Helper: *"Record remaining balance or limits (e.g., 'Balance RM 21')."*
- Default form value: `''`.
- **Prefill**: `handleLoadExisting` must set `panel_remarks: existingPatient.panel_remarks ?? ''`.
- **Critical update fix**: today the "Load Existing" branch skips all patient mutations to protect demographics. Patch `onSubmit` so that when `loadedPatientId` is set:
  - Compare submitted `panel_remarks` (trim → null if empty) against `existingPatient.panel_remarks ?? null`.
  - If different, fire `updatePatient({ id: loadedPatientId, patch: { panel_remarks: <new value> } })` and `await` it **before** creating the queue entry. Surface the error if it fails (do not silently proceed).
  - All other demographic fields remain untouched.
- For the new-patient branch, include `panel_remarks` in the initial insert payload.

## 4. Other patient forms
Apply the same field + prefill + save (regular update mutation, no special branching) to:
- `src/components/clinic/RegisterPatientDialog.tsx`
- `src/components/clinic/EditPatientDialog.tsx`

## 5. New component — `src/components/clinic/PatientAlertBanner.tsx`
- Props: `patientName: string`, `remarks?: string | null`.
- Returns `null` if remarks is null/empty after trim.
- `<Alert>` styled `bg-blue-50 border-blue-500 text-blue-900`, `Info` icon (lucide-react), title `Patient Panel Note: {patientName}`, description = remarks with `whitespace-pre-wrap`.

## 6. Doctor & dispensary screens
`src/pages/clinic/ConsultationDetail.tsx` and `src/pages/clinic/DispenseCheckout.tsx`:
- Ensure the visit query selects `patients(name, panel_remarks)` (add to existing select or a small follow-up fetch).
- Render `<PatientAlertBanner>` directly **below** the amber `<PanelAlertBanner>` at the top of the content area.
- **Visibility rule**: show whenever `patient.panel_remarks` is non-empty — **independent of `entry.panel_id`**. A previously panel-covered patient now paying cash still needs the doctor to see the note (e.g., "Limit exhausted — cash only").

## 7. Out of scope
- No changes to `queue_entries`, RLS, triage notes, billing logic.
- Free-text only; no balance parsing/validation.

## Technical notes
- Banner order: amber (global panel rule) → blue (patient-level note) → existing content.
- The check-in update mutation only touches `panel_remarks` to preserve the existing "load existing record never overwrites demographics" guarantee.
- `types.ts` is auto-regenerated; do not hand-edit.
