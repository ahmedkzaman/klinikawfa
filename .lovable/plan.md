## Retraction

Earlier `bypassStaffHRGates = isAdmin || isClinical` patch is **withdrawn**. Resident doctors are W-2 employees and must complete onboarding + acknowledge circulars. The bug is a data-pipeline failure, not a UI gate failure.

## Root cause (confirmed in DB)

Every `staff` / `operations` user has a `staff_onboarding` row. The lone `resident_doctor` (`ezark_muhd@yahoo.com`) does **not**, so they hit OnboardingWizard with no backing record and are stuck. Nothing in the codebase seeds `staff_onboarding` at user-creation time, and `admin-create-user` is hardcoded to `'locum'`.

## Fix — two layers + critical addendum

### Layer 1: HR data pipeline

**A. Generalize `supabase/functions/admin-create-user/index.ts`**
- Extend `BodySchema` with `role: z.enum(['locum','resident_doctor','staff','operations']).default('locum')`.
- Pass `requested_role: role` into `user_metadata`.
- Upsert `user_roles` with the chosen role.
- For employee roles (`resident_doctor`, `staff`, `operations`) — NOT `locum` — upsert a blank `staff_onboarding` row:
  ```ts
  await admin.from('staff_onboarding').upsert({
    user_id: newUserId,
    onboarding_data: {},
    job_description_acknowledged: false,
    job_scope_acknowledged: false,
    company_policy_acknowledged: false,
    is_completed: false,
  }, { onConflict: 'user_id' });
  ```

**B. Generalize the dialog**
- Rename `src/components/clinic/settings/AddLocumDialog.tsx` → `AddUserDialog.tsx` with a `role` prop ('locum' | 'resident_doctor'). Pass `role` to the edge function.
- In `src/pages/clinic/settings/UserManagementSettings.tsx`, render two buttons: "Add Locum" and "Add Resident Doctor", each opening `AddUserDialog` with the matching role.

**C. Backfill migration**
```sql
INSERT INTO public.staff_onboarding (user_id, onboarding_data, is_completed)
SELECT ur.user_id, '{}'::jsonb, false
FROM public.user_roles ur
WHERE ur.role IN ('resident_doctor','staff','operations')
  AND NOT EXISTS (SELECT 1 FROM public.staff_onboarding so WHERE so.user_id = ur.user_id)
ON CONFLICT (user_id) DO NOTHING;
```

After this, the existing resident doctor logs in → sees OnboardingWizard with a real row → completes it → reads circulars → reaches dashboard. HR compliance preserved.

### Layer 2: Routing firewall (locums out of `/staff/*`)

**`src/contexts/AuthContext.tsx`**
- Remove `'locum'` from the `isStaffOrAdmin` union. Keep `isClinical` and `isLocum` unchanged.

**`src/components/staff/StaffLayout.tsx`** (around line 260)
```ts
if (isLocum) { navigate('/clinic/queue', { replace: true }); return null; }
if (!isStaffOrAdmin) { navigate('/'); return null; }
```

Header's "Staff Portal" link uses `isStaffOrAdmin` and will hide for locums automatically.

### CRITICAL Addendum — prevent `/clinic` lockout for locums

The previous sprint set `requiredRole="any_staff"` as the front-door gate for all `/clinic/*` routes, and that gate is implemented in `src/components/ClinicProtectedRoute.tsx` line 72 as:
```ts
requiredRole === 'any_staff' ? isStaffOrAdmin : ...
```

If we drop `locum` from `isStaffOrAdmin` without patching this gate, locums will be:
1. Bounced out of `/staff/*` by StaffLayout → redirected to `/clinic/queue`.
2. Bounced out of `/clinic/*` by ClinicProtectedRoute → redirected to `/staff/dashboard`.
3. Infinite redirect loop.

**Patch in the same change:**
`src/components/ClinicProtectedRoute.tsx` line 70-72:
```ts
const passesAnyStaff = isStaffOrAdmin || isLocum;

const hasAccess =
  requiredRole === 'any_staff'
    ? passesAnyStaff
    : ...
```

This decouples "Clinic Access" (clinic building keycard) from "Staff HR Access" (HR office keycard). Locums keep the former, lose the latter.

## Files to change

- `supabase/functions/admin-create-user/index.ts` — accept `role`, seed `staff_onboarding` for employee roles
- `src/components/clinic/settings/AddLocumDialog.tsx` → rename to `AddUserDialog.tsx` with `role` prop
- `src/pages/clinic/settings/UserManagementSettings.tsx` — add "Add Resident Doctor" CTA
- `src/contexts/AuthContext.tsx` — drop `locum` from `isStaffOrAdmin`
- `src/components/staff/StaffLayout.tsx` — explicit `isLocum → /clinic/queue` redirect
- `src/components/ClinicProtectedRoute.tsx` — `passesAnyStaff = isStaffOrAdmin || isLocum`
- New migration — backfill `staff_onboarding` for employee roles missing a row

## Untouched

- HR onboarding gate logic (`!isAdmin && !onboardingCompleted`)
- Circular notice gate
- `resident_doctor` permission flags (still clinical + ops, not admin)

## Verification

1. Existing resident doctor logs in (post-backfill) → OnboardingWizard with real row → completes → dashboard. Sidebar hides admin items.
2. New resident doctor created via "Add Resident Doctor" → row exists immediately → same flow.
3. Locum logs in → StaffLayout boots to `/clinic/queue`. ClinicProtectedRoute admits via `passesAnyStaff`. No redirect loop. No "Staff Portal" link in header.
4. `staff` / `operations` / `admin` users — zero behavioral change.