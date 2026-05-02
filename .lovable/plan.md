## Goal

Two related improvements to the Staff Roster admin page:

1. Allow admins to clear (set to "None") any shift cell — currently only Shift 1 has the "— None —" option in the dropdown.
2. Add a Public Holidays selector in the Rules section. Days marked as public holidays will be excluded from auto-generation (no staff assigned) and visually flagged in the roster grid.

## Task 1 — Allow "None" in all shifts

**Support roster (`src/pages/staff/admin/Roster.tsx`)**
- Add the `<SelectItem value="__none__">— None —</SelectItem>` option to Shift 2's dropdown (line ~1175). The `updateCell` handler already supports `__none__` for both `shift1` and `shift2`, so no logic change is needed.

**Doctor roster (`src/components/staff/roster/DoctorRosterPanel.tsx`)**
- Add `— None —` option to all three dropdowns (Shift 1, Shift 2, Shift 3 around lines 977, 1005, 1033).
- Update `updateCell` (line 601) to handle the `__none__` value: when received, set the corresponding shift cell to `undefined` (since cells are stored as nullable single objects in this panel) and still record a manual override.

## Task 2 — Public Holidays in Rules

**Schema (new migration)**
Create a new table:

```sql
public.public_holidays (
  id uuid pk,
  holiday_date date unique not null,
  name text not null,
  created_by uuid,
  created_at timestamptz default now()
)
```
RLS: staff/admin can `SELECT`; admin only can `INSERT`/`UPDATE`/`DELETE`.

**Rules section UI (`Roster.tsx`)**
- Add a new card "Public Holidays" inside the Rules grid.
- Show holidays that fall in the currently selected month/year as removable chips.
- "Add holiday" inline form: date picker + name input + Add button → inserts to `public.public_holidays`.
- Persist a local Set of `yyyy-MM-dd` keys derived from the fetched holidays.

**Generator behaviour (`Roster.tsx`)**
- In `generateRoster`, when iterating each `dateKey`, if the date is a public holiday:
  - Skip auto-assignment for `shift1`, `shift2`, and `hybrid` (insert empty cells / undefined hybrid).
  - Skip the day in the balancing pass as well.
  - Add an info warning entry: "5 Nov: Public holiday — no staff assigned".

**Grid rendering**
- In the table cell wrapper for each day column, when the date is a public holiday, apply a subtle red/orange tint (`bg-destructive/5`) and show a small "PH" badge under the date header.
- Empty cells on PH days still render the dropdown so admins can manually assign someone if needed (the "None" option from Task 1 supports clearing back).

**Doctor roster (`DoctorRosterPanel.tsx`)**
- Same treatment: holidays cause shift1/shift2/shift3 to be left empty during generation; PH badge shown on the date header.

## Out of scope

- No automatic Malaysia federal/state holiday import — admins add them manually.
- No payroll-side public holiday pay multipliers (existing payroll logic untouched).

## Files touched

- `src/pages/staff/admin/Roster.tsx` (None option in S2, Public Holidays card, generator skip, grid styling)
- `src/components/staff/roster/DoctorRosterPanel.tsx` (None option in S1/S2/S3, updateCell handling, PH styling)
- New migration: `public_holidays` table + RLS
- New hook: `src/hooks/usePublicHolidays.ts` (list, add, remove)