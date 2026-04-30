## Goal

Replace hardcoded ±30 min punch window in `src/pages/staff/Punch.tsx` with admin-configurable buffers, with global defaults and optional per-role overrides. Single-clinic for now (no per-site, since only one geofence zone is currently configured), but design the schema so per-zone overrides can be added later without rework.

## Scope

- New admin Settings page: **Staff → Admin → Punch Settings**
- New DB table: `punch_buffer_settings` (one global row + optional per-role rows)
- `Punch.tsx` reads settings from DB instead of hardcoded ±30 min
- Asymmetric buffers (separate values for clock-in pre/post and clock-out pre/post)

## Buffer model

Four configurable values (in minutes):

| Field | Meaning | Default |
|---|---|---|
| `clock_in_early_min` | Allowed minutes BEFORE shift start to punch in | 60 |
| `clock_in_late_min` | Allowed minutes AFTER shift start to punch in (still records lateness) | 60 |
| `clock_out_early_min` | Allowed minutes BEFORE shift end to punch out | 30 |
| `clock_out_late_min` | Allowed minutes AFTER shift end to punch out (records OT) | 120 |

## DB schema

New table `public.punch_buffer_settings`:

```text
id                    uuid pk
scope                 text  -- 'global' or 'role'
role                  app_role nullable  -- only set when scope='role'
clock_in_early_min    int  not null default 60
clock_in_late_min     int  not null default 60
clock_out_early_min   int  not null default 30
clock_out_late_min    int  not null default 120
updated_at            timestamptz default now()
updated_by            uuid nullable

unique(scope, role)  -- one global, one per role
check (scope in ('global','role'))
check ((scope='global' and role is null) or (scope='role' and role is not null))
check (all four values between 0 and 480)
```

Migration also seeds one `scope='global'` row with the defaults above.

RLS:
- SELECT: any authenticated user (Punch page needs to read)
- INSERT/UPDATE/DELETE: `is_admin(auth.uid())` only

Resolution rule (computed in app code): for a given user, look up their highest-priority role; if a `role` row exists for it, use that; otherwise fall back to the `global` row.

## Frontend changes

### 1. New page `src/pages/staff/admin/PunchSettings.tsx`
- Card showing current global values, 4 number inputs (1 row each with label + helper text)
- Section below: "Per-role overrides" — list of existing role rows, an "Add override" button that opens a dialog (role dropdown + 4 inputs)
- Edit / Delete actions per role row
- Saves via standard supabase client (admin RLS enforces auth)
- Live preview line: "A staff with shift 8:00 AM – 4:00 PM can punch in between 7:00 AM and 9:00 AM, and punch out between 3:30 PM and 6:00 PM."

### 2. New hook `src/hooks/useUserPunchBuffers.ts`
- Fetches all `punch_buffer_settings` rows once
- Looks up user's role from `user_roles`
- Returns the resolved 4 values (role override → global → hardcoded fallback)

### 3. Update `src/pages/staff/Punch.tsx` (lines 107-120)
- Use `useUserPunchBuffers()` instead of literal `30 * 60 * 1000`
- Replace symmetric check with asymmetric (in vs out aware) logic
- `shiftWindowBlock` message becomes friendlier, e.g.:
  - "Punch-in opens at 7:00 AM (1 hour before your 8:00 AM shift)"
  - "Punch-out closed at 6:00 PM (2 hours after your 4:00 PM shift)"

### 4. Wire up routing
- Add route `/staff/admin/punch-settings` in `src/App.tsx` (admin-protected)
- Add nav entry in `src/components/staff/StaffLayout.tsx` admin section: "Punch Settings" with `Clock` or `Timer` icon

## Why per-role and not per-site

You currently have one active `geofence_zone`. Per-site overrides add UI complexity for zero benefit today. The schema reserves `scope` so a future `'zone'` scope can be added with a one-line migration when you open a second site. Per-role is useful immediately because doctors, nurses, and admin staff have different punctuality realities (e.g., a doctor finishing late deserves a longer clock-out window than a CA).

## Files touched

- new `supabase/migrations/<ts>_punch_buffer_settings.sql`
- new `src/pages/staff/admin/PunchSettings.tsx`
- new `src/hooks/useUserPunchBuffers.ts`
- edited `src/pages/staff/Punch.tsx` (replace `isWithinShiftWindow`)
- edited `src/App.tsx` (add route)
- edited `src/components/staff/StaffLayout.tsx` (add nav item)

## Out of scope

- Per-zone overrides UI (schema-ready, not built)
- Editing buffers per individual employee (use role overrides)
- Changing how lateness or OT is recorded (handled separately by `getLatenessSeverity` and `calculateDailyWorkHours` — untouched)
