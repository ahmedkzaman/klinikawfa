# Clinic Access Matrix + Secure Locum Registration (revised)

Adds `ops_staff` as a first-class role, migrates existing `operations` / `staff` users into it, gives ops_staff a dedicated minimal "Register Locum" page, and tightens the RLS helper boundary between administrative and clinical roles.

## 1. Database migration

Two-statement migration (enum add must commit before reuse):

1. `ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'ops_staff';`
2. `UPDATE public.user_roles SET role = 'ops_staff' WHERE role IN ('operations','staff');`
3. **Rewrite helpers with a strict administrative boundary** — clinical roles are NOT included:
   - `is_staff_or_admin(_user_id)` → role IN (`admin`, `special_admin`, `doctor_admin`, `ops_staff`, `operations`, `staff`). Drops `locum` and `resident_doctor`.
   - `is_ops_or_admin(_user_id)` → role IN (`admin`, `special_admin`, `doctor_admin`, `ops_staff`, `operations`, `staff`). Drops `resident_doctor`.
   - New helper `is_clinical(_user_id)` → role IN (`resident_doctor`, `locum`) — to be used by any future policy that needs clinical access.
4. **Audit pass before merging** — grep every RLS policy and SECURITY DEFINER body for direct calls to `is_staff_or_admin` / `is_ops_or_admin`. For any policy where dropping `resident_doctor` would break legitimate clinical workflows (e.g. consultations, prescribing, owe-slip fulfilment), replace the helper call with `(is_staff_or_admin(auth.uid()) OR is_clinical(auth.uid()))`. Document each touched policy in the migration comment.
5. `'operations'` and `'staff'` remain in the enum as deprecated aliases (Postgres can't drop enum values cleanly). Nothing assigns them going forward; helpers still accept them so any unmigrated rows or in-flight sessions keep working.

## 2. Edge function — `admin-create-user`

- Add `'ops_staff'` to the allowed caller-role list. Keep `'staff'` and `'operations'` for backward compat during transition.
- When the caller role is `ops_staff` / `staff` / `operations`, server-side force `parsed.data.role = 'locum'` before any DB write. Frontend cannot escalate.
- Confirm the `createUser` payload includes `email_confirm: true` (already present at line ~93) so the locum can log in immediately — no email round-trip. Add a code comment marking this as a deliberate operational requirement so it isn't removed later.
- Admins (`admin` / `special_admin` / `doctor_admin`) keep the existing behaviour of being able to create resident_doctor accounts.

No new RPC is added; the edge function already uses service role + caller JWT verification via `getClaims`, which satisfies the "SECURITY DEFINER" intent of the spec.

## 3. Frontend changes

### `src/contexts/AuthContext.tsx`
- Add `'ops_staff'` to the `AppRole` union and expose `isOpsStaff`. Map any existing `isStaff` derived flag to `role === 'ops_staff' || role === 'staff' || role === 'operations'` for backward compatibility.

### New `src/components/clinic/settings/LocumRegistrationForm.tsx`
- Extract the form body of `AddUserDialog` into a reusable component.
- Fields: Full Name, Email, Phone (optional), Password (default `test1234`, editable).
- Password input includes a **stateful "Show Password" toggle** (eye / eye-off icon button) so front-desk staff can verify what they typed before submit.
- Calls `supabase.functions.invoke('admin-create-user', { body: { role: 'locum', ... } })`.

### `src/components/clinic/settings/AddUserDialog.tsx`
- Refactored to render `LocumRegistrationForm` inside the dialog shell — same UX as today, no duplicate code.

### New `src/pages/clinic/settings/LocumRegistration.tsx`
- Minimal standalone page for ops_staff. Title "Register Locum Doctor", renders `LocumRegistrationForm` directly. No user list, no role editor.

### `src/pages/clinic/settings/UserManagementSettings.tsx`
- Add `'ops_staff'` (label "Ops Staff") to `ROLE_OPTIONS`. Remove `'staff'` and `'operations'` from selectable options; keep them in `ROLE_LABEL` so legacy rows still render.
- Page remains admin-only (unchanged guard) — ops_staff never sees the role-edit dropdown.

### Routing — `src/App.tsx`
- New route `/clinic/settings/locum-registration` wrapped in `ClinicProtectedRoute` with allowed roles `['ops_staff','admin','special_admin','doctor_admin']`.

### `src/pages/clinic/settings/SettingsPage.tsx`
- Add a "Register Locum" entry visible when `isOpsStaff || isAdmin`. Ops_staff sees ONLY this entry from the user-management cluster — no link to full User Management.

## 4. Out of scope (explicit)

- No rename of `operations` / `staff` enum values (Postgres limitation).
- No bulk edit of every RLS policy beyond the targeted audit in §1.4.

## Technical details

- Files touched: 1 migration, `supabase/functions/admin-create-user/index.ts`, `src/contexts/AuthContext.tsx`, `src/App.tsx`, `src/pages/clinic/settings/SettingsPage.tsx`, `src/pages/clinic/settings/UserManagementSettings.tsx`, `src/components/clinic/settings/AddUserDialog.tsx`, new `src/components/clinic/settings/LocumRegistrationForm.tsx`, new `src/pages/clinic/settings/LocumRegistration.tsx`.
- Postgres requires `ALTER TYPE ... ADD VALUE` to commit before the new value is usable; the migration uses two separate statement blocks.
- After migration, run `supabase--linter` and review every flagged policy that previously relied on the broadened `is_staff_or_admin` to confirm no clinical workflow regressed.
