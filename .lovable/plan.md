## Add Roster Generator to Admin Section

### Overview

Create a new page at `/staff/admin/roster` that allows admins to randomly generate weekly shift rosters with configurable rules and staff constraints. Entirely client-side logic — no database tables needed (roster data is generated on-the-fly, exportable via CSV/print).

### New Files

`**src/pages/staff/admin/Roster.tsx**` — Main page with 4 sections:

1. **Staff List Section**: Add/edit/delete staff names in a card. Staff list stored in component state (seeded from `profiles` table where position is set). Each staff entry shows name and position.
2. **Rule Selection Section**: Card with checkboxes:
  - Maximum 45 working hours per week per staff. Any more than 45 hours will be considered as Over Time (this will be documented at a part of the roster)
  - Use fixed shift hours (Shift 1: 8am–4pm, Shift 2: 4pm–12am)
  - Selected staff can only work Shift 1 on weekdays (constraint toggle)
  - Selected staff can still be assigned Shift 2 on weekends
3. **Constraint Setup Section**: Multi-select dropdown to pick which staff members have the weekday Shift 1 restriction. Only visible when the constraint rule checkbox is enabled.
4. **Generated Roster Section**:
  - Week picker (select any Monday–Sunday week)
  - "Generate Roster" button runs the randomization algorithm
  - Weekly table: columns = Mon–Sun, rows = Shift 1 / Shift 2, cells = assigned staff names
  - Summary table below: staff name, total shifts, total hours
  - Warning banner if constraints make full assignment impossible
  - Buttons: "Generate Again", "Clear Roster", "Export to CSV", "Print Roster"

### Generator Algorithm (client-side)

```text
For each day (Mon–Sun):
  For each shift (1, 2):
    - Build eligible staff pool (not already assigned that day)
    - Apply constraint: if weekday + constrained staff → exclude from Shift 2
    - If max-hours rule enabled, exclude staff at/over 45hrs
    - Randomly pick one staff from eligible pool
    - If no eligible staff, mark cell as "Unassigned" + add warning
```

### Routing & Navigation

- `**src/App.tsx**`: Add route `admin/roster` under staff portal
- `**src/components/staff/StaffLayout.tsx**`: Add "Roster" nav item in admin section with `CalendarDays` icon

### File Changes Summary

- 1 new file: `src/pages/staff/admin/Roster.tsx`
- 2 edits: `App.tsx` (add route), `StaffLayout.tsx` (add nav item)
- No database changes