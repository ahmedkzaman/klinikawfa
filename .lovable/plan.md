

## Fix: Allow users to read their own role from `user_roles`

### Problem
The `user_roles` table currently only has a SELECT policy for admins (`is_admin(auth.uid())`). When a non-admin user (like staff) logs in, they cannot read their own role, so the app defaults to `roles = []` and hides the Staff Portal link.

### Solution
Add one new RLS policy to `user_roles`:

```sql
CREATE POLICY "Users can view own role"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
```

This allows any authenticated user to read their own role record, while the existing admin policies remain unchanged for full role management (insert/update/delete).

### What stays the same
- Admins keep full SELECT/INSERT/UPDATE/DELETE access to all roles
- Only admins can assign, change, or remove roles
- Users can only see their own role, not anyone else's

