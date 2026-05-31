## Goal
Add clock-out time + clock-out status to `/staff/admin/attendance-review` (drill-down table + CSV), per the snippets provided.

## File
`src/pages/staff/admin/AttendanceReview.tsx` only.

## Changes

### 1. Types
Add `ClockOutStatus = 'on_time' | 'early' | 'late' | 'missing' | 'na'` and extend `DetailRecord` with `expectedClockOut`, `actualClockOut`, `clockOutStatus`.

### 2. Helpers (module scope)
- `getClockOutSeverityClasses(status)` — emerald / amber / amber / rose / gray.
- `getClockOutStatusLabel(status)` — "On Time (Out)", "Early Clock-Out", "Late Clock-Out", "No Clock-Out", "-".

### 3. Day-loop computation (inside `stats` useMemo)
For each working day, compute alongside existing logic:
- `expectedClockOut = userShifts[dayStr]?.end ?? '17:00'`
- If `punchIn` exists:
  - `punchOut` present → format HH:mm, compare to expected end using `differenceInMinutes`:
    - `< -15` → `early`, `> 15` → `late`, else `on_time`
  - No `punchOut` and `dayStr < todayStr` → `missing`
  - No `punchOut` and `dayStr === todayStr` → `na`
- Leave / Absent rows → `na`, `-`, `-`.

Push fields into every `pushRecord(...)` call (working / late / leave / absent).

Note: use `date-fns` `differenceInMinutes` (add to existing import); build the expected-end Date from `new Date(`${dayStr}T${expectedClockOut}:00`)` (local-tz, matching how `punch_time` is parsed elsewhere). Use `punchOut.punch_time` (existing field), not `created_at`.

### 4. Drill-down table
Insert two columns after "Actual Clock-In": **Expected Clock-Out**, **Actual Clock-Out**. Replace the single Status cell with a stacked pair: existing lateness badge on top + clock-out badge below (hidden when `na`). Keep current tailwind utility classes (no new `Badge` import needed — reuse the existing `<span class="px-2 py-0.5 rounded-full text-xs font-medium ...">` pattern).

### 5. CSV export
Extend header to: `Full Name, Date, Expected Clock-In, Actual Clock-In, Expected Clock-Out, Actual Clock-Out, Lateness Duration, Work Hours, Clock-In Status, Clock-Out Status`. Map new fields per record using `getClockOutStatusLabel`.

## Out of scope
- No DB changes; `attendance_records` already carries `punch_type='out'`.
- Summary tiles, pie chart, Staff Summary table layout unchanged.
- ±15-minute on-time grace mirrors the existing lateness convention; no new admin setting.
