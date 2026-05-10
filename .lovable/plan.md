# Daily Queue Numbers + Triage Doctor Assignment

## Stress-test responses

1. **Midnight carry-over** — Treated as a feature, not a bug. A `260509-99` ticket showing alongside `260510-01` is correct: the date prefix proves the carry-over and lets the doctor see who has been waiting the longest. No extra logic needed; the existing "active OR today" filter already keeps these visible.
2. **Doctor FK** — Verified. `queue_entries.assigned_doctor_id` is a UUID FK to `public.doctors.id` (not `auth.users`). `useDoctors()` returns rows from the same table, so `doc.id` is the correct value to write.
3. **TV overflow** — Will downsize the queue-number font in `QueueTV.tsx` (and let the row reflow naturally) so the 9-character `YYMMDD-NN` string fits without wrapping on 1080p.

## TV behaviour on Unassign

Patient simply moves back to the "Registered/Awaiting" column on the next polling tick. No flash overlay this round — staff at the front desk will redirect verbally. We can layer a flash notification later once we measure how often this actually happens.

## 1. Database migration

```sql
CREATE OR REPLACE FUNCTION public.get_next_queue_number()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE next_num integer;
BEGIN
  PERFORM pg_advisory_xact_lock(
    ('x' || to_char(CURRENT_DATE,'YYYYMMDD'))::bit(32)::int
  );
  SELECT COALESCE(MAX(queue_sequence), 0) + 1
    INTO next_num
  FROM public.queue_entries
  WHERE created_at::date = CURRENT_DATE;
  RETURN next_num;
END;
$$;
```

Also patch `intake_appointment_to_queue(...)` to call `get_next_queue_number()` and store `queue_sequence` in the same transaction. Legacy `queue_number` column stays untouched (audit continuity).

## 2. New formatter

**`src/lib/clinic/queueNumber.ts`**
```ts
import { format } from 'date-fns';
export const formatQueueNo = (createdAt: string | Date, seq: number | null) => {
  if (seq == null) return '—';
  try {
    const d = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
    return `${format(d, 'yyMMdd')}-${String(seq).padStart(2, '0')}`;
  } catch { return '—'; }
};
```

## 3. Walk-in / Register insert paths

**`src/hooks/clinic/useQueueEntries.ts`** — in the create mutations used by `CheckInWalkInDialog` and `RegisterAndCheckInDialog`, call `supabase.rpc('get_next_queue_number')` first, then include `queue_sequence` in the insert payload. Listing order switches to `created_at, queue_sequence`.

## 4. Triage doctor assignment

**`src/components/clinic/VitalsEntryDialog.tsx`**
- shadcn `Select` "Attending Doctor" populated by `useDoctors()`.
- Local `assignedDoctorId` state, reset on dialog close.
- "Save & Send to Doctor" disabled until a doctor is selected. "Save Only" stays enabled.
- On send, the same `updateQueue.mutateAsync` call also writes `assigned_doctor_id`.

## 5. QueueBoard + TV visuals

- **QueueCard** (`QueueBoard.tsx`): `formatQueueNo(entry.created_at, entry.queue_sequence)` replaces `#{queue_number}`. Below the patient name:
  - `Attending: Dr. {entry.doctors?.name}` in slate-600 when assigned.
  - `Awaiting Assignment` in amber-600 italic when null and status is `registered`.
- **Detail-sheet header** + **Recently Cancelled drawer**: same formatter.
- **`QueueTV.tsx`**: include `queue_sequence, created_at` in the select; render via formatter; reduce queue-number font size to fit the longer string.

## 6. Admin "Unassign Doctor" recovery

In the QueueBoard detail sheet, admin-only button visible when `assigned_doctor_id` is set:
- Sets `assigned_doctor_id = NULL`, `clinic_status = 'registered'`.
- Appends `[REASSIGN <Malaysia ts>] Doctor unassigned — returning to registered pool.` to `visit_notes`.
- Closes the sheet and shows an info toast.

## Out of scope

- Auto-load-balancer / round-robin assignment.
- SMS / TV flash on reassignment.
- Backfilling `queue_sequence` for historical rows.
- Retiring the legacy `queue_number` sequence.
