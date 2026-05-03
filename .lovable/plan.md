# Add PM Shift Punch Buffer Settings

## Problem

`punch_buffer_settings` currently only supports two scopes: `global` and `role`. The same window applies whether a staff member is on:

- **S1 / AM** (08:00 – 16:00)
- **S2 / PM** (16:00 – 23:59)
- **Hybrid** (08:00 – 13:00)
- **Night** (20:00 – 23:59)

PM closers often need a longer "after shift end" buffer (cash-up, dispensary close) and a tighter "before shift start" window (to prevent overlap with the AM team still clocked in). Today there is no way to express this.

## Proposed Solution

Add a third scope: **`shift`** — overrides keyed by shift label (`S1`, `S2`, `Hybrid`, `Night`). Resolution priority becomes:

```text
role + shift   (most specific)
       │
   shift only
       │
   role only
       │
   global         (fallback)
```

## Changes

### 1. Database migration

- Extend `punch_buffer_settings.scope` to allow `'shift'` and `'role_shift'`.
- Add nullable `shift_key text` column (values: `S1`, `S2`, `Hybrid`, `Night`).
- Add unique index on `(scope, role, shift_key)` so each combination is single-row.
- Seed sensible PM defaults: `S2` → `clock_in_early_min=30`, `clock_out_late_min=180`.

### 2. `src/hooks/useUserPunchBuffers.ts`

- Accept an optional `shiftKey` argument: `useUserPunchBuffers(userId, shiftKey)`.
- Update resolver to walk the priority chain above (role+shift → shift → role → global).
- Today's shift can be looked up from `roster_zone_assignments` for the current date or passed in by the caller (Punch page already knows it).

### 3. `src/pages/staff/Punch.tsx`

- Pass the resolved shift key (from the active roster assignment) into `useUserPunchBuffers`.

### 4. `src/pages/staff/admin/PunchSettings.tsx`

- New section **"Per-Shift Overrides"** mirroring the Per-Role card, with a shift dropdown (`S1 / AM`, `S2 / PM`, `Hybrid`, `Night`).
- Update Add-Override dialog to optionally combine **Role + Shift** for the most specific overrides.
- Preview panel: render two example windows side-by-side — an 08:00–16:00 (AM) and 16:00–24:00 (PM) shift — so admins can sanity-check both.

## Out of scope

- Custom shift definitions (still hardcoded to S1/S2/Hybrid/Night).
- Auto-suggesting buffers based on historical punch data.

After approval I will run the migration, update the hook + Punch page, and rebuild the settings UI.
