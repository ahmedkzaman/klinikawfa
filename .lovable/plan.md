

## Generate Monthly Payroll Summaries

### Problem
The Payroll Summary page reads from `monthly_payroll_summaries`, but nothing ever inserts rows into that table. Having a payroll profile alone doesn't create summary data — the system needs to aggregate attendance records + roster data + payroll profile into a monthly summary.

### Solution
Add a "Generate Summary" button on the Payroll Summary page that, for the selected month/year:

1. Fetches all staff with active `staff_payroll_profiles`
2. For each staff member, aggregates their `attendance_payroll_records` for that month (present days, leave days, absent days, late incidents, worked hours, OT hours)
3. Pulls their salary/allowance/deduction rates from `staff_payroll_profiles`
4. Calculates gross pay and net pay per Employment Act 1955 rules
5. Upserts a row into `monthly_payroll_summaries`

If no `attendance_payroll_records` exist yet for the month, the summary will show 0s — but the row will still be created so admin can see all active staff.

### Changes

**Edit: `src/pages/staff/admin/PayrollSummary.tsx`**
- Add a "Generate Summary" button next to the month/year selectors
- Add a `useMutation` that:
  - Queries all active `staff_payroll_profiles`
  - Queries `attendance_payroll_records` for the selected month/year
  - Queries `leave_requests` (approved) for the month
  - Queries `saved_rosters` to determine scheduled days
  - For each staff: calculates total_scheduled_days, present_days, leave_days, absent_days, late_incidents, worked_hours, OT hours
  - Calculates pay: gross = basic_salary + allowances, deductions for unpaid leave/lateness/absence, net = gross - deductions
  - Upserts into `monthly_payroll_summaries` (on conflict: user_id + month + year)
- Show toast on completion with count of summaries generated
- Skip generation for already-locked/paid summaries

### Pay Calculation Logic (Employment Act 1955)
- Daily rate (for monthly staff) = basic_salary / total_scheduled_days
- Unpaid leave deduction = unpaid_leave_count * daily_rate
- OT rate: 1.5x hourly for normal days (already stored in payroll profile)
- Gross = basic_salary + all allowances + (approved_OT_hours * OT_rate)
- Deductions = unpaid_leave_deduction + lateness_deduction + absence_deduction + custom_deduction
- Net = gross - deductions

### Files
- **Edit (1):** `src/pages/staff/admin/PayrollSummary.tsx`

### No database changes needed
The `monthly_payroll_summaries` table already has all required columns including a unique constraint possibility on (user_id, month, year). We'll use upsert logic in the client.

