# Defensive Cancellation — Final Wire-Up

DB migration, `ClinicStatus` union, and `VitalsEntryDialog` already shipped. This round wires the cancellation flow + Recently Cancelled drawer into the live `QueueBoard`.

## 1. New helper — `src/lib/clinic/redFlagVitals.ts`

`checkRedFlagVitals(vitals)` returns a short label or `null`. Thresholds (first match wins): BP > 180 sys OR > 120 dia → `"Critical BP: 190/130"`; SpO₂ < 92 (and > 0) → `"Critical SpO₂: 89%"`; HR > 130 → `"Critical HR: 142 bpm"`.

## 2. `src/hooks/clinic/useQueueEntries.ts` — three new exports

- `useCancelQueueEntry()` — resolves `auth.user`, pulls `full_name` from `profiles`, builds Malaysia-time `[CANCELLED <ts>] Reason: <reason> — by <name>` and appends to `visit_notes`. Writes `clinic_status='cancelled'`, `cancelled_at`, `cancelled_by`, `cancellation_reason`. Invalidates `queue-entries`, `consultation-queue-entries`, and `cancelled-today`. Sonner success/error toasts.
- `useRestoreQueueEntry()` — admin-only. Clears `cancelled_*`, sets `clinic_status='registered'`, appends `[RESTORED <ts>] by <name>`. Same invalidations.
- `useCancelledTodayEntries()` — query keyed `['clinic','queue-entries','cancelled-today']`. Today's `cancelled` rows with patient join, ordered by `cancelled_at desc`.

## 3. New component — `src/components/clinic/CancelQueueEntryDialog.tsx`

Props `{ open, onOpenChange, entry }`.

- Loads latest vitals via `useVitalSigns(entry.patient_id)`, runs `checkRedFlagVitals` on the most recent row.
- If red-flagged: destructive banner with the offending value + a required acknowledgment checkbox ("I have reviewed this patient's critical vitals and accept clinical responsibility for terminating the visit").
- Reason `RadioGroup`: LWBS, Called 3× — no response, Left before treatment, Duplicate / Registration error, Other. "Other" reveals a `Textarea` (required, min 5 chars).
- Header copy: *"This is a terminal action. The visit leaves the live board and appears in Recently Cancelled for the rest of today. If the patient returns, register a new visit."*
- Footer: "Keep Active" (ghost) + "Confirm Termination" (destructive). Confirm disabled until reason valid AND red-flag ack (when applicable) AND not pending.
- No staff-initials field — attribution auto-resolved in the hook.

## 4. `src/pages/clinic/QueueBoard.tsx` wiring

- Add `cancelOpen` state alongside `vitalsOpen`. Add `useCancelledTodayEntries()` + `useRestoreQueueEntry()` and resolve `isAdmin` from existing auth context (mirror the pattern used elsewhere on the board; if not present, derive via `useAuth().roles`).
- In the active-entry action stack, render a destructive **"Patient Absconded / Cancel"** button (ghost, rose) for any status in `['registered','ready_for_doctor','with_doctor','on_hold']`. Sits below existing buttons under a border-top divider.
- Mount `<CancelQueueEntryDialog>` once at the bottom alongside `<VitalsEntryDialog>`. On success → close sheet, clear `activeEntry`.
- Add a **collapsible "Recently Cancelled Today (N)"** section at the bottom of the board (default closed). Each row: `#queue_number patient_name`, time, reason. Admin users get a small **Restore** button per row → `useRestoreQueueEntry`.

## 5. Out of scope (deferred)

60-second sonner Undo, triage Red/Amber/Green priority, LWBS analytics dashboard, queue-number reset RPC.

## Files

- `src/lib/clinic/redFlagVitals.ts` (new)
- `src/components/clinic/CancelQueueEntryDialog.tsx` (new)
- `src/hooks/clinic/useQueueEntries.ts` (edited — three new hooks)
- `src/pages/clinic/QueueBoard.tsx` (edited — button, dialog mount, Recently Cancelled drawer)

No DB migration this round — schema already in place.
