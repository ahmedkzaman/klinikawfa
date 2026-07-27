CREATE TABLE IF NOT EXISTS public.clinic_role_permissions (
  role public.app_role NOT NULL,
  permission_key text NOT NULL,
  allowed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  PRIMARY KEY (role, permission_key)
);

ALTER TABLE public.clinic_role_permissions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_manage_clinic_permissions(
  _user_id uuid DEFAULT auth.uid()
)
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
      AND role IN ('admin', 'doctor_admin')
  )
$$;

REVOKE ALL ON FUNCTION public.can_manage_clinic_permissions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_clinic_permissions(uuid) TO authenticated;

DROP POLICY IF EXISTS "permission managers read matrix"
  ON public.clinic_role_permissions;
CREATE POLICY "permission managers read matrix"
  ON public.clinic_role_permissions
  FOR SELECT
  TO authenticated
  USING (public.can_manage_clinic_permissions((SELECT auth.uid())));

DROP POLICY IF EXISTS "permission managers write matrix"
  ON public.clinic_role_permissions;
CREATE POLICY "permission managers write matrix"
  ON public.clinic_role_permissions
  FOR ALL
  TO authenticated
  USING (public.can_manage_clinic_permissions((SELECT auth.uid())))
  WITH CHECK (public.can_manage_clinic_permissions((SELECT auth.uid())));

DROP FUNCTION IF EXISTS public.get_clinic_permission_matrix();
CREATE FUNCTION public.get_clinic_permission_matrix()
RETURNS TABLE (
  role public.app_role,
  permission_key text,
  allowed boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.role, p.permission_key, p.allowed
  FROM public.clinic_role_permissions AS p
  WHERE public.can_manage_clinic_permissions((SELECT auth.uid()))
  ORDER BY p.role, p.permission_key
$$;

REVOKE ALL ON FUNCTION public.get_clinic_permission_matrix() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_clinic_permission_matrix() TO authenticated;

DROP FUNCTION IF EXISTS public.set_clinic_permission(public.app_role, text, boolean);
CREATE FUNCTION public.set_clinic_permission(
  _role public.app_role,
  _permission_key text,
  _allowed boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_clinic_permissions((SELECT auth.uid())) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  IF _permission_key IS NULL OR btrim(_permission_key) = '' THEN
    RAISE EXCEPTION 'INVALID_PERMISSION_KEY';
  END IF;

  IF _role IN ('admin', 'doctor_admin')
     AND _permission_key = 'access.manage_permissions'
     AND NOT _allowed THEN
    RAISE EXCEPTION 'SYSTEM_PERMISSION_REQUIRED';
  END IF;

  INSERT INTO public.clinic_role_permissions (
    role,
    permission_key,
    allowed,
    updated_by
  )
  VALUES (
    _role,
    _permission_key,
    _allowed,
    (SELECT auth.uid())
  )
  ON CONFLICT (role, permission_key)
  DO UPDATE SET
    allowed = EXCLUDED.allowed,
    updated_at = now(),
    updated_by = (SELECT auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.set_clinic_permission(
  public.app_role,
  text,
  boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_clinic_permission(
  public.app_role,
  text,
  boolean
) TO authenticated;

NOTIFY pgrst, 'reload schema';
