

## Add Week Number Row to Roster Table

### What changes
Add a row above the day headers in the roster table that shows which ISO week each day belongs to (e.g., "Week 14", "Week 15"). The row will span columns that share the same week number using `colSpan`.

### Implementation — `src/pages/staff/admin/Roster.tsx`

Insert a new `<TableRow>` before the existing day-header row (line 525) that:
1. Computes week groups from `monthDays` using `getISOWeek(day)`
2. Renders merged `<TableHead>` cells with `colSpan` for consecutive days in the same week
3. Displays "Week {N}" centered across the span, with alternating background colors for visual distinction
4. Includes the sticky "Shift" column header cell at the start (empty or labeled)

### File changes
- 1 file edit: `src/pages/staff/admin/Roster.tsx` (lines ~524-536)

