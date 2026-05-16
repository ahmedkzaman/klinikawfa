## Goal

The patient profile sheet currently shows visits as `#1017`, `#1015`, `#1014` — the old raw `queue_number` integer. The project standard (already used on QueueBoard) is `formatQueueNo(created_at, queue_sequence)` which renders `260516-01`. Make every screen use the new format and remove all remaining references to the legacy `queue_number` integer in the UI.

## Files to change

**1. Fix the screen in the screenshot**
- `src/components/patients/PatientProfileSheet.tsx` — replace `#{row.queue_number ?? '—'}` with `formatQueueNo(row.created_at, row.queue_sequence)`.
- `src/hooks/patients/usePatientVisitHistory.ts` — extend the select list and TypeScript row type to include `queue_sequence`.

**2. Other UI surfaces using the old format**
- `src/pages/clinic/ConsultationDetail.tsx` (`Q{entry.queue_number}`) → `formatQueueNo(entry.created_at, entry.queue_sequence)`
- `src/pages/clinic/DispenseCheckout.tsx` (`Queue #{entry.queue_number}`) → same
- `src/pages/clinic/VisitDetail.tsx` (`Queue #{entry.queue_number}`) → same
- `src/pages/clinic/Consultation.tsx` line 309 (`{entry.queue_number ?? i + 1}`) → same
- `src/pages/clinic/Billings.tsx` line 139 (passes `queueNumber` into row) → swap to formatted string; verify downstream column rendering.
- `src/pages/clinic/VoidedRecords.tsx` line 94-95 (uses `queue_number` for display sort) → switch to formatted string built from `created_at + queue_sequence`.
- `src/components/clinic/CancelQueueEntryDialog.tsx` line 82 → same.

**3. Hooks supplying the data**
- `src/hooks/clinic/usePayments.ts` — already selects `created_at`; add `queue_sequence` to select and type so `Billings.tsx` can format.
- Any other consumer that reads `queue_number` for display must also pull `queue_sequence` + `created_at`.

**4. Cleanup**
- After the swap, the `queue_number` column itself is no longer used in the UI. Leave the DB column intact (legacy data / audit), but remove `queue_number` fields from the TypeScript row interfaces of the hooks above so future code can't accidentally use it for display. (No DB migration.)

## Out of scope

- The DB `queue_number` column and the `get_next_queue_number` RPC remain (they back `queue_sequence` generation and historical records).
- Printed slips / receipts are not in this change unless they currently render `queue_number`; will verify during implementation and include if found.

## Verification

- Reopen the patient sheet — visits should read like `260516-01` instead of `#1017`.
- Spot-check Consultation, Dispense Checkout, Visit Detail, Billings, Voided Records, and Cancel dialog: all show the new format.
- `rg "queue_number" src` should return only hook/DB-layer references, not JSX.
