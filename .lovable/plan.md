

## Add New Allowance & Statutory Deduction Fields to Payroll Profiles

### Problem
The payroll profile currently has generic allowance fields (fixed, transport, meal, on-call, custom) and simple deduction fields. The business needs specific named allowances (APC, Telephone, Team Leader, Project, Admin, other with custom name) and Malaysian statutory deductions (EPF employee/employer, SOCSO employee/employer, EIS employee/employer, HRDF, MTD).

### Changes

**Database Migration — add new columns to `staff_payroll_profiles`**

New allowance columns (all `numeric default 0`):
- `apc_allowance`, `telephone_allowance`, `team_leader_allowance`, `project_allowance`, `admin_allowance`, `other_allowance_amount`, `other_allowance_name` (text, nullable)

New statutory deduction columns (all `numeric default 0`):
- `epf_employee`, `epf_employer`, `socso_employee`, `socso_employer`, `eis_employee`, `eis_employer`, `hrdf`, `mtd`

**Edit: `src/pages/staff/admin/PayrollProfiles.tsx`**
1. Add all new fields to the `PayrollProfile` type and `emptyProfile` defaults
2. Replace the current Allowances fieldset with the new named allowances (APC, Telephone, Team Leader, Project, Admin, Other with a name+amount pair)
3. Replace the current Deductions fieldset with two sub-sections:
   - **Operational Deductions**: unpaid leave, lateness, absence, custom (keep existing)
   - **Statutory Deductions**: EPF (EE), EPF (ER), SOCSO (EE), SOCSO (ER), EIS (EE), EIS (ER), HRDF, MTD
4. Keep old allowance fields (fixed, transport, meal, on-call, custom) in the form for backward compatibility, grouped under "Legacy Allowances" or merged into the new set

**Edit: `src/pages/staff/Profile.tsx`** — update the PayrollInfoSection to display the new allowance/deduction fields in the staff's read-only view

**Edit: `src/pages/staff/admin/PayrollSummary.tsx`** — include the new allowances in gross pay calculation and statutory deductions in the net pay calculation when generating summaries

### Files
- **Migration**: Add 15 new columns to `staff_payroll_profiles`
- **Edit**: `src/pages/staff/admin/PayrollProfiles.tsx` — form fields
- **Edit**: `src/pages/staff/Profile.tsx` — read-only display
- **Edit**: `src/pages/staff/admin/PayrollSummary.tsx` — summary generation logic

