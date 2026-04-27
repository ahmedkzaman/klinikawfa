## Problem

Your account's role is `special_admin`, but the Postgres function `public.is_staff_or_admin(_user_id)` only returns `true` for roles `'admin'` and `'staff'`. Since ~50 RLS policies across the app gate access through this function, any user whose role is `special_admin`, `doctor_admin`, `operations`, or `locum` is silently blocked from reading most staff data.

That's why the Employees page only shows you — your own profile leaks through via the "Users can view own profile" self-policy, but every other profile is blocked. Arfazilah and the other 7 staff are in the database; you just can't see them.

This bug is also silently affecting: appointments, blog posts, blog categories, gallery images, team members, reviews, video rooms, video payments, consultation transcripts, geofence zones, staff tasks, task delete requests, saved rosters, staff notifications, circular notices, and several storage buckets (gallery, team photos, videos).

The frontend (`AuthContext.isStaffOrAdmin`) already correctly treats all six roles as "staff or admin" — only the database function is stale.

## Fix — single migration

Update `public.is_staff_or_admin()` to recognize every role the app semantically considers staff:

```sql
CREATE OR REPLACE FUNCTION public.is_staff_or_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'staff', 'special_admin', 'doctor_admin', 'operations', 'locum')
  )
$$;
```

This mirrors `AuthContext.isStaffOrAdmin` exactly and immediately unblocks all ~50 policies for the affected roles — no policy edits needed. `guest` is intentionally excluded (matches frontend).

## Verification

After the migration:
- Reload `/staff/admin/employees` — all 9 staff (including Arfazilah Binti Razak) should appear.
- Spot-check Blog, Gallery, Reviews, Calendar, Roster pages still load.

## Out of scope

- No RLS policy edits.
- No frontend changes.
- `is_admin()` is already correct (already includes `special_admin` + `doctor_admin`).