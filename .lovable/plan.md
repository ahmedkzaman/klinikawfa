## Step 22.5 — Composite Registration with Principal Search

### Reality check vs your spec

I inspected the live schema before planning. A few names in your spec don't match this codebase, so I'm proposing the equivalent that uses what already exists rather than creating duplicates:

| Spec says | Actual in this project | Action |
|---|---|---|
| `clinic_queue` table | `queue_entries` table | Use `queue_entries`. It **already** has `payment_method`, `panel_id`, `visit_purpose`, `visit_notes`, `clinic_status` ('registered' = waiting). **No migration needed for queue.** |
| `panels` table | `insurance_providers` table | Use `useInsuranceProviders({ activeOnly: true })` — already in use across the app. |
| `ic` field | `national_id` column | Use `national_id` in the form/payload, label it "MyKad / IC" in the UI. |
| `status: 'waiting'` | `clinic_status: 'registered'` | Map to `registered` (matches `useCheckInWalkIn`). |
| `PatientRegistrationForm.tsx` (new) | `RegisterPatientDialog.tsx` exists; `CheckInWalkInDialog.tsx` handles visit data | Build the new composite form as a **new** dialog `RegisterAndCheckInDialog.tsx` so we don't break the two existing single-purpose dialogs that other screens depend on. |

Only `patients.principal_id` and `patients.relationship` actually need to be added.

---

### A. Database migration

One migration file adding only the missing columns:

```sql
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS principal_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS relationship varchar(50);

CREATE INDEX IF NOT EXISTS idx_patients_principal_id
  ON public.patients(principal_id) WHERE principal_id IS NOT NULL;
```

No changes to `queue_entries` — all required columns already exist.

`PatientRow` / `PatientInsert` in `src/types/clinic.ts` will pick the new fields up automatically once `supabase/types.ts` regenerates.

### B. Principal search hook

Add to `src/hooks/clinic/usePatients.ts`:

```ts
export function useSearchPatients(searchQuery: string) {
  const trimmed = searchQuery?.trim() ?? '';
  return useQuery<PatientRow[]>({
    queryKey: ['clinic', 'patients', 'search', trimmed],
    enabled: trimmed.length >= 2,
    queryFn: async () => {
      const escaped = trimmed.replace(/[%_]/g, (m) => `\\${m}`);
      const { data, error } = await supabase
        .from('patients')
        .select('*')
        .or(`name.ilike.%${escaped}%,national_id.ilike.%${escaped}%`)
        .is('principal_id', null)         // only Principals can be principals
        .order('name', { ascending: true })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5_000,
  });
}
```

Plus a tiny `useDebouncedValue(value, 250)` helper in the same file for the combobox.

### C. Composite form — `src/components/clinic/RegisterAndCheckInDialog.tsx` (new)

`react-hook-form` + Zod schema:

```ts
{
  // Demographics (permanent)
  national_id: string (12 digits, optional but validated),
  name: string (required, min 2),
  phone: string (required, MY phone regex),
  gender: 'male' | 'female' | 'other' | '',
  date_of_birth: string,            // ISO date
  email?: string,

  // Dependent linkage (permanent)
  is_dependent: boolean,
  principal_id: string | null,      // required if is_dependent
  relationship: 'spouse' | 'child' | 'parent' | 'sibling' | 'other' | '',

  // Today's visit (ephemeral — written to queue_entries, not patients)
  visit_purpose: 'consultation' | 'follow_up' | 'vaccination' | 'medical_check' | 'procedure' | 'other',
  visit_notes: string,
  payment_method: 'cash' | 'panel',
  panel_id: string | null,          // required if payment_method = 'panel'
}
```

Zod `.superRefine` enforces:
- `principal_id` required when `is_dependent === true`
- `panel_id` required when `payment_method === 'panel'`

UI — three visually-grouped sections inside one scrollable `DialogContent`:

1. **Patient Demographics** — 2-col grid: MyKad / IC, Full Name, Phone, Gender, DOB, Email. **MyKad auto-parse**: when `national_id` matches `^\d{12}$`, derive `date_of_birth` (`YYMMDD` with century rule: `YY <= currentYY → 20YY`, else `19YY`) and `gender` (last digit odd→male, even→female), only filling fields that the user hasn't already overridden.

2. **Dependent Linkage** — Switch "Register as dependent of an existing patient". When on:
   - Combobox (`Command` + `Popover`) backed by `useSearchPatients(debouncedQuery)`. Each option shows `name • IC • phone`. On select, store the principal's UUID and display a chip with their name + a clear button.
   - `Select` for relationship (Spouse / Child / Parent / Sibling / Other).

3. **Today's Visit** — Select for Purpose, Textarea for Notes, RadioGroup for Cash / Panel; when Panel, show a Select powered by `useInsuranceProviders({ activeOnly: true })`.

Submit button label: **"Register & Add to Queue"**.

### D. Two-step submission pipeline

In `onSubmit(data)`:

```ts
// 1. Upsert patient (permanent data only — nothing visit-related here)
const patient = await createPatient.mutateAsync({
  name: data.name,
  phone: data.phone,
  national_id: data.national_id || null,
  date_of_birth: data.date_of_birth || null,
  gender: data.gender || null,
  email: data.email || null,
  principal_id: data.is_dependent ? data.principal_id : null,
  relationship: data.is_dependent ? data.relationship || null : null,
});

// 2. Insert queue entry (ephemeral visit data)
const { error } = await supabase.from('queue_entries').insert({
  patient_id: patient.id,
  clinic_status: 'registered',
  visit_purpose: data.visit_purpose,
  visit_notes: data.visit_notes || null,
  payment_method: data.payment_method,
  panel_id: data.payment_method === 'panel' ? data.panel_id : null,
  created_by: user?.id ?? null,
});
if (error) throw error;
```

Wrapped in try/catch. Errors from step 2 surface a toast advising the patient was saved but the queue entry failed (so staff can retry check-in via the existing `CheckInWalkInDialog` — no orphaned visit row).

On success:
- Invalidate `['clinic', 'patients']` and `['clinic', 'queue-entries']`
- `toast.success('Patient registered and added to queue')`
- Close dialog and `navigate('/clinic/queue')` (route confirmed: `QueueBoard` lives at `/clinic/queue`).

### E. Wiring

- Add a "Register & Check In" primary button on `src/pages/clinic/QueueBoard.tsx` (and/or `PatientsList.tsx`) that opens the new dialog.
- Leaves `RegisterPatientDialog` and `CheckInWalkInDialog` untouched — they're still used by the appointment check-in flow and admin patient management.

### Files

**New**
- `supabase/migrations/<ts>_patients_dependents.sql`
- `src/components/clinic/RegisterAndCheckInDialog.tsx`

**Edited**
- `src/hooks/clinic/usePatients.ts` — add `useSearchPatients` + `useDebouncedValue`
- `src/pages/clinic/QueueBoard.tsx` — add launcher button
- `src/types/clinic.ts` — no manual edit; types regenerate from migration

### Out of scope (call out before approval)

- I'm **not** renaming `queue_entries` → `clinic_queue` or `insurance_providers` → `panels`. Those would be invasive renames touching dozens of files, hooks, RLS, and the `trg_generate_panel_claim` trigger. If you want the rename anyway, say so and I'll plan it as a separate phase.
- I'm **not** modifying `RegisterPatientDialog` or `CheckInWalkInDialog`; the new composite dialog lives alongside them.
