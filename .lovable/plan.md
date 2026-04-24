

## Step 9 — Settings Hub, Preferences & User/Locum Management

Adds `/clinic/settings` (hub + preferences + user/locum management). Includes the schema additions needed for the PostgREST embed and the `'admin'` variant on `ClinicProtectedRoute`.

---

### 1. Migration — `<ts>_settings_step9.sql`

Exact SQL from the prompt (adds `doctors.status` + `doctors_status_idx`, named FKs `fk_user_roles_profile` and `fk_doctors_profile` parallel to the existing `auth.users` FKs).

### 2. Hooks (`src/hooks/clinic/`)

**`useClinicPreferences.ts`** — extend with:
```ts
export function useUpdateClinicPreference() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const { error } = await supabase
        .from('clinic_preferences')
        .upsert({ key, value }, { onConflict: 'key' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinic_preferences'] }),
  });
}
```

**`useClinicUsers.ts`** *(new)* — single embed query:
```ts
supabase.from('profiles').select(`
  id, full_name, email,
  user_roles!fk_user_roles_profile ( role ),
  doctors!fk_doctors_profile ( id, name, status, on_duty )
`).order('full_name', { ascending: true });
```
Maps to `ClinicUserRow { id, full_name, email, role: AppRole|null, doctor: {id,name,status,on_duty}|null }` (first item of each embedded array). QueryKey `['clinic_users']`.

**`useDoctors.ts`** *(new)*
- `useDoctors()` — `select('*').order('name')`, key `['doctors']`.
- `useCreateDoctor()` — insert `{ user_id, name, status, on_duty }`; invalidate `['doctors']` + `['clinic_users']`.
- `useUpdateDoctor()` — update by `id`; same invalidations.

### 3. Pages (`src/pages/clinic/settings/`)

**`SettingsPage.tsx`** → `/clinic/settings`
- `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4` of `Card`-as-`Link`:

| Card | Icon | Path | Visibility |
|---|---|---|---|
| General Preferences | `Sliders` | `/clinic/settings/preferences` | always |
| User Management | `Users` | `/clinic/settings/users` | `isAdmin \|\| isSpecialAdmin` |
| Voided Records | `Archive` | `/clinic/voided` (existing — not moved) | `isAdmin \|\| isSpecialAdmin` |

Each card: icon + title + 1-line description + `ChevronRight`; hover `bg-accent/40`.

**`InClinicSettings.tsx`** → `/clinic/settings/preferences`
- Reads via `useClinicPreferences()`; writes via `useUpdateClinicPreference()`.
- Form state seeded once from `getPreference(key, default)` for two keys:
  - `default_consultation_fee_name` (Input)
  - `default_consultation_fee_price` (Input `type="number"` `step="0.01" min="0"`)
- "Save Changes": diff against initial values, `Promise.all` of `mutateAsync({key,value})` for each changed key; toast; reset baseline.
- "Cancel" reverts to last loaded values. Save disabled while loading or no diff. Back link to `/clinic/settings`.

**`UserManagementSettings.tsx`** → `/clinic/settings/users`
- Page guard: `if (!isAdmin && !isSpecialAdmin) return <Alert>Admin access required</Alert>;` (in addition to the route-level guard).
- Search filters `full_name`/`email` (case-insensitive).
- Table columns:

| Column | Cell |
|---|---|
| Name / Email | bold `full_name` over muted `email` |
| Current Role | shadcn `Select` bound to `row.role`; options `guest, staff, operations, admin, special_admin`. **Disabled when `!isSpecialAdmin` OR `row.id === user.id`.** OnChange → `supabase.rpc('admin_assign_role', { target_user_id: row.id, new_role })`, invalidate `['clinic_users']`, toast. |
| Doctor Profile | `Badge` `Active`/`Inactive`/`—` from `doctor.status`; on-duty `Badge` if `on_duty` |
| Action | `Button variant="outline" size="sm"` "Manage Profile" → opens `DoctorProfileDialog` |

