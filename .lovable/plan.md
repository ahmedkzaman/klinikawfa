## Goal
Lock the locum role down to exactly three clinic pages: **Appointments**, **Queue Board**, **Consultation**. Everything else in `/clinic/*` — including Patients, Dispensary, Billings, Inventory, Procurement, Procurement Dashboard, Settings, etc. — must be hidden from the sidebar and blocked at the route level.

## Current state (audit)
- `procurement-dashboard` route is already gated by `ops_or_admin`, which excludes locum. ✓ (no route change needed.)
- `patients` and `consultation*` routes are gated by `clinical`, which **includes locum** — locums can currently reach Patients. ✗
- Sidebar `clinicNavItems` in `src/components/clinic/ClinicLayout.tsx` currently flags **Patients** and **Queue Board** as `locumAllowed`, but not Appointments or Consultation. Wrong set. ✗

## Changes

### 1. `src/components/clinic/ClinicLayout.tsx` — fix `locumAllowed` flags
Update the three relevant rows in `clinicNavItems` so locum sees exactly Appointments, Queue Board, Consultation:
- Remove `locumAllowed: true` from the **Patients** row.
- Add `locumAllowed: true` to the **Appointments** row.
- Add `locumAllowed: true` to the **Consultation** row.
- Keep `locumAllowed: true` on **Queue Board**.

The existing `if (isLocum) return !!item.locumAllowed;` filter then yields exactly the three allowed items in both desktop sidebar and mobile drawer.

### 2. `src/components/ClinicProtectedRoute.tsx` — add a `clinical_staff` tier
Introduce a new `requiredRole` value `'clinical_staff'` that means "clinical, but not locum":
```ts
if (requiredRole === 'clinical_staff') {
  if (isLocum) return <Navigate to="/clinic/queue" replace />;
  if (!isClinical) return <Navigate to="/clinic/queue" replace />;
  return <>{children}</>;
}
```
Add `'clinical_staff'` to the `requiredRole` union type.

### 3. `src/App.tsx` — block Patients for locum
Change the `patients` route guard from `requiredRole="clinical"` to `requiredRole="clinical_staff"`. Leave `consultation` and `consultation/:queueEntryId` on `clinical` (locum must keep consulting). Leave every other route unchanged — they already default to `ops_or_admin`, which excludes locum.

### 4. Defensive redirect on direct URL hits
A locum typing `/clinic/procurement-dashboard`, `/clinic/inventory`, etc. is already bounced by `ClinicProtectedRoute`'s `if (isLocum) return <Navigate to="/clinic/queue" replace />;` fallback. No additional work needed.

## Out of scope
- No DB / RLS changes.
- No changes to the staff portal or to non-locum roles.
- No changes to the Procurement Dashboard Settings RBAC (already shipped).

## Verification
- Sign in as `locum`: sidebar shows only Appointments, Queue Board, Consultation. Manually visiting `/clinic/patients`, `/clinic/procurement-dashboard`, `/clinic/inventory`, `/clinic/billings`, `/clinic/settings` all redirect to `/clinic/queue`.
- Sign in as `doctor_admin` / `admin` / `operations` / `resident_doctor`: nav unchanged from today; Patients still reachable for clinical roles.
- TypeScript clean (new union member added in both the type and the guard).