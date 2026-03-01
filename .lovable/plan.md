

# Plan: Auto-redirect to Staff Dashboard + Hide Admin Section for Non-Admins

## Changes

### 1. Add index redirect for `/staff` route (`src/App.tsx`)

Add an index route under `/staff` that redirects to `/staff/dashboard` using React Router's `Navigate` component. This ensures that when an admin (or staff) navigates to `/staff`, they land on the dashboard automatically.

```
<Route path="/staff" element={<StaffLayout />}>
  <Route index element={<Navigate to="/staff/dashboard" replace />} />
  ...
</Route>
```

### 2. Hide Admin section from non-admin staff (`src/components/staff/StaffLayout.tsx`)

The "Admin" section (Employees, Zones, Assignments, Requests) is already wrapped in `{isAdmin && (...)}` -- this is correct.

The "Website" section (content management links) is currently visible to all staff. Wrap it in the same `{isAdmin && (...)}` guard so only admins can see it.

Move the Website section inside the existing admin conditional block, or add a separate `{isAdmin && (...)}` wrapper around lines 97-121.

## Files Modified

| File | Change |
|------|--------|
| `src/App.tsx` | Add `<Route index element={<Navigate to="/staff/dashboard" replace />} />` under `/staff` |
| `src/components/staff/StaffLayout.tsx` | Wrap "Website" nav section with `{isAdmin && (...)}` |

