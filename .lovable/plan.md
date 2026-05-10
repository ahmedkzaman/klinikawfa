## Goal

Turn the Queue Board into a complete clinical workflow: fix the carry-over visibility bug, add a Nurse Station triage step, and surface today's vitals to the doctor.

## 1. Fix carry-over visibility — `src/hooks/clinic/useQueueEntries.ts`

- Extract `ACTIVE_STATUSES` to a shared module-level const.
- Switch the `useQueueEntries` query from a strict `created_at >= startOfDay` filter to an OR condition so any entry in an active status remains visible regardless of registration date:
  ```
  .or(`created_at.gte.${startOfDay.toISOString()},clinic_status.in.(${ACTIVE_STATUSES.join(',')})`)
  ```
- Apply the same shared list to `useConsultationQueueEntries` for consistency.
- Preserve `useUpdateQueueEntry`, `useCallPatient`, `useCallToDispensary`, `useQueueEntry`, and the realtime channel subscriptions.

## 2. New component — `src/components/clinic/VitalsEntryDialog.tsx`

- Props: `open`, `onOpenChange`, `queueEntryId`, `patientId`.
- Reuses `useRecordVitalSigns()` (writes to `vital_signs`) and `useUpdateQueueEntry()`.
- Two-column layout:
  - **Circulation:** BP systolic, BP diastolic, Heart rate, Pain scale (0–10).
  - **Metabolic & Respiratory:** Temperature, SpO2, Weight, Height, Blood glucose. (Respiratory rate kept in state for future use.)
- All fields optional. Empty strings → `null`; otherwise `Number(v)`.
- Footer actions:
  - **Save Only** (ghost) — saves vitals, leaves status as `registered`.
  - **Save & Send to Doctor** (primary) — saves vitals, then flips `clinic_status='ready_for_doctor'`.
- Styled via `primaryBtn` from `@/lib/clinic/bentoTokens`. Semantic tokens only — no raw hex.
- Before including `pain_scale` in the insert, verify the `vital_signs` schema has the column; if missing, drop it from the payload (no DB migration this pass) and flag follow-up.

## 3. Wire `src/pages/clinic/QueueBoard.tsx`

- Add `vitalsOpen` state.
- In the `QUEUE_COLUMNS` map, when `col.key === 'registered'`, render an "Awaiting triage" subtitle in muted foreground beneath the column label.
- In the detail sheet, when `activeEntry.clinic_status === 'registered'`, replace the existing "Ready for Doctor" button with two stacked actions:
  - **Take Vitals / Triage** → opens `VitalsEntryDialog`.
  - **Skip Triage → Send to Doctor** → immediate `useUpdateQueueEntry` to `ready_for_doctor`, then close the sheet.
- Render `<VitalsEntryDialog />` once at the bottom, sourcing IDs from `activeEntry`.
- Keep "Open Checkout" and "On Hold" actions unchanged.

## 4. Doctor visibility — `src/components/clinic/consultation/VitalHistoryTrends.tsx`

In the vitals table row map, compute `isThisVisit = row.queue_entry_id === currentQueueId`. When true, apply a subtle accent background and append a "This visit" badge next to the timestamp so doctors instantly see today's triage versus historical readings.

## Files

- `src/hooks/clinic/useQueueEntries.ts` — shared `ACTIVE_STATUSES` + OR filter on board query
- `src/components/clinic/VitalsEntryDialog.tsx` — new
- `src/pages/clinic/QueueBoard.tsx` — column subtitle, triage + skip buttons, dialog wiring
- `src/components/clinic/consultation/VitalHistoryTrends.tsx` — "This visit" highlight

## Out of scope

- No DB migrations or enum changes.
- No changes to `QUEUE_COLUMNS` — `with_doctor` already has its own column; the perceived "vanishing" is the `created_at` filter, fixed in step 1.
