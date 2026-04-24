

## Fix: Doctor name shows "—" on Dispense Checkout

### Root cause

The checkout page renders `entry.doctors?.name`, which comes from the `useConsultationQueueEntries` join on `assigned_doctor_id` (line 86 of `useQueueEntries.ts`). But in this clinic's flow, `assigned_doctor_id` is **never populated** — doctors are only stamped onto:

- `queue_entries.called_by_doctor_id` (when the doctor calls the patient in via `useCallPatient`)
- `consultations.doctor_id` (when the consultation row is created)

Confirmed against the live row for queue `1002`:
- `assigned_doctor_id` = `NULL` → join returns no row → "—"
- `called_by_doctor_id` = `a352d581…` → "Dr. Ahmed bin Kamarulzaman"
- `consultations.doctor_id` = same doctor

Diagnosis shows "—" for the same family of reasons: this consultation has empty `diagnosis_text` and null `diagnosis_id`, so there's genuinely nothing to show — not a bug, just empty data on this test record.

### Fix (single file)

**`src/hooks/clinic/useConsultations.ts`** — extend `useConsultation` to also fetch the doctor:

```ts
.select('*, diagnoses(id, name), doctors(id, name, avatar_url)')
```

No new query, no extra round-trip, and it matches the pattern already used by `usePatientConsultationHistory` in the same file.

**`src/pages/clinic/DispenseCheckout.tsx`** — change the Doctor field to prefer the consultation's doctor, then fall back to the queue's called/assigned doctor:

```ts
const doctorName =
  (consultation as { doctors?: { name?: string } } | undefined)?.doctors?.name
  ?? entry.doctors?.name
  ?? '—';
```

Render `<Field label="Doctor" value={doctorName} />`.

### Why not also fix the queue-entries join?

Switching the join to `called_by_doctor_id` would break callers that legitimately read `assigned_doctor_id` (e.g. roster/assignment views). Reading from the consultation — which is the source of truth for "who saw this patient" — is safer and zero-risk to other pages.

### Diagnosis field

Already has correct fallback logic (`diagnosis_text` then `diagnoses.name`). On this row both are empty, so "—" is the correct display. No change needed.

### Files touched

| File | Action |
|---|---|
| `src/hooks/clinic/useConsultations.ts` | Add `doctors(id, name, avatar_url)` to `useConsultation` select |
| `src/pages/clinic/DispenseCheckout.tsx` | Read doctor name from consultation first, fall back to queue join |

### Verification

1. Reload `/clinic/queue/checkout/0cc3c966-58d2-4b65-9273-7def001027f7` → "Doctor" shows **Dr. Ahmed bin Kamarulzaman**.
2. Diagnosis still shows "—" for this row (empty in DB) — populate diagnosis on a consultation and reload → name appears.
3. Other pages that use `useConsultation` (e.g. `ConsultationDetail.tsx`) still work; the new join is additive.
4. `tsc --noEmit` passes.

