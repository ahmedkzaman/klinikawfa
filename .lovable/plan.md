## Locum Onboarding — Dual Pipeline (with MMC Verification Visibility)

Two parallel pathways for creating Locum doctor accounts:
1. **Internal**: Staff/Admin manually creates a Locum from User Management (no session disruption).
2. **External**: Public `/locum-register` page where a Locum self-signs-up as a `guest` pending Medical Director review.

`SUPABASE_SERVICE_ROLE_KEY` is already configured. No manual setup required.

---

### 1. Edge Function — `supabase/functions/admin-create-user/index.ts`

New function with `verify_jwt = false` (manual verification in code, per project pattern).

Flow:
- CORS preflight handler.
- Zod-validated body: `{ email, fullName, phone? }`.
- Read `Authorization: Bearer <jwt>`, verify with anon client `getClaims(token)`. Reject 401 if invalid.
- Use service-role client to check caller's role in `user_roles`. Require `admin | special_admin | doctor_admin | staff`. Otherwise 403.
- `serviceClient.auth.admin.createUser({ email, password: 'test1234', email_confirm: true, user_metadata: { full_name, phone } })`.
- Upsert `public.user_roles` with `{ user_id, role: 'locum' }`.
- Return `{ success: true, user_id }`. Friendly 409 on duplicate email.

`handle_new_user` trigger already creates the `profiles` row — no migration needed.

---

### 2. Public Self-Registration — `src/pages/auth/LocumRegister.tsx`

Public page styled to match `Auth.tsx`:
- Card with brand gradient header "Locum Doctor Registration".
- Fields: Full Name, Email, Password (min 8), Phone, **MMC Registration Number** (required).
- On submit:
  ```ts
  supabase.auth.signUp({
    email, password,
    options: {
      emailRedirectTo: `${window.location.origin}/`,
      data: { requested_role: 'locum', full_name, phone, mmc_number },
    }
  })
  ```
- Success state: "Registration submitted. Check your email to verify your account. Our Medical Director will review your MMC credentials before granting clinic access."
- Link back to `/auth` for existing users.

New users land as `guest` (default) — quarantined by the Guest Firewall until promoted.

---

### 3. Database — Surface `mmc_number` for verification

Add a migration so the MMC number persists on the `profiles` table (more reliable than reading raw `auth.users.raw_user_meta_data` from the client).

**Migration**: `supabase/migrations/<ts>_profiles_mmc_number.sql`
```sql
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS mmc_number text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS requested_role text;

-- Update handle_new_user to capture metadata from public signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, phone, mmc_number, requested_role)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'mmc_number',
    NEW.raw_user_meta_data->>'requested_role'
  );
  RETURN NEW;
END;
$$;
```

Existing `useClinicUsers` hook will be updated to select these new profile columns.

---

### 4. Staff UI — `src/pages/clinic/settings/UserManagementSettings.tsx`

**Add Locum button**:
- Visible only when `isAdmin || isSpecialAdmin || role === 'staff'`.
- Opens `AddLocumDialog` (new component at `src/components/clinic/settings/AddLocumDialog.tsx`).
- Form: Full Name, Email, Phone. Helper text: "Default password: `test1234` (locum should change after first login)."
- Calls `supabase.functions.invoke('admin-create-user', ...)`, then `qc.invalidateQueries(['clinic_users'])`.

**MMC verification visibility** (the critical addition):
- Add a new column **"MMC / Requested Role"** to the user table.
- For each row, render:
  - If `requested_role === 'locum'` and `mmc_number` present → show a yellow `Pending Locum` badge alongside the MMC number, with a `Verify on MMC →` external link to `https://meritsmmc.moh.gov.my/` (opens new tab).
  - Otherwise show `—`.
- In the `DoctorProfileDialog` (or via tooltip on the badge), surface the `phone` and `mmc_number` fields read-only so the admin can confirm details before changing the role dropdown to `Locum`.

This closes the loop: a self-registered guest is immediately visible with their MMC number, and the admin can verify and promote them in one screen.

---

### 5. Routing — `src/App.tsx`

Public route OUTSIDE all protected wrappers, alongside `/auth` and `/reset-password`:
```tsx
<Route path="/locum-register" element={<LocumRegister />} />
```

---

### Files Touched

**New**
- `supabase/functions/admin-create-user/index.ts`
- `supabase/migrations/<ts>_profiles_mmc_number.sql`
- `src/components/clinic/settings/AddLocumDialog.tsx`
- `src/pages/auth/LocumRegister.tsx`

**Edited**
- `supabase/config.toml` — append `[functions.admin-create-user]\nverify_jwt = false`
- `src/hooks/clinic/useClinicUsers.ts` — select `phone, mmc_number, requested_role`
- `src/pages/clinic/settings/UserManagementSettings.tsx` — Add Locum button, MMC column, verify link
- `src/components/clinic/settings/DoctorProfileDialog.tsx` — show MMC/phone read-only
- `src/App.tsx` — register `/locum-register` route

---

### Verification

1. Deploy edge function → log in as staff → click Add Locum → confirm staff session intact and new locum appears.
2. Log out → visit `/locum-register` → submit with MMC number → confirm guest row created with `mmc_number` populated.
3. Log back in as admin → confirm new guest displays Pending Locum badge + MMC number + verify link → promote to `locum` via existing role dropdown.
