

# Plan: Remove Duplicate User Role Management Page

## Overview

Keep the **Employees** page at `/staff/admin/employees` and remove the **User Management** page at `/admin/users` to have only one place to manage user roles.

## Changes

### 1. Delete `src/pages/admin/UserManagement.tsx`

Remove the file entirely.

### 2. Update `src/pages/admin/index.ts`

Remove the `UserManagement` export from the admin pages barrel file.

### 3. Update `src/App.tsx`

- Remove the `UserManagement` import
- Remove the route `<Route path="users" element={<UserManagement />} />`

### 4. Update `src/components/admin/AdminSidebar.tsx`

Remove the "User Management" / "Pengurusan Pengguna" link from the admin sidebar navigation.

## Summary

| File | Change |
|------|--------|
| `src/pages/admin/UserManagement.tsx` | Delete file |
| `src/pages/admin/index.ts` | Remove export |
| `src/App.tsx` | Remove import and route |
| `src/components/admin/AdminSidebar.tsx` | Remove sidebar link |

