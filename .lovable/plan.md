# Locum Clinical Tier & Routing Firewall (Revised — Option 3)

Adopt the **broad parent, strict child** strategy. The parent `/clinic` gate stays permissive (admits all non-guest employees); individual child routes carry strict role wrappers.

## 1. AuthContext (`src/contexts/AuthContext.tsx`)

Add and export `isClinical`:

```ts
const isClinical = ['locum', 'doctor_admin', 'special_admin', 'admin'].includes(role ?? '');
```

Add `isClinical: boolean` to `AuthContextType` and to the provider value. Keep `isClinical` strict — receptionists/operations are NOT clinical.

## 2. Login redirect (`src/pages/Auth.tsx`)

Replace the blanket `navigate('/')` with a role-aware effect that fires once `rolesLoading` is false. Since `/clinic/dashboard` doesn't exist yet, route both branches to `/clinic/queue` but keep the role split for future-proofing:

```ts
useEffect(() => {
  if (!user || authLoading || rolesLoading) return;
  if (role === 'locum') {
    navigate('/clinic/queue', { replace: true });
  } else if (['admin','special_admin','doctor_admin','operations','staff'].includes(role ?? '')) {
    navigate('/clinic/queue', { replace: true }); // future: /clinic/dashboard
  } else {
    navigate('/', { replace: true }); // guest / null
  }
}, [user, role, authLoading, rolesLoading]);
```

Remove the inline `navigate('/')` from `handleLogin` (the effect handles it after role resolves).

## 3. Route guard hardening (`src/components/ClinicProtectedRoute.tsx`)

- Extend `requiredRole` union: add `'clinical'`.
- Pull `isClinical`, `isLocum` from context.
- Bounce safely to prevent loops:

```ts
if (requiredRole === 'clinical' && !isClinical) {
  // staff/operations bounced out of clinical-only routes
  return <Navigate to="/clinic/queue" replace />;
}
if (!hasAccess) {
  // ops_or_admin / admin / special_admin / insights failures
  if (isLocum) return <Navigate to="/clinic/queue" replace />;
  return <Navigate to="/staff/dashboard" replace />;
}
```

The default `requiredRole` stays `ops_or_admin` BUT — important — the parent `/clinic` wrapper must explicitly opt out of that default. Change its usage in App.tsx to pass an explicit prop, OR (cleaner) loosen the default to a new `'any_staff'` baseline.

**Decision:** add a new `'any_staff'` value (uses `isStaffOrAdmin`, which already includes locum + staff + operations + all admins) and change the parent wrapper to `requiredRole="any_staff"`. This keeps existing children that omit `requiredRole` from accidentally inheriting a permissive default — they'll continue to default to `ops_or_admin`.

Updated union: `'any_staff' | 'clinical' | 'ops_or_admin' | 'special_admin' | 'admin' | 'insights'`.

## 4. Route assignments (`src/App.tsx`)

**Parent (broad front door):**
```tsx
<Route path="/clinic" element={
  <ClinicProtectedRoute requiredRole="any_staff"><ClinicLayout /></ClinicProtectedRoute>
}>
```

**Clinical-only children** (wrap with `requiredRole="clinical"`):
- `consultation`
- `consultation/:queueEntryId`
- `patients`
- (Leave `queue`, `appointments`, `visits/:id` unwrapped — front desk needs them.)

**Ops-or-admin children** (wrap with `requiredRole="ops_or_admin"` — locks locums OUT):
- `dispensary`
- `procurement`
- `queue/checkout/:queueEntryId`
- `billings`
- `panel-claims`
- `receivables`
- `inventory`
- `settings` (bare)
- `settings/preferences`

**Already correctly wrapped (leave as-is):**
- `settings/users`, `settings/documents` → `admin`
- `settings/diagnoses`, `settings/panels`, `settings/drug-label`, `settings/queue` → `ops_or_admin`
- `settings/inventory` → currently bare `ClinicProtectedRoute` (defaults to `ops_or_admin`) ✓
- `insight` → `insights`
- `voided` → `special_admin`

## 5. Sidebar visibility (`src/components/clinic/ClinicLayout.tsx`)

Add `locumAllowed?: boolean` to `ClinicNavItem`. Mark only `patients` and `queue` (Queue Board) as `locumAllowed: true`. In `SidebarNav`:

- Pull `isLocum` from `useAuth()`.
- If `isLocum`, filter list to only `locumAllowed` items.
- Hide the "Back to Staff Portal" footer link for locums (replace with an inline sign-out button via `signOut` from context, or simply hide).

## 6. Consultation end-state (`src/pages/clinic/ConsultationDetail.tsx`)

Pull `isLocum` from `useAuth()`. Update the post-action navigation calls:

- `handleSendToDispensary` (line ~376): `navigate(isLocum ? '/clinic/queue' : '/clinic/consultation', { replace: true })`
- Completion path at line ~403: same conditional.
- Back button at line ~492: `navigate(isLocum ? '/clinic/queue' : '/clinic/consultation')`.

Locums never see the consultation list (they don't need to triage); they bounce straight back to the queue to pick the next patient.

## Stop point

After these edits compile, stop and report. Manual QA checklist for the user:
1. Log in as locum → lands on `/clinic/queue`, sidebar shows only Patients + Queue Board.
2. Locum tries `/clinic/settings` directly → bounced to `/clinic/queue`.
3. Log in as staff/operations → can still reach `/clinic/queue`, `/clinic/billings`, `/clinic/inventory`.
4. Staff tries `/clinic/consultation/:id` → bounced to `/clinic/queue` (clinical-only).

No DB changes, no edge function changes.
