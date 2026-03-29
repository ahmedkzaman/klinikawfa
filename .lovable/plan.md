

## Port Onboarding System from BioInnoTech to Klinik Awfa

### Overview
Copy the 4-step onboarding wizard (Form, Job Description, Job Scope, Company Policy) and gate non-admin staff behind it. Content in Job Description, Job Scope, and Company Policy will be adapted from BioInnoTech to Klinik Awfa context.

### Database Changes (1 migration)

Create `staff_onboarding` table:
```sql
CREATE TABLE public.staff_onboarding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  onboarding_data JSONB DEFAULT '{}'::jsonb,
  job_description_acknowledged BOOLEAN DEFAULT false,
  job_scope_acknowledged BOOLEAN DEFAULT false,
  company_policy_acknowledged BOOLEAN DEFAULT false,
  is_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.staff_onboarding ENABLE ROW LEVEL SECURITY;

-- Staff can read/write their own onboarding
CREATE POLICY "Users can manage own onboarding"
  ON public.staff_onboarding FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admins can view all onboarding records
CREATE POLICY "Admins can view all onboarding"
  ON public.staff_onboarding FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
```

### New Files (5)

1. **`src/hooks/useOnboardingStatus.ts`** — React Query hook to fetch the user's onboarding row from `staff_onboarding`, returns `{ data, isLoading, isCompleted, refetch }`

2. **`src/components/staff/onboarding/OnboardingWizard.tsx`** — 4-step progress wizard with step indicators. Same structure as BioInnoTech.

3. **`src/components/staff/onboarding/OnboardingForm.tsx`** — 4-part form (Personal Info, Education/Employment, Bank/Tax, Health Declaration). Adapted for clinic context:
   - Remove BIT-specific fields (prior_experience checkboxes for Bokashi/EM, TikTok handle, YouTube URL)
   - Replace with clinic-relevant fields (nursing cert, position at clinic)
   - Keep all universal fields (personal info, emergency contact, bank, health declaration)

4. **`src/components/staff/onboarding/JobDescriptionView.tsx`** — Read-only document with acknowledge checkbox. Content rewritten for Klinik Awfa clinic staff role (not BioInnoTech agri-tech role).

5. **`src/components/staff/onboarding/JobScopeView.tsx`** — Read-only document with acknowledge checkbox. Content rewritten for Klinik Awfa.

6. **`src/components/staff/onboarding/CompanyPolicyView.tsx`** — Company policy document. Content adapted from BioInnoTech to Klinik Awfa (clinic-specific working hours, dress code, medical confidentiality policies). Sets `is_completed = true` on final acknowledgement.

### Modified Files (1)

**`src/components/staff/StaffLayout.tsx`**:
- Import `useOnboardingStatus` and `OnboardingWizard`
- After auth checks, call `useOnboardingStatus(user.id)`
- If `!isAdmin && !onboardingCompleted`, render the `OnboardingWizard` instead of the normal dashboard layout
- Admins bypass onboarding gate entirely

### Content Adaptation Notes
- All BioInnoTech references → Klinik Awfa
- Job description/scope content: clinic assistant duties (patient care, front desk, pharmacy assistance, appointment management) instead of agri-tech duties
- Company policy: clinic-specific sections (patient confidentiality, medical waste handling, clinic hygiene, working hours per clinic schedule)
- OnboardingForm: keep universal HR fields, replace BIT-specific section with clinic-relevant questions (e.g., nursing qualifications, clinic experience)

### Files Summary
- **Migration**: Create `staff_onboarding` table + RLS
- **Create**: `src/hooks/useOnboardingStatus.ts`
- **Create**: `src/components/staff/onboarding/OnboardingWizard.tsx`
- **Create**: `src/components/staff/onboarding/OnboardingForm.tsx`
- **Create**: `src/components/staff/onboarding/JobDescriptionView.tsx`
- **Create**: `src/components/staff/onboarding/JobScopeView.tsx`
- **Create**: `src/components/staff/onboarding/CompanyPolicyView.tsx`
- **Edit**: `src/components/staff/StaffLayout.tsx`

