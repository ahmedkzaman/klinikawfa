
-- 1a. Tie-safe deduplication
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
DELETE FROM public.user_roles ur
USING ranked r
WHERE ur.ctid = r.ctid AND r.rn > 1;

-- 1b. Single-role constraint
ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_user_id_unique UNIQUE (user_id);

-- 1c. Recursion-proof RLS helpers
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin')
$$;

CREATE OR REPLACE FUNCTION public.is_staff_or_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'staff')
  )
$$;

ALTER FUNCTION public.has_role(uuid, public.app_role) OWNER TO postgres;
ALTER FUNCTION public.is_admin(uuid) OWNER TO postgres;
ALTER FUNCTION public.is_staff_or_admin(uuid) OWNER TO postgres;

-- 1d. Privileged role-assignment RPC
CREATE OR REPLACE FUNCTION public.admin_assign_role(
  target_user_id uuid,
  new_role public.app_role
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Authorization gate
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  -- Self-demotion guard
  IF target_user_id = auth.uid() AND new_role <> 'admin' THEN
    RAISE EXCEPTION 'CANNOT_DEMOTE_SELF' USING ERRCODE = 'P0001';
  END IF;

  -- Atomic upsert (single-role enforced by UNIQUE(user_id))
  INSERT INTO public.user_roles (user_id, role)
  VALUES (target_user_id, new_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;
END;
$$;

ALTER FUNCTION public.admin_assign_role(uuid, public.app_role) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.admin_assign_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_assign_role(uuid, public.app_role) TO authenticated;

-- 1e. Lock down user_roles writes; ensure SELECT policies exist
DO $$
DECLARE
  pol record;
BEGIN
  -- Drop any write policies (defensive)
  FOR pol IN
    SELECT polname
    FROM pg_policy
    WHERE polrelid = 'public.user_roles'::regclass
      AND polcmd IN ('a', 'w', 'd')  -- INSERT, UPDATE, DELETE
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.user_roles', pol.polname);
  END LOOP;
END $$;

-- Make sure RLS is enabled
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Drop & recreate SELECT policies idempotently
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;

CREATE POLICY "Users can view own roles"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));
