
# Plan: Show All Registered Users to Admin

## Overview

Update the User Management page to display all registered users in the system, not just those who already have admin or staff roles. This will allow admins to easily see who has registered and assign roles to new users.

## Current Behavior

- The table only shows users who have at least one role assigned
- Users who register but have no roles are invisible in the admin panel
- Admins must manually enter the email address to find and add roles to new users

## Proposed Changes

### User Interface Updates

The User Management page will be reorganized to show:

1. **All registered users** in the main table (not just those with roles)
2. **Clear role indicators** showing Admin, Staff, or "No Role" for each user
3. **Quick role assignment** directly from the table without needing the "Add Role" dialog for existing users
4. **User count** updated to show total registered users

### Visual Changes

```text
Current:                          After:
+-------------------------+       +-------------------------+
| 2 users with roles      |       | 3 registered users      |
+-------------------------+       +-------------------------+
| user@admin.com | Admin  |       | user@admin.com | Admin  |
| staff@clinic.com| Staff |       | staff@clinic.com| Staff |
+-------------------------+       | patient@mail.com| None  |
                                  +-------------------------+
```

## Technical Implementation

### File: `src/pages/admin/UserManagement.tsx`

| Change | Description |
|--------|-------------|
| Remove role filter on table | Show all users from `users` array instead of `users.filter(u => u.roles.length > 0)` |
| Update header text | Change from "X users with roles" to "X registered users" |
| Update empty state | Change message when no users exist at all |
| Add "No Role" badge option | Display a muted badge for users without any role |
| Keep role dropdown functional | Allow changing from "None" to Admin/Staff directly in the table |

### Code Changes Summary

1. **Line 300-301**: Update the subtitle to show total user count
2. **Line 323**: Remove the filter on the empty state check  
3. **Line 342**: Remove the `.filter(u => u.roles.length > 0)` from the table rows
4. **Add visual indicator**: Show a muted "No Role" badge for users without roles

## Security Note

No database or RLS changes are needed. The existing RLS policy on `profiles` table already allows staff/admin to view all profiles:

```sql
Policy: "Staff/Admin can view all profiles"
USING: is_staff_or_admin(auth.uid())
```

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/admin/UserManagement.tsx` | Remove role filters, update counts and labels, add "No Role" indicator |
