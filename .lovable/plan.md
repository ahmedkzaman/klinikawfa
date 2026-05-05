# Punch Buffer Loosening + Late-Arrival Guard

## 1. Migration: `punch_buffer_settings` data updates

Use the insert tool (data-only, no schema changes). The `app_role` enum has `doctor_admin` and `locum` (no `doctor` role exists, so skip it).

```sql
-- Clinical role buffers (240 min late clock-in, 180 min late clock-out)
INSERT INTO public.punch_buffer_settings
  (scope, role, shift_key, clock_in_early_min, clock_in_late_min, clock_out_early_min, clock_out_late_min)
VALUES
  ('role', 'doctor_admin', NULL, 60, 240, 30, 180),
  ('role', 'locum',        NULL, 60, 240, 30, 180)
ON CONFLICT (scope, role, shift_key) DO UPDATE SET
  clock_in_early_min  = EXCLUDED.clock_in_early_min,
  clock_in_late_min   = EXCLUDED.clock_in_late_min,
  clock_out_early_min = EXCLUDED.clock_out_early_min,
  clock_out_late_min  = EXCLUDED.clock_out_late_min;

-- S2: bump late clock-in to 180 (keep existing late clock-out = 120)
UPDATE public.punch_buffer_settings
SET clock_in_late_min = 180
WHERE scope = 'shift' AND shift_key = 'S2';

-- S3: new shift-scope row
INSERT INTO public.punch_buffer_settings
  (scope, role, shift_key, clock_in_early_min, clock_in_late_min, clock_out_early_min, clock_out_late_min)
VALUES
  ('shift', NULL, 'S3', 60, 180, 30, 120)
ON CONFLICT (scope, role, shift_key) DO UPDATE SET
  clock_in_late_min   = EXCLUDED.clock_in_late_min,
  clock_out_late_min  = EXCLUDED.clock_out_late_min;
```

Note: if the table lacks a unique constraint on `(scope, role, shift_key)`, we'll fall back to a `DELETE … WHERE … ; INSERT …` pattern in the same statement. Will check before running.

## 2. No roster auto-backfill

Skip. Admins will fix May 2 / May 4 gaps via the Roster UI.

## 3. UX safety net — `src/pages/staff/Punch.tsx`

In the `guardMessage` useMemo, when `nextPunchType === 'in'` and `now > closeAt`:

- Replace the current `"Punch-in closed at …"` message with:  
  **"Punch-in window has closed. Please ask the administrator to record a manual entry."**
- Add `console.warn('Blocked late punch-in attempt', { userId: user?.id, shift: activeShift.shiftKey, time: now });` right before returning the message.
- Behavior unchanged: button stays disabled (it already disables when `guardMessage` is non-null).

The existing logic already keeps the button disabled even when `now` is still inside the wall-clock shift end — only the message text and telemetry change.

## 4. Admin helper text — `src/pages/staff/admin/PunchSettings.tsx`

Add a small muted-text line directly under each `clock_in_late_min` input:

> Tip: Clinical staff often arrive late due to prior consults. We recommend ≥180 mins for doctors and evening shifts.

Will locate the input(s) and place a `<p className="text-xs text-muted-foreground mt-1">…</p>` underneath.

## Files touched
- `supabase` data migration (insert tool, not schema)
- `src/pages/staff/Punch.tsx` (guard message + telemetry)
- `src/pages/staff/admin/PunchSettings.tsx` (helper text)

## Verification
After applying:
1. Re-query `punch_buffer_settings` to confirm the 4 rows (doctor_admin, locum, S2, S3).
2. Confirm a doctor_admin attempting punch-in 3h late sees the new message and the console warning fires.
3. Confirm PunchSettings UI shows the new tip under the late clock-in field.

Stop after migration + UI changes; await user confirmation.
