## Investigation: Noraslinda's 4:10 PM punch-in block

### What the data says

- **Staff**: NORASLINDA BINTI ZAMRI (`3431b2d6…`), role `operations`
- **Roster for 2026-05-09**: `shift2`, zone Klinik Awfa, **16:00 – 23:59**
- **Resolved punch buffer** (scope=shift, S2): clock-in early `60 min`, **clock-in late `180 min`**
- **Expected punch-in window**: **15:00 – 19:00 MYT**
- **She tried at**: 16:10 MYT (well inside the window)
- **Yet the UI showed**: *"Punch-in window has closed…"* — this exact string is only emitted on line 244 of `src/pages/staff/Punch.tsx`, which fires when `now > activeShift.start + clock_in_late_min`

So per the current code/data she should have been allowed. Something between the device and the resolver produced a `closeAt` that was already in the past at 16:10. The plausible suspects (in priority order):

1. **Device clock or timezone wrong** — `new Date('2026-05-09T16:00:00')` is parsed as **local time**. If her phone was set to a TZ other than Asia/Kuala_Lumpur (or its clock was off by hours), `closeAt` and `now` end up in different reference frames.
2. **Stale roster row** — if her `roster_zone_assignments` row for May 9 had a different `start_time` earlier today and was later corrected, a cached app state could still hold the old start.
3. **Race in `useMemo`** — `pickActiveRosterShift` runs once with `bufferSettings=[]` before the settings query resolves, so the active shift's `buffers` snapshot can be `DEFAULT_BUFFERS` (60/60). With 60-min late, `closeAt` would be 17:00 — still allows 16:10, but tightens the margin enough that any clock skew would block.
4. **Wrong shift picked as active** — unlikely given current data (today's shift2 wins the iteration), but worth confirming with logs.

### Plan

```text
1. Add diagnostic logging on every blocked punch attempt
2. Make the resolver resilient to a stale/empty bufferSettings render
3. Surface the real numbers to the user so they (and we) can self-diagnose
4. Provide an admin escape hatch to record a manual punch (no schema change)
5. (Optional) Sanity-check device time against server time
```

#### Step 1 — Diagnostic logging (`src/pages/staff/Punch.tsx`)

When `guardMessage` resolves to the "Punch-in window has closed" branch:

- Log to `console.warn` (already exists) **and** insert a row into a new lightweight `punch_block_log` table with: `user_id`, `attempted_at` (server `now()`), `client_now` (ISO from device), `client_tz` (`Intl.DateTimeFormat().resolvedOptions().timeZone`), `shift_key`, `shift_start_iso`, `close_at_iso`, `clock_in_late_min`, `buffer_source` (`shift|role_shift|role|global|default`), `roster_row_count`. This gives us a forensic trail the next time it happens.

#### Step 2 — Make the resolver wait for buffers

In `pickActiveRosterShift` (and the `useMemo` in `Punch.tsx`), short-circuit and return `{ active: null, nearest: null, loading: true }` while either `bufferSettings` **or** `userRoles` query is still pending. Currently both default to `[]`, which silently downgrades to `DEFAULT_BUFFERS` on the first render — a real footgun. Track loading explicitly and gate `canPunch` on it.

#### Step 3 — Show the actual window in the UI

Below the "Active Shift" badge, render the resolved window: e.g., *"Punch open 15:00 – 19:00 (180-min late buffer)"*. When blocked, the helper text becomes *"Punch-in closed at 19:00. Your device shows {clientNow}. If those don't match, fix your phone's clock."* This exposes step-1 data to the staff member directly.

#### Step 4 — Admin manual-punch entry

Add a simple admin tool (already a stated requirement in `mem://features/hr-portal/attendance-tracking`) — but scoped here to: HR Portal → Attendance Review → row-level "Record manual punch" dialog that inserts an `attendance_records` row with `face_verified=false`, an `admin_note`, and the explicit `logical_work_date` + `shift_key`. (Trigger `trg_set_attendance_logical_fields` already handles defaults if omitted.) This unblocks staff in the moment without code changes per incident.

#### Step 5 — Optional: server-time check

On the Punch page mount, fetch `select now() as server_now` once. If `|server_now - client_now|` > 2 minutes, show a yellow warning *"Your device clock is X minutes off. Punch decisions use your device clock — please fix it before punching."* This catches 80% of cases like this one.

### Database changes

One small new table (with RLS):

```text
public.punch_block_log
  user_id          uuid
  attempted_at     timestamptz default now()
  client_now       timestamptz
  client_tz        text
  shift_key        text
  shift_start_iso  text
  close_at_iso     text
  clock_in_late_min int
  buffer_source    text
  roster_row_count int
  guard_reason     text
```

RLS: insertable by any authenticated user for their own row; readable by admins (`is_admin`).

### Files touched

- `src/pages/staff/Punch.tsx` — wait for loading, show window, log blocks
- `src/hooks/useUserPunchBuffers.ts` — expose `loading` from resolver path
- `src/components/staff/AttendanceReview/*` (new dialog) — admin manual-punch
- New migration: `punch_block_log` table + RLS

### Out of scope

- Changing the 60/180 buffer values (data, not code)
- Reworking how `roster_zone_assignments` are written (separate concern)

### What we'll learn

After deploy, the next "can't punch in" case will leave a row in `punch_block_log` with the device clock + TZ + chosen buffer source, and we'll know within seconds whether it's a clock issue, a stale roster, or a real bug in the resolver.
