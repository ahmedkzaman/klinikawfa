

## Payroll-Ready Data Structure

### Overview
Add three new database tables to support future payroll integration, plus an admin summary page. No payroll calculations — just the data structure.

### Phase 1: Database Migration

**Table 1: `staff_payroll_profiles`** — One row per staff member with salary/bank/employment details.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid NOT NULL | references auth.users |
| employee_id | text | custom employee ID |
| full_name | text | |
| nric_passport | text | |
| employment_type | text | permanent/contract/locum/part-time |
| job_title | text | |
| department | text | |
| date_joined | date | |
| resignation_date | date | nullable |
| payroll_status | text | active/inactive/suspended, default 'active' |
| bank_name | text | |
| bank_account_number | text | |
| account_holder_name | text | |
| salary_payment_type | text | monthly/daily/hourly |
| basic_salary | numeric | default 0 |
| daily_rate | numeric | default 0 |
| hourly_rate | numeric | default 0 |
| overtime_eligible | boolean | default false |
| overtime_rate | numeric | default 0 |
| fixed_allowance | numeric | default 0 |
| transport_allowance | numeric | default 0 |
| meal_allowance | numeric | default 0 |
| oncall_allowance | numeric | default 0 |
| custom_allowance | numeric | default 0 |
| unpaid_leave_deduction | numeric | default 0 |
| lateness_deduction | numeric | default 0 |
| absence_deduction | numeric | default 0 |
| custom_deduction | numeric | default 0 |
| tax_id | text | |
| epf_reference | text | |
| socso_reference | text | |
| other_statutory_ref | text | |
| payroll_notes | text | |
| created_at, updated_at | timestamptz | |

RLS: Staff can view own (limited fields via app logic), admin full access.

**Table 2: `attendance_payroll_records`** — Daily attendance with payroll-compatible fields.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid NOT NULL | |
| date | date NOT NULL | |
| shift_assigned | text | |
| scheduled_start | time | |
| scheduled_end | time | |
| actual_clock_in | timestamptz | |
| actual_clock_out | timestamptz | |
| working_status | text | present/leave/absent/late/incomplete/off_day |
| total_worked_hours | numeric | default 0 |
| late_minutes | numeric | default 0 |
| overtime_hours | numeric | default 0 |
| approved_overtime_hours | numeric | default 0 |
| unpaid_leave | boolean | default false |
| payable_day | boolean | default true |
| payroll_locked | boolean | default false |
| remarks | text | |
| created_at | timestamptz | |

RLS: Staff view own, admin full access.

**Table 3: `monthly_payroll_summaries`** — Monthly rollup per staff.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid NOT NULL | |
| month | integer | |
| year | integer | |
| total_scheduled_days | integer | default 0 |
| total_present_days | integer | default 0 |
| total_leave_days | integer | default 0 |
| total_absent_days | integer | default 0 |
| total_late_incidents | integer | default 0 |
| total_worked_hours | numeric | default 0 |
| total_overtime_hours | numeric | default 0 |
| total_payable_regular_hours | numeric | default 0 |
| total_payable_overtime_hours | numeric | default 0 |
| unpaid_leave_count | integer | default 0 |
| unpaid_leave_deduction | numeric | default 0 |
| lateness_deduction | numeric | default 0 |
| absence_deduction | numeric | default 0 |
| total_allowances | numeric | default 0 |
| total_deductions | numeric | default 0 |
| gross_pay | numeric | default 0 |
| net_pay | numeric | default 0 |
| payroll_status | text | draft/pending_review/approved/paid, default 'draft' |
| created_at, updated_at | timestamptz | |

RLS: Staff view own, admin full access.

### Phase 2: Admin Payroll Summary Page

**New file: `src/pages/staff/admin/PayrollSummary.tsx`**

A read-only admin dashboard showing:
- Monthly summary table listing each staff with key payroll indicators (present days, late count, OT hours, unpaid leave, payroll status)
- Filters: month/year selector, staff search, department filter
- Payroll-impact badges (unpaid leave, late, incomplete records)
- No calculation logic — just displays data from `monthly_payroll_summaries`

### Phase 3: Staff Payroll Profile View

**Edit: `src/pages/staff/Profile.tsx`**

Add a "Payroll Info" section (read-only for staff) showing:
- Employment type, date joined, salary payment type
- Bank details (masked)
- Allowances summary
- Staff cannot edit payroll fields — admin only

### Phase 4: Navigation & Routing

**Edit: `src/App.tsx`** — Add `/staff/admin/payroll-summary` route
**Edit: `src/components/staff/StaffLayout.tsx`** — Add "Payroll Summary" to admin nav

### Files Summary

**Migration (1):** Create 3 tables + RLS policies
**New (1):** `src/pages/staff/admin/PayrollSummary.tsx`
**Edit (3):** `src/pages/staff/Profile.tsx`, `src/App.tsx`, `src/components/staff/StaffLayout.tsx`

### Security
- Salary, bank, and statutory fields only visible to admin
- Staff see own limited payroll profile (masked bank, no salary figures)
- All tables have RLS with `is_admin` / `auth.uid() = user_id` policies
- Payroll lock flag prevents editing finalized records

