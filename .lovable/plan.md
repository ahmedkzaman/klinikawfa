

## Connect Onboarding Data to Payroll Profiles

### Problem
Staff enter bank details, IC, employment type, job title, etc. during onboarding (saved to `staff_onboarding.onboarding_data` JSONB), but this data never flows into `staff_payroll_profiles`. Admin sees empty payroll profiles because the two systems are disconnected.

### Solution
When onboarding is completed, auto-create/update a `staff_payroll_profiles` row using the relevant fields from the onboarding JSONB data.

### Changes

**Edit: `src/components/staff/onboarding/OnboardingForm.tsx`**

After the successful `staff_onboarding` upsert (line 148-154), add a second upsert to `staff_payroll_profiles` that maps onboarding fields:

| Onboarding field | Payroll profile column |
|---|---|
| `full_name` | `full_name` |
| `ic_passport` | `nric_passport` |
| `employment_type` | `employment_type` |
| `position_title` | `job_title` |
| `department` | `department` |
| `commencement_date` | `date_joined` |
| `bank_name` | `bank_name` |
| `bank_account_number` | `bank_account_number` |
| `account_holder_name` | `account_holder_name` |
| `tax_ref` | `tax_id` |
| `epf_number` | `epf_reference` |
| `socso_number` | `socso_reference` |

This upsert uses `onConflict: 'user_id'` so re-submitting onboarding updates the payroll profile. Salary/allowance fields remain at defaults (0) for admin to fill in later.

**Edit: `src/pages/staff/admin/PayrollProfiles.tsx`**

When creating a new payroll profile for a staff member, pre-populate fields from their `staff_onboarding.onboarding_data` if it exists. This handles cases where onboarding was completed before this fix.

**Edit: `src/pages/staff/Profile.tsx`**

Ensure the Profile page also reads from `staff_payroll_profiles` data that was seeded from onboarding (already works, just verifying consistency).

### Files
- **Edit (2):** `OnboardingForm.tsx`, `PayrollProfiles.tsx`

### No database changes needed
Both tables already exist with the correct columns.

