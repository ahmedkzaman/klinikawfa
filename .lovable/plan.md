# Resident Doctor Role + Doctor-Specific Shifts (Final, with key-order fix)

## Step 1 — Database (split into two migrations)

### Migration A: enum value only (isolated)
```sql
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'resident_doctor';
```
Must commit before Migration B (Postgres forbids referencing a new enum value in the same transaction).

### Migration B: helpers + sync function + buffer seed

**Security helpers** — `resident_doctor` joins clinical/ops tier; deliberately NOT added to `is_admin` / `is_special_admin` / `can_view_insights`:
- `is_staff_or_admin` → add `'resident_doctor'`
- `is_ops_or_admin` → add `'resident_doctor'`
- `can_view_inventory_costs` → add `'resident_doctor'`

**`sync_roster_zone_assignments`** — extend the `CASE`:
```
WHEN 'DOC_S1' THEN start_t := '08:00'; end_t := '13:00';
WHEN 'DOC_S2' THEN start_t := '14:00'; end_t := '19:00';
WHEN 'DOC_S3' THEN start_t := '20:00'; end_t := '23:59';
```

**Punch buffer seed — DELETE-then-INSERT** (avoids NULL unique-constraint trap):
```sql
DELETE FROM public.punch_buffer_settings
WHERE (scope = 'role'  AND role = 'resident_doctor')
   OR (scope = 'shift' AND shift_key IN ('DOC_S1','DOC_S2','DOC_S3'));

INSERT INTO public.punch_buffer_settings
  (scope, role, shift_key, clock_in_early_min, clock_in_late_min, clock_out_early_min, clock_out_late_min)
VALUES
  ('role',  'resident_doctor', NULL,    60, 240, 30, 180),
  ('shift', NULL,              'DOC_S1', 60, 180, 30, 120),
  ('shift', NULL,              'DOC_S2', 60, 180, 30, 120),
  ('shift', NULL,              'DOC_S3', 60, 180, 30, 120);
```

## Step 2 — `src/contexts/AuthContext.tsx`
- Add `'resident_doctor'` to `AppRole`.
- `isStaffOrAdmin`, `isOpsOrAdmin`, `isClinical` → include `resident_doctor`.
- `isAdmin`, `canViewInsights`, `isSpecialAdmin` → unchanged.

## Step 3 — `src/lib/rosterUtils.ts`
Add to `SHIFT_TIMES`:
```ts
DOC_S1: { start: '08:00', end: '13:00', label: 'Doctor S1 (8am – 1pm)' },
DOC_S2: { start: '14:00', end: '19:00', label: 'Doctor S2 (2pm – 7pm)' },
DOC_S3: { start: '20:00', end: '23:59', label: 'Doctor S3 (8pm – 12am)' },
```
`normalizeShiftKey` passes `DOC_S1/2/3` through unchanged.

## Step 4 — `src/pages/staff/admin/PunchSettings.tsx`
- Extend `ShiftKey`, `SHIFT_OPTIONS`, `SHIFT_LABEL`, `SHIFT_RANGE` with `DOC_S1` (480–780), `DOC_S2` (840–1140), `DOC_S3` (1200–1440).
- Add `resident_doctor` to `ROLE_LABEL` + role dropdown.

## Step 5 — `src/components/staff/roster/DoctorRosterPanel.tsx`

**Read side:** When loading `saved_rosters`, accept both legacy keys (`shift1/2/3`) and new keys (`DOC_S1/2/3`). Each in-memory cell carries:
- `originalShiftKey` — the exact key it was loaded under (or `null` if newly added)
- `userExplicitlyChangedShift` — flipped to `true` whenever the admin reassigns the doctor in that cell via the manual `<Select>`

**Save side — preserve legacy state, but honor active intent first (CRITICAL — corrected order):**
```ts
const keyForCell = (cell, columnDefault) => {
  // 1. Active intent overrides history: admin reassigned → graduate to new key
  if (cell.userExplicitlyChangedShift) return columnDefault;

  // 2. Preserve untouched legacy cells
  if (cell.originalShiftKey?.startsWith('shift')) return cell.originalShiftKey;

  // 3. Preserve untouched new cells (already DOC_S*)
  if (cell.originalShiftKey) return cell.originalShiftKey;

  // 4. Brand-new cell from empty state → new key
  return columnDefault;
};
```
- Column defaults: `DOC_S1 / DOC_S2 / DOC_S3`.
- Auto-generation flows always start from blank state and therefore always emit `DOC_S*`.
- Net effect: opening May (legacy `shift1` cells), tweaking only May 20 → May 1–19 cells are saved back as `shift1/2/3`; May 20 (admin-reassigned) graduates to `DOC_S1`.

**Other UI changes:**
- Column headers updated to "Doctor S1 / S2 / S3".
- Hours math for new doctor shifts: S1=5h, S2=5h, S3=4h, daytime block=10h. Legacy `shift1/2/3` cells continue to use the existing 6/6/4 math so historical totals stay correct.
- `Roster.tsx` (CA/SN/MA) is untouched.

## Step 6 — `src/pages/clinic/settings/UserManagementSettings.tsx`
- Add `resident_doctor: 'Resident Doctor'` to label map.
- Add `<SelectItem value="resident_doctor">Resident Doctor</SelectItem>` in both the existing-user role picker and the Add User/Locum dialog.

## Step 7 — `src/pages/staff/admin/Employees.tsx`
- Add `<SelectItem value="resident_doctor">Resident Doctor</SelectItem>` to the role dropdown.

## Files touched
- 2 migrations (enum-only; helpers + sync + buffers)
- `src/contexts/AuthContext.tsx`
- `src/lib/rosterUtils.ts`
- `src/pages/staff/admin/PunchSettings.tsx`
- `src/components/staff/roster/DoctorRosterPanel.tsx`
- `src/pages/clinic/settings/UserManagementSettings.tsx`
- `src/pages/staff/admin/Employees.tsx`

## Verification
1. Special admin can assign "Resident Doctor" from User Management and Employees.
2. Logged in as `resident_doctor`: Queue / Consultation / Billing / Dispensary open; User Management + global settings hidden; HR portal renders staff-tier views.
3. Doctor Roster auto-generate writes `DOC_S1/2/3`; `roster_zone_assignments` shows 08:00–13:00, 14:00–19:00, 20:00–23:59.
4. Open a month with legacy `shift1` cells, change the doctor on one cell, save → that cell graduates to `DOC_S1`, all other days remain stored as `shift1/2/3`.
5. Resident-doctor punch screen honors 240-min late clock-in / 180-min late clock-out windows.
