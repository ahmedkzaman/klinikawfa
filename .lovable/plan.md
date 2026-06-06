# Merge Appointment Sync into Staff Calendar (Role-Gated)

Merge the public appointment booking dashboard into the existing Staff Calendar as a second tab. Page is visible to all staff, but mutation buttons are gated to admin/ops so the UI matches the DB-level RPC check.

## 1. New component — `src/components/staff/calendar/AppointmentsPanel.tsx`

- Move the entire body of `src/pages/staff/admin/AppointmentsView.tsx` here: data fetch via `@tanstack/react-query`, inner Upcoming/Pending tabs, table, `AlertDialog` confirmations, and the `promote_appointment_to_clinic` RPC call.
- Import `useAuth` and derive:
  ```ts
  const { isAdmin, isOps } = useAuth(); // use whichever flags exist
  const canManage = isAdmin || isOps;
  ```
  (Confirm exact field names from `AuthContext` during implementation; fall back to a role-string check if needed.)
- Wrap the "Actions" `<TableHead>` and every per-row action button (Cancel, Mark Completed, Force Confirm) in `{canManage && ...}`.
- Standard staff see a clean read-only dashboard; admin/ops see the full action set. RPC `is_ops_or_admin` check stays untouched as a defense-in-depth backstop.

## 2. Refactor `src/pages/staff/Calendar.tsx`

- Keep the existing Task/Leave calendar UI intact — extract it into a local `TaskCalendarView` block or inline under the first tab.
- Add `Tabs` wrapper using shadcn `Tabs`:
  - Tab 1: **Task Calendar** (existing month/week/day + dialog).
  - Tab 2: **Appointments** → `<AppointmentsPanel />`.
- Sync active tab with URL:
  ```ts
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'appointments' ? 'appointments' : 'calendar';
  const onTabChange = (v: string) => setParams(p => { p.set('tab', v); return p; }, { replace: true });
  ```
- Default tab when no param: `calendar`.

## 3. Routing — `src/App.tsx`

- Remove `import AppointmentsView from "./pages/staff/admin/AppointmentsView"`.
- Remove the `<Route path="admin/appointments" element={<AppointmentsView />} />` line.
- Leave the existing `/staff/calendar` route as-is.

## 4. Sidebar — `src/components/staff/StaffLayout.tsx`

- Remove the "Appointments" item from `adminNavItems`.
- In `staffNavItems`, rename the existing Calendar item label to `"Calendar & Appointments"` (icon and href unchanged).

## 5. Cleanup

- Delete `src/pages/staff/admin/AppointmentsView.tsx` after the extraction is verified.

## Acceptance checks

- `/staff/calendar` loads with two tabs; default is Task Calendar.
- `/staff/calendar?tab=appointments` deep-links to the Appointments tab.
- Non-admin/non-ops staff: see table data, no Actions column, no action buttons.
- Admin/ops: see all action buttons; Force Confirm still triggers `promote_appointment_to_clinic` and invalidates both `['admin-appointments']` and `['clinic', 'clinic_appointments']` query keys.
- `/staff/admin/appointments` no longer resolves; sidebar shows the renamed entry only once.
