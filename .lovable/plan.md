# Clinical Triage + Defensive LWBS Protocol (final)

Incorporates: auto-resolved staff identity, hard red-flag block before LWBS, and a "Recently Cancelled (today)" drawer with admin restore.

## 1. Database migration

```sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'clinic_status' AND e.enumlabel = 'cancelled'
  ) THEN
    ALTER TYPE clinic_status ADD VALUE 'cancelled';
  END IF;
END $$;

ALTER TABLE public.queue_entries
  ADD COLUMN IF NOT EXISTS cancelled_at        timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by        uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS cancellation_reason text;
```

`ACTIVE_STATUSES` (already exported) deliberately excludes `cancelled`, so cancelled entries leave the live board immediately.

## 2. `VitalsEntryDialog.tsx` (new)

- Two-column grid — Circulation (BP sys/dia, HR, Pain 0–10) and Metabolic & Respiratory (Temp °C, SpO₂, Weight, Height, Glucose).
- Empty inputs serialise to `null`, otherwise `Number(v)`.
- Hooks: `useRecordVitalSigns()` + `useUpdateQueueEntry()`.
- Footer:
  - **Save Only** (ghost) — vitals only.
  - **Save & Send to Doctor** (primary) — vitals, then status → `ready_for_doctor`.
- `pain_scale` kept in UI state; included in payload only if the column exists.

## 3. Red-flag check (shared helper)

New `src/lib/clinic/redFlagVitals.ts`:

```ts
export function isRedFlag(v?: { bp_systolic?: number|null; bp_diastolic?: number|null; spo2?: number|null; heart_rate?: number|null }) {
  if (!v) return null;
  if ((v.spo2 ?? 100) < 92)                              return 'SpO₂ < 92%';
  if ((v.bp_systolic ?? 0) > 180 || (v.bp_diastolic ?? 0) > 120) return 'BP > 180/120';
  if ((v.heart_rate ?? 0) > 130)                          return 'HR > 130 bpm';
  return null;
}
```

Used by the cancellation dialog to gate destructive submit.

## 4. `CancelQueueEntryDialog.tsx` (new) — terminate visit

- Props: `open`, `onOpenChange`, `queueEntry`.
- Reason `RadioGroup`: LWBS, Called 3× — no response, Left before treatment complete, Duplicate/Error, Other (with required textarea).
- **Red-flag block (mandatory):** on open, fetches the latest `vital_signs` row for `queue_entry_id`. If `isRedFlag()` returns a label:
  - Renders a destructive alert banner ("⚠ Critical vitals on file: SpO₂ < 92% — clinical review required").
  - Confirm button is replaced by a 2-step pattern: a checkbox "I have attempted to retain this patient and documented the clinical risk" must be ticked before the destructive **Confirm Cancellation** unlocks.
  - This is a hard UI block, not a soft toast.
- Staff identity is **auto-resolved** (no input field): the mutation looks up the current user's display name (profiles → fallback email → `'Staff'`) and writes the line `\n\n[CANCELLED <ISO>] <reason> — by <name>` into `visit_notes`.
- Header copy: *"This action is final. The entry will leave the active board. The cancellation appears in 'Recently Cancelled' for the rest of today."*

## 5. `useQueueEntries.ts` updates

- `useCancelQueueEntry()` mutation — resolves `auth.user`, looks up `profiles.full_name`, builds the `[CANCELLED ...]` line, then updates `clinic_status='cancelled'`, `cancelled_at`, `cancelled_by`, `cancellation_reason`, and the appended `visit_notes`. Invalidates board + consultation queues + the new cancelled-today query.
- `useRestoreQueueEntry()` mutation — admin-only on the client (gated by role check); clears `cancelled_*` columns, sets `clinic_status='registered'`, and appends `\n\n[RESTORED <ISO>] by <name>` to `visit_notes`.
- `useCancelledTodayEntries()` query — `clinic_status='cancelled'` AND `cancelled_at >= startOfDay`; subscribes to the same realtime channel.

## 6. `QueueBoard.tsx` wiring

- New state: `vitalsOpen`, `cancelOpen`.
- Detail-sheet action stack:
  - `registered` → **Take Vitals / Triage** (primary) above existing **Skip Triage → Send to Doctor**.
  - For all active statuses except `completed`/`cancelled` → divider + destructive **Patient Absconded** opens `CancelQueueEntryDialog`.
- New collapsible **"Recently Cancelled (today)"** drawer at the bottom of the board:
  - Lists each cancelled entry with patient name, queue #, `cancelled_at` time, reason, and (admin only) a **Restore** button.
  - Powered by `useCancelledTodayEntries()`.
- Render `VitalsEntryDialog` and `CancelQueueEntryDialog` once at page bottom.

## Out of scope

- Pre-cancel red-flag toast for non-critical vitals (the hard block covers the liability case).
- 60-second sonner Undo (superseded by the drawer's Restore action).
- Triage priority Red/Amber/Green.
- `safe_reset_queue_number_seq()` doesn't need changes — `cancelled` already isn't in its active set.
- LWBS-rate analytics dashboard.

## Files

- **Migration:** enum value + 3 audit columns.
- **New:** `src/lib/clinic/redFlagVitals.ts`.
- **New:** `src/components/clinic/VitalsEntryDialog.tsx`.
- **New:** `src/components/clinic/CancelQueueEntryDialog.tsx`.
- **Edited:** `src/hooks/clinic/useQueueEntries.ts` — `useCancelQueueEntry`, `useRestoreQueueEntry`, `useCancelledTodayEntries`.
- **Edited:** `src/pages/clinic/QueueBoard.tsx` — triage + absconded buttons, Recently Cancelled drawer, dialog wiring.
