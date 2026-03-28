

## Update Roster Generator — Monthly, First Names, No Unassigned, Manual Edits

### Changes to `src/pages/staff/admin/Roster.tsx`

#### 1. First names only
- When displaying staff in roster cells, show only the first name: `name.split(' ')[0]`
- Staff list sidebar still shows full name for clarity

#### 2. No unassigned slots
- Change the generator algorithm: if no eligible staff remain (due to hour limits), relax constraints and pick the least-assigned staff member instead of leaving "Unassigned"
- Fallback order: (1) skip hour-cap filter → (2) pick staff with fewest hours that week
- Add a warning note when someone exceeds 48h due to forced assignment, but never leave a slot empty

#### 3. Manual editing of roster
- Make each roster cell clickable — clicking opens a dropdown/select populated with all staff in that roster type
- Selecting a different staff member updates the roster state in place
- Summary table recalculates automatically on any manual change

#### 4. Monthly basis following current month's calendar
- Replace the week picker with a **month picker** (month/year selector)
- Generate roster for all days in the selected month (defaulting to current month)
- Replace `DAYS` constant with dynamically computed days from `startOfMonth` to `endOfMonth`
- Roster table columns = all days of the month (scrollable horizontally), with day name + date header
- Each column header shows day abbreviation (Mon, Tue...) + date number
- Summary recalculates for the full month (total shifts, total hours, weekly averages)
- Update CSV export and print to reflect monthly data

### Algorithm update
```text
For each day in month:
  For each shift (1, 2):
    - Build eligible pool (not assigned that day)
    - Apply weekday constraint if enabled
    - Apply hour cap if enabled (48h/week — tracked per ISO week)
    - If eligible pool empty → pick least-assigned staff (force assign + add warning)
    - Randomly pick from eligible pool
```

Hours tracking changes from flat total to **per-week tracking** (since a month spans 4-5 weeks). The 45-48h rule applies per calendar week within the month.

### File changes
- 1 file edit: `src/pages/staff/admin/Roster.tsx`
- No database changes

