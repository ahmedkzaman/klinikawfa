
## Plan: Harden RBAC — Final (Self-Lockout Guard + Null-Safe Guest)

All prior items locked in. Two patches added.

### 1. Database migration

**a. Tie-safe deduplication** (oldest `ctid` wins on ties, highest privilege wins otherwise):
```sql
WITH ranked AS (
  SELECT ctid, user_id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY
        CASE role WHEN 'admin' THEN 3 WHEN 'staff' THEN 2 ELSE 1 END DESC,
        ctid ASC
    ) AS rn
  FROM public.user_roles
)
DELETE FROM public.user_roles ur USING ranked r
WHERE ur.ctid = r.ctid AND r.rn > 1;
```

**b. Single-role constraint**
- Drop existing `UNIQUE (user_id, role)` if present.
- `ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_unique UNIQUE (user_id);`

**c. Recursion-proof RLS helpers**
`CREATE OR REPLACE` `has_role`, `is_admin`, `is_staff_or_admin` — `LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public`. Then explicitly:
```sql
ALTER FUNCTION public.has_role(uuid, app_role) OWNER TO postgres;
ALTER FUNCTION public.is_admin(uuid) OWNER TO postgres;
ALTER FUNCTION public.is_staff_or_admin(uuid) OWNER TO postgres;
```
Definer + `postgres` owner means helper queries on `user_roles` bypass RLS — no recursion risk if a future policy on `user_roles` calls `is_admin()`.

**d. RPC `public.admin_assign_role(target_user_id uuid, new_role app_role)`**
- `SECURITY DEFINER`, `SET search_path = public`, `LANGUAGE plpgsql`, `OWNER TO postgres`.
- Body order:
  1. Authorization gate:
     ```sql
     IF NOT public.is_admin(auth.uid()) THEN
       RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
     END IF;
     ```
  2. **Self-demotion guard** (new):
     ```sql
     IF target_user_id = auth.uid() AND new_role <> 'admin' THEN
       RAISE EXCEPTION 'CANNOT_DEMOTE_SELF' USING ERRCODE = 'P0001';
     END IF;
     ```
  3. Atomic upsert:
     ```sql
     INSERT INTO public.user_roles (user_id, role)
     VALUES (target_user_id, new_role)
     ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;
     ```
- `GRANT EXECUTE ON FUNCTION public.admin_assign_role(uuid, app_role) TO authenticated;`

**e. Lock down `user_roles` writes**
- Drop any existing INSERT/UPDATE/DELETE policies on `public.user_roles` (defensive — none currently exposed).
- Ensure SELECT policies:
  - `Users can view own roles` → `auth.uid() = user_id`
  - `Admins can view all roles` → `public.is_admin(auth.uid())`
- No write policies; mutation only via RPC.

### 2. Frontend — `src/contexts/AuthContext.tsx`

Migrate from `roles: AppRole[]` to `role: AppRole | null`.

**Public API:**
```ts
interface AuthContextType {
  // ...
  role: AppRole | null;
  isAdmin: boolean;
  isStaffOrAdmin: boolean;
  isGuest: boolean;        // null-safe
  // ...
}
```

**Internal:**
- `const [role, setRole] = useState<AppRole | null>(null);`
- Rename `fetchUserRoles` → `fetchUserRole`; use `.maybeSingle()`:
  ```ts
  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();
  setRole((data?.role as AppRole) ?? null);
  ```
- Derived flags:
  - `isAdmin = role === 'admin'`
  - `isStaffOrAdmin = role === 'admin' || role === 'staff'`
  - **`isGuest = role === 'guest' || role === null`** (null-safe — brand-new users with no row are treated as restricted)
- Sign-out: `setRole(null)`.

### 3. Frontend — `src/components/ProtectedRoute.tsx`

Currently consumes `isAdmin` / `isStaffOrAdmin` only — those still resolve correctly. Confirm during implementation that any unauthenticated-but-known-role user lands on the guest waiting screen (see step 5).

### 4. Frontend — `src/pages/staff/admin/Employees.tsx`

- Replace delete-then-insert with RPC:
  ```ts
  const { error } = await supabase.rpc('admin_assign_role', {
    target_user_id: userId,
    new_role: newRole,
  });
  ```
- Error mapping in toasts:
  - `42501` / message contains `NOT_AUTHORIZED` → "You do not have permission to change roles"
  - message contains `CANNOT_DEMOTE_SELF` → "You cannot demote your own admin account. Ask another admin."
  - other → existing generic "Failed to update role"
- UX guard: in the role `<Select>` for the currently logged-in admin row, disable the `staff` and `guest` options (compare row's `id` to `user.id`). Prevents the error-path round-trip for the common case while the DB remains the source of truth.
- Simplify `fetchEmployees` aggregation — one row per user:
  ```ts
  const roleMap: Record<string, AppRole> = {};
  roles?.forEach((r) => { roleMap[r.user_id] = r.role as AppRole; });
  ```

### 5. Guest / unassigned routing

Audit `ProtectedRoute` flow: when `isGuest === true` (i.e. `role` is `'guest'` OR `null`), authenticated users hitting `/staff/*` routes are redirected to a generic guest landing (existing behavior for guests). New users with no `user_roles` row now follow the same path instead of falling through to a permission-denied flash.

### 6. Audit other consumers

Search for any remaining `useAuth()` consumers reading `roles` or using `.includes(`. Migrate each to the new `role` API. Most code already reads the derived booleans, so impact should be limited.

### 7. Security follow-up

After deploy, re-run the security scanner. Mark `SUPA_rls_policy_always_true` fixed if still flagged; confirm `user_roles` shows only the two SELECT policies.

### Files touched
- New migration: dedup → `UNIQUE(user_id)` → recreate helpers (`OWNER TO postgres`, STABLE, SECURITY DEFINER, `search_path=public`) → create `admin_assign_role` RPC with auth gate + self-demotion guard + atomic upsert → grant EXECUTE → audit `user_roles` policies.
- Edited: `src/contexts/AuthContext.tsx` — `role: AppRole | null` API, null-safe `isGuest`.
- Edited: `src/pages/staff/admin/Employees.tsx` — RPC call, self-demote UI guard, error mapping, simplified aggregation.
- Edited: any other file consuming `roles[]` from `useAuth()` (audit pass).

### Out of scope
- Multi-role support.
- RLS write policies on `user_roles`.
- Role-change audit log.
- Cross-admin demotion guards (admins can still demote other admins by design).
