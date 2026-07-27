CREATE TABLE IF NOT EXISTS public.clinic_user_permission_overrides (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_key text NOT NULL,
  allowed boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  PRIMARY KEY (user_id, permission_key)
);

ALTER TABLE public.clinic_user_permission_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "permission managers read user overrides"
  ON public.clinic_user_permission_overrides;
CREATE POLICY "permission managers read user overrides"
  ON public.clinic_user_permission_overrides
  FOR SELECT
  TO authenticated
  USING (public.can_manage_clinic_permissions((SELECT auth.uid())));

DROP POLICY IF EXISTS "permission managers write user overrides"
  ON public.clinic_user_permission_overrides;
CREATE POLICY "permission managers write user overrides"
  ON public.clinic_user_permission_overrides
  FOR ALL
  TO authenticated
  USING (public.can_manage_clinic_permissions((SELECT auth.uid())))
  WITH CHECK (public.can_manage_clinic_permissions((SELECT auth.uid())));

CREATE OR REPLACE FUNCTION public.has_clinic_permission(
  _permission_key text,
  _user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_role public.app_role;
  override_value boolean;
  role_value boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  IF _user_id <> auth.uid()
     AND NOT public.can_manage_clinic_permissions(auth.uid()) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  SELECT ur.role INTO target_role
  FROM public.user_roles ur
  WHERE ur.user_id = _user_id
  LIMIT 1;

  IF target_role IN ('admin', 'doctor_admin')
     AND _permission_key = 'access.manage_permissions' THEN
    RETURN true;
  END IF;

  SELECT o.allowed INTO override_value
  FROM public.clinic_user_permission_overrides o
  WHERE o.user_id = _user_id
    AND o.permission_key = _permission_key;

  IF FOUND THEN
    RETURN override_value;
  END IF;

  SELECT p.allowed INTO role_value
  FROM public.clinic_role_permissions p
  WHERE p.role = target_role
    AND p.permission_key = _permission_key;

  RETURN COALESCE(role_value, false);
END;
$$;

REVOKE ALL ON FUNCTION public.has_clinic_permission(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_clinic_permission(text, uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.get_clinic_user_permission_details(uuid);
CREATE FUNCTION public.get_clinic_user_permission_details(_target_user_id uuid)
RETURNS TABLE (
  permission_key text,
  role_allowed boolean,
  override_allowed boolean,
  effective_allowed boolean,
  updated_at timestamptz,
  updated_by uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH permission_keys(permission_key) AS (
    VALUES
      ('access.manage_permissions'),
      ('patients.view'),
      ('patients.edit'),
      ('queue.manage'),
      ('consultation.write'),
      ('billing.manage'),
      ('reports.view'),
      ('settings.manage')
  ),
  target_role AS (
    SELECT ur.role
    FROM public.user_roles ur
    WHERE ur.user_id = _target_user_id
    LIMIT 1
  )
  SELECT
    k.permission_key,
    COALESCE(rp.allowed, false) AS role_allowed,
    uo.allowed AS override_allowed,
    public.has_clinic_permission(k.permission_key, _target_user_id) AS effective_allowed,
    uo.updated_at,
    uo.updated_by
  FROM permission_keys k
  LEFT JOIN target_role tr ON true
  LEFT JOIN public.clinic_role_permissions rp
    ON rp.role = tr.role AND rp.permission_key = k.permission_key
  LEFT JOIN public.clinic_user_permission_overrides uo
    ON uo.user_id = _target_user_id AND uo.permission_key = k.permission_key
  WHERE public.can_manage_clinic_permissions(auth.uid())
  ORDER BY k.permission_key
$$;

REVOKE ALL ON FUNCTION public.get_clinic_user_permission_details(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_clinic_user_permission_details(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.set_clinic_user_permission_override(uuid, text, boolean);
CREATE FUNCTION public.set_clinic_user_permission_override(
  _target_user_id uuid,
  _permission_key text,
  _allowed boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role public.app_role;
  target_role public.app_role;
BEGIN
  IF NOT public.can_manage_clinic_permissions(auth.uid()) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  SELECT role INTO caller_role FROM public.user_roles
  WHERE user_id = auth.uid() LIMIT 1;
  SELECT role INTO target_role FROM public.user_roles
  WHERE user_id = _target_user_id LIMIT 1;

  IF target_role IS NULL THEN
    RAISE EXCEPTION 'USER_ROLE_NOT_FOUND';
  END IF;

  IF caller_role = 'doctor_admin' AND target_role = 'admin' THEN
    RAISE EXCEPTION 'PROTECTED_ADMIN_ACCOUNT';
  END IF;

  IF _target_user_id = auth.uid()
     AND _permission_key = 'access.manage_permissions'
     AND _allowed = false THEN
    RAISE EXCEPTION 'CANNOT_REMOVE_OWN_PERMISSION_ACCESS';
  END IF;

  INSERT INTO public.clinic_user_permission_overrides
    (user_id, permission_key, allowed, updated_by)
  VALUES
    (_target_user_id, _permission_key, _allowed, auth.uid())
  ON CONFLICT (user_id, permission_key)
  DO UPDATE SET
    allowed = EXCLUDED.allowed,
    updated_at = now(),
    updated_by = auth.uid();

  INSERT INTO public.user_activity_logs (user_id, user_name, action, details)
  VALUES (
    auth.uid(),
    '',
    'clinic_permission_override_updated',
    format('target=%s permission=%s allowed=%s', _target_user_id, _permission_key, _allowed)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_clinic_user_permission_override(uuid, text, boolean)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_clinic_user_permission_override(uuid, text, boolean)
  TO authenticated;

DROP FUNCTION IF EXISTS public.reset_clinic_user_permission_override(uuid, text);
CREATE FUNCTION public.reset_clinic_user_permission_override(
  _target_user_id uuid,
  _permission_key text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role public.app_role;
  target_role public.app_role;
BEGIN
  IF NOT public.can_manage_clinic_permissions(auth.uid()) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  SELECT role INTO caller_role FROM public.user_roles
  WHERE user_id = auth.uid() LIMIT 1;
  SELECT role INTO target_role FROM public.user_roles
  WHERE user_id = _target_user_id LIMIT 1;

  IF caller_role = 'doctor_admin' AND target_role = 'admin' THEN
    RAISE EXCEPTION 'PROTECTED_ADMIN_ACCOUNT';
  END IF;

  DELETE FROM public.clinic_user_permission_overrides
  WHERE user_id = _target_user_id
    AND (_permission_key IS NULL OR permission_key = _permission_key);

  INSERT INTO public.user_activity_logs (user_id, user_name, action, details)
  VALUES (
    auth.uid(),
    '',
    'clinic_permission_override_reset',
    format('target=%s permission=%s', _target_user_id, COALESCE(_permission_key, 'ALL'))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reset_clinic_user_permission_override(uuid, text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_clinic_user_permission_override(uuid, text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
