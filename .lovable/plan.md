

## Plan: Auto-sync Zone Assignments from Roster (Realtime)

### Problem
Right now `staff_zone_assignments` is fully manual. The roster (`saved_rosters`) already knows who works which shift on which day, but assignments don't reflect it. User wants assignments to follow the roster automatically and update in realtime when the roster changes.

### Design decisions
- **One zone for now** — only "Klinik Awfa" exists in `geofence_zones`, so every roster shift maps to that single active zone. (Future: allow per-shift or per-staff zone overrides.)
- **Day-specific assignments** — the current schema treats an assignment as a recurring weekly pattern (`days_of_week`, `start_time`, `end_time`). The roster is per-date, so we need date-specific records. I'll add a new table `roster_zone_assignments` (date + shift + user + zone + start/end) instead of overloading `staff_zone_assignments`. The manual `staff_zone_assignments` stays as a fallback/override.
- **Source of truth** — `saved_rosters.roster_data` (keyed by `yyyy-MM-dd`, with `shift1` / `shift2` / `hybrid` arrays of `{staffId, staffName}`).
- **Shift → time mapping**:
  - `shift1` → 08:00–16:00
  - `shift2` → 16:00–00:00
  - `hybrid` → 08:00–13:00
  - Doctor `Daytime` → 08:00–20:00, `S3` → 20:00–00:00 (kept for compatibility)
- **Realtime trigger** — DB trigger on `saved_rosters` (INSERT/UPDATE/DELETE) regenerates the matching month's `roster_zone_assignments` rows automatically. UI also subscribes via Supabase Realtime so the Assignments page refreshes live.

### What I'll build

1. **DB migration**
   - New table `roster_zone_assignments` (`id`, `user_id`, `zone_id`, `work_date`, `shift_key`, `start_time`, `end_time`, `source` = `'roster'` | `'manual'`, `created_at`).
   - Unique constraint on `(user_id, work_date, shift_key)`.
   - RLS: admins manage all; staff view own.
   - Function `public.sync_roster_zone_assignments(month int, year int)` — wipes roster-sourced rows for that month and rebuilds from `saved_rosters`.
   - Trigger on `saved_rosters` AFTER INSERT/UPDATE/DELETE → calls the sync function for the affected month/year.
   - Enable realtime publication on `roster_zone_assignments` and `saved_rosters`.

2. **Frontend updates** (`src/pages/staff/admin/Assignments.tsx`)
   - Add a second tab: **"Roster-based (auto)"** vs **"Manual recurring"**.
   - Auto tab: month picker + table grouped by staff showing date / shift / time / zone, read-only with a "Re-sync from roster" button (calls the sync RPC).
   - Subscribe to `roster_zone_assignments` realtime channel — live refresh on roster edits.
   - Manual tab keeps the existing `staff_zone_assignments` UI unchanged.

3. **Punch flow** (`src/pages/staff/Punch.tsx` — quick check) — if it currently looks up the user's assignment to validate location, extend the lookup to first check `roster_zone_assignments` for today, then fall back to `staff_zone_assignments`. (Will inspect during implementation.)

4. **Code comments** — mark migrated logic and the realtime subscription clearly.

### What stays the same
- UI structure of the existing Manual assignments tab.
- All existing manual `staff_zone_assignments` rows.
- Roster generation logic untouched.

### Files touched
- New migration (table + function + trigger + realtime publication).
- `src/pages/staff/admin/Assignments.tsx` (add tabs + auto view + realtime).
- Possibly `src/pages/staff/Punch.tsx` (extend zone lookup).

### Out of scope (flag for later)
- Per-staff custom zones (e.g., housecall nurse working from a different zone).
- Mapping the legacy `S1`/`S2`/`Daytime` shift keys to manual assignments — only relevant if you ever store roster data with those keys.

