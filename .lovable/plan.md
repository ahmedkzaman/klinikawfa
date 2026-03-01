
# Plan: Add "guest" Role

## Overview

Add a `guest` role to the system. Guests are authenticated users who should NOT have access to the staff dashboard (`/staff/*`) or admin dashboard (`/admin/*`). They can only access public pages and their own profile.

## Changes

### 1. Database Migration

Add `guest` to the `app_role` enum:

```sql
ALTER TYPE public.app_role ADD VALUE 'guest';
```

### 2. Update AuthContext (`src/contexts/AuthContext.tsx`)

- Add `'guest'` to the `AppRole` type: `'admin' | 'staff' | 'guest'`
- Add a computed `isGuest` boolean to the context (true when user has only the `guest` role and no `staff`/`admin` role)

### 3. Update ProtectedRoute (`src/components/ProtectedRoute.tsx`)

No changes needed -- existing `requireStaffOrAdmin` already blocks guests since `isStaffOrAdmin` checks for `admin` or `staff` roles only, and guests have neither.

### 4. Update StaffLayout (`src/components/staff/StaffLayout.tsx`)

No changes needed -- the `isStaffOrAdmin` check at line 149 already blocks guests and redirects them to `/`.

### 5. Update AdminLayout (`src/components/admin/AdminLayout.tsx`)

No changes needed -- already wrapped with `<ProtectedRoute requireStaffOrAdmin>`.

### 6. Update Admin Employees page (`src/pages/staff/admin/Employees.tsx`)

Add `guest` as an assignable role option in the role dropdown so admins can assign the guest role to users.

## Summary

| File | Change |
|------|--------|
| Migration SQL | Add `guest` to `app_role` enum |
| `src/contexts/AuthContext.tsx` | Add `guest` to `AppRole` type, add `isGuest` |
| `src/pages/staff/admin/Employees.tsx` | Add `guest` to role assignment dropdown |

The existing access control logic (`isStaffOrAdmin`) automatically excludes guests from `/staff/*` and `/admin/*` without any additional changes.
