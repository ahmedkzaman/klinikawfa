## Daily Report Integration with Roster + Admin Daily Task Review

### What We're Building

1. **Staff Daily Report Card** — show tasks only for staff on duty today, separated by AM (S1: 8am–2pm) and PM (S2: 2pm–8pm) shift
2. **Roster synchronization** — the `DailyReportsSummary` (admin) and `DailyReportingCard` (staff) both read from `saved_rosters` to determine who is working and on which shift
3. **Admin Daily Task Review page** — new page at `/staff/admin/daily-tasks` with a month & staff filter to review all daily report submissions historically. allow admin to download report for filtered staff
4. **Month filter on admin dashboard** — admin can filter the daily reports summary by month

### How Roster Integration Works

The `saved_rosters` table stores roster data keyed by date (e.g., `2026-03-01`) with `shift1` (AM) and `shift2` (PM) arrays containing `{staffId, staffName}`. We cross-reference today's date against the saved roster to:

- Only show the daily reporting card to staff who are on duty today
- Group staff by AM/PM shift in the admin summary
- Hide the card entirely for staff who are off duty

### File Changes

**Edit: `src/components/staff/DailyReportingCard.tsx**`

- On mount, fetch today's roster from `saved_rosters` to check if current user is assigned a shift
- If not on duty, show a message "You are not on duty today" instead of the reporting form
- Display which shift the user is on (AM/PM) at the top of the card

**Edit: `src/components/staff/DailyReportsSummary.tsx**`

- Fetch today's roster to get on-duty staff and their shifts
- Replace the current "all profiles" query with roster-filtered staff only
- Separate the table into two sections: AM Shift and PM Shift
- Add a month/year picker to filter historical daily reports
- When viewing past months, fetch that month's roster + daily reports

**Create: `src/pages/staff/admin/DailyTaskReview.tsx**`

- Full-page admin view for daily task review
- Month & staff selector (default: current month & all staffs)
- Table showing each day of the selected month as rows
- Columns: Date, then for each on-duty staff: Selfie, Stock 1, Stock 2, WA Blasts
- Grouped by AM/PM shift per day
- Color-coded completion status
- Summary stats at bottom (completion rate per staff, per task type)

**Edit: `src/pages/staff/admin/Dashboard.tsx**`

- Add a link/button to the new Daily Task Review page
- Keep the existing `DailyReportsSummary` as a quick glance (today only)

**Edit: `src/App.tsx**`

- Add route: `/staff/admin/daily-tasks` pointing to `DailyTaskReview`

**Edit: `src/components/staff/StaffLayout.tsx**`

- Add "Daily Tasks" nav item under admin section

### Technical Details

- Roster lookup: query `saved_rosters` where `roster_type = 'support'`, `month` and `year` match, then parse `roster_data[todayDateKey]` to get `shift1` (AM) and `shift2` (PM) arrays
- For the month filter, fetch all `daily_reports` rows for that month + the corresponding roster, then cross-reference
- No database changes needed — all data already exists in `daily_reports` and `saved_rosters`

### Scope

- No migrations needed
- 1 new file: `DailyTaskReview.tsx`
- 4 edited files: `DailyReportingCard.tsx`, `DailyReportsSummary.tsx`, `Dashboard.tsx` (admin), `App.tsx`, `StaffLayout.tsx`