- Loading: 8 skeleton rows. Empty: centered `Users` icon + "No users found".

**`src/components/clinic/settings/DoctorProfileDialog.tsx`** *(new)*
- Props `{ open, onOpenChange, user: ClinicUserRow }`.
- Title: "Edit Doctor Profile" if `user.doctor`, else "Create Doctor Profile".
- Fields: `name` Input ("Dr. John"), `status` Select (active/inactive), `on_duty` Switch.
- Submit → `useUpdateDoctor` (existing) or `useCreateDoctor` with `user_id: user.id`; toast + close.

### 4. Routing & Guards

**`src/components/ClinicProtectedRoute.tsx`** — extend `requiredRole` union to `'ops_or_admin' | 'special_admin' | 'admin'`. New branch:
```ts
const hasAccess =
  requiredRole === 'special_admin' ? isSpecialAdmin :
  requiredRole === 'admin'         ? (isAdmin || isSpecialAdmin) :
  /* ops_or_admin */                 isOpsOrAdmin;
```

**`src/App.tsx`** — direct imports (matching existing clinic page style); inside the `/clinic` block, after `inventory`, before `voided`:
```tsx
<Route path="settings" element={<SettingsPage />} />
<Route path="settings/preferences" element={<InClinicSettings />} />
<Route
  path="settings/users"
  element={
    <ClinicProtectedRoute requiredRole="admin">
      <UserManagementSettings />
    </ClinicProtectedRoute>
  }
/>
```

**`src/components/clinic/ClinicLayout.tsx`** — add `Settings` to the lucide import; append to `clinicNavItems`:
```ts
{ href: '/clinic/settings', label: 'Settings', icon: Settings },
```
Active-state matching is already path-prefix based.

---

### Out of scope

- Inventory / catalog settings, e-Invoice settings, Reviews settings.
- Bulk role changes; audit log of role changes (server enforces via `admin_assign_role`).
- Moving `/clinic/voided` under `/clinic/settings/voided-records` — link to existing path.

### Files touched

| File | Action |
|---|---|
| `supabase/migrations/<ts>_settings_step9.sql` | **New** |
| `src/hooks/clinic/useClinicPreferences.ts` | **Edit** — add `useUpdateClinicPreference` |
| `src/hooks/clinic/useClinicUsers.ts` | **New** |
| `src/hooks/clinic/useDoctors.ts` | **New** |
| `src/pages/clinic/settings/SettingsPage.tsx` | **New** |
| `src/pages/clinic/settings/InClinicSettings.tsx` | **New** |
| `src/pages/clinic/settings/UserManagementSettings.tsx` | **New** |
| `src/components/clinic/settings/DoctorProfileDialog.tsx` | **New** |
| `src/components/ClinicProtectedRoute.tsx` | **Edit** — add `'admin'` variant |
| `src/App.tsx` | **Edit** — 3 imports + 3 routes |
| `src/components/clinic/ClinicLayout.tsx` | **Edit** — `Settings` icon + nav entry |

### Verification

1. Migration applies; `doctors.status` defaults to `'active'`; `pg_constraint` shows `fk_user_roles_profile` + `fk_doctors_profile`.
2. `tsc --noEmit` passes.
3. `/clinic/settings` shows 3 cards for admin/special_admin; only General Preferences for staff.
4. Preferences page: change name + price → Save → values upserted; Cancel reverts; Save disabled with no diff.
5. `/clinic/settings/users` lists every profile with role + doctor badge. Role Select disabled for non-special-admins and for the current user's own row. Special-admin role change calls `admin_assign_role` and refreshes the table.
6. Manage Profile → create flow on user without doctor row, edit flow on user with one; doctor badge updates after save.
7. Sidebar shows "Settings" at the bottom; sub-routes keep it active; mobile sheet works.
8. Existing pages (Queue, Patients, Consultation, Billings, Panel Claims, Voided) unaffected.

