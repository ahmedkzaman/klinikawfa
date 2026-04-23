
## Step 4 — Clinic Portal Foundation (Routes + Layout + Empty Pages)

Scope: Wire `ClinicProtectedRoute` into `App.tsx`, add a `ClinicLayout` shell with sidebar navigation, and stub the six core clinic pages as empty-state placeholders. No business logic, no data fetching, no inventory UI. Each page renders a heading + "Coming in Step 5" empty state so the navigation graph is fully clickable and route guards are testable end-to-end.

---

### 4.1 — Clinic layout shell

New file: `src/components/clinic/ClinicLayout.tsx`

- Mirror the split-scroll pattern from `StaffLayout` (`mem://style/layout/independent-scrolling`): fixed sidebar (independently scrollable) + scrollable main content area.
- Sidebar contains: clinic logo/title at top, nav items (see 4.2), back-link to `/staff/dashboard` at bottom.
- Use semantic tokens only (`bg-background`, `text-foreground`, `border-border`, `bg-sidebar`, `text-sidebar-foreground`, `bg-sidebar-accent` for active state).
- Active route highlighted via `NavLink`'s `isActive` callback.
- Renders `<Outlet />` for nested routes.
- Mobile (<768px): sidebar collapses to a `Sheet` triggered by a hamburger in a top bar — same pattern as existing `StaffLayout`.

### 4.2 — Clinic navigation items

Hard-coded inside `ClinicLayout`. Six entries, each with a `lucide-react` icon:

| Path | Label | Icon |
|---|---|---|
| `/clinic/queue` | Queue Board | `ListOrdered` |
| `/clinic/patients` | Patients | `Users` |
| `/clinic/consultations` | Consultations | `Stethoscope` |
| `/clinic/dispensary` | Dispensary | `Pill` |
| `/clinic/inventory` | Inventory | `Package` |
| `/clinic/voided` | Voided Records | `Archive` (special_admin only — hidden via `useAuth().isSpecialAdmin`) |

### 4.3 — Six placeholder pages

New folder: `src/pages/clinic/`

Files (each ~25 lines, identical structure):
- `QueueBoard.tsx`
- `PatientsList.tsx`
- `ConsultationsList.tsx`
- `Dispensary.tsx`
- `Inventory.tsx`
- `VoidedRecords.tsx`

Each page renders:
- `<SEOHead>` with page-specific title.
- An `h1` with the page name.
- A muted-foreground subtitle ("Step 5 will wire this up").
- A centered empty-state card with the page's icon + a one-line description.

No data fetching, no buttons, no forms. These exist purely so route guards and navigation can be smoke-tested.

### 4.4 — Wire clinic routes in `App.tsx`

Add a single nested route block under the existing routes:

```tsx
<Route
  path="/clinic"
  element={
    <ClinicProtectedRoute>
      <ClinicLayout />
    </ClinicProtectedRoute>
  }
>
  <Route index element={<Navigate to="queue" replace />} />
  <Route path="queue" element={<QueueBoard />} />
  <Route path="patients" element={<PatientsList />} />
  <Route path="consultations" element={<ConsultationsList />} />
  <Route path="dispensary" element={<Dispensary />} />
  <Route path="inventory" element={<Inventory />} />
  <Route
    path="voided"
    element={
      <ClinicProtectedRoute requiredRole="special_admin">
        <VoidedRecords />
      </ClinicProtectedRoute>
    }
  />
</Route>
```

The nested `ClinicProtectedRoute` on `/clinic/voided` adds the special_admin gate on top of the parent ops-or-admin gate.

### 4.5 — Add "Open Clinic Portal" link in StaffLayout sidebar

Single-line addition: a nav item visible only when `isOpsOrAdmin`, linking to `/clinic/queue`. Placed in the "Applications" group of the staff sidebar. Existing staff portal navigation untouched otherwise.

---

### Out of scope for Step 4

- Any actual clinic logic: queue table, patient registration form, consultation editor, dispense flow, e-invoice submission, inventory CRUD.
- Edge functions (`intake-bridge`, `einvoice-submit`).
- Realtime subscriptions.
- Inventory Stock/Allocated/Available column UI.
- Voided records list rendering (the page exists but shows the empty state — `fetchVoided` wiring is Step 5).
- `package.json` additions.

### Verification after Step 4

1. TypeScript compiles cleanly.
2. Logged-out user visiting `/clinic/queue` → redirected to `/auth?redirect=%2Fclinic%2Fqueue`.
3. Staff-role user visiting `/clinic/queue` → redirected to `/staff/dashboard`.
4. Operations/admin user visiting `/clinic/queue` → sees the Queue Board placeholder with sidebar navigation.
5. Admin (non-special) visiting `/clinic/voided` → redirected to `/staff/dashboard`.
6. Special-admin sees the "Voided Records" sidebar entry; others do not.
7. Sidebar links navigate between the six pages without full page reloads.

**Stop after these files. Do not begin Step 5 (data wiring + real clinic UI).**
