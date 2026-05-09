# Per-Staff Summary List on Attendance Review

Add a searchable per-staff summary table on `/staff/admin/attendance-review` so typing in the "Search staff…" box produces visible results immediately, instead of only changing pie-chart totals.

## Scope
Single file: `src/pages/staff/admin/AttendanceReview.tsx`. No DB or schema changes.

## Changes

### 1. Build a per-staff summary in `useMemo`
Alongside the existing `stats` aggregator, compute a parallel array `staffSummaries: StaffSummary[]` derived from `filteredProfiles` + `attendance` + `leaveRequests` + `allShifts` for the selected month:

```text
type StaffSummary = {
  userId: string;
  fullName: string;
  position: string | null;
  present: number;
  late: number;     // minor_late + late combined
  absent: number;
  leave: number;
  workingDays: number;
};
```

Reuse the existing day-loop logic (working days, leave overlap check, lateness severity) — just bucket per `profile.id` instead of into global counters.

### 2. Render a new "Staff Summary" table (always visible)
Insert a new bento card between the Filters row and the existing pie-chart card. It shows:

| Name (avatar + full_name/email) | Position | Present | Late | Absent | Leave | Action |

- Sorted by full name asc by default.
- Live-filtered by the existing `searchQuery` and `positionFilter` (no new state needed).
- Empty-state row when `staffSummaries.length === 0`: "No staff match your search."
- Each row's "Action" cell: a small "View details" button that opens the existing drill-down for that staff, scoped to ALL their records this month (combined working/leave/absent/late).

### 3. Extend the drill-down to support a per-staff view
Currently `drillDown` is one of `'working' | 'leave' | 'absent' | 'late'`. Widen it to also accept `{ kind: 'staff'; userId: string; fullName: string }`:

- When set to a staff object, `drillDownRecords` returns every record belonging to that user across all four buckets, sorted by date asc.
- Drill-down header shows `"<Full Name> — All Records (<count>)"` instead of a category label.
- Existing chart-slice click behavior (filter by category) is unchanged.
- `ChevronLeft` back button clears `drillDown` either way.

### 4. Cosmetic polish
- Use the bento token classes already in the file (`bento`, `bentoHeader`, `softInput`) so the new card matches the page.
- Lateness/absent counts colored with the same soft palette already used (rose for late/absent, emerald for present, blue for leave).
- Compact row height; mobile: horizontal scroll wrapper (the existing drill-down already uses `overflow-x-auto`).

## Out of scope
- Changing how the pie chart calculates totals.
- Adding new filters (date range, status filter) — the existing month + position filters stay.
- Backend or RLS changes — `profiles`, `attendance_records`, and `leave_requests` queries are reused as-is.

## Verification
1. Open `/staff/admin/attendance-review`. The new "Staff Summary" table appears above the pie chart.
2. Type a staff name → table filters live; pie totals also update (existing behavior).
3. Click "View details" on a row → drill-down opens showing every working/leave/absent/late row for that staff for the month.
4. Click a pie-chart slice → drill-down still works as before (filtered by category).
5. Change month or position filter → both the summary table and the pie chart update consistently.
