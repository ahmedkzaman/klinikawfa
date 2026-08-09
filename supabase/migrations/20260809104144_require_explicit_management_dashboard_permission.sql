-- Management dashboard is closed by default. Users can view it only when an
-- admin/doctor-admin grants the account-specific override below.
CREATE OR REPLACE FUNCTION public.can_view_management_dashboard(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.clinic_user_permission_overrides o
    JOIN public.user_roles ur
      ON ur.user_id = o.user_id
    WHERE o.user_id = _user_id
      AND o.permission_key = 'management_dashboard.view'
      AND o.allowed IS TRUE
  );
$function$;

CREATE OR REPLACE FUNCTION public.get_clinic_user_permission_details(_target_user_id uuid)
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
      ('settings.manage'),
      ('management_dashboard.view')
  ),
  target_role AS (
    SELECT ur.role
    FROM public.user_roles ur
    WHERE ur.user_id = _target_user_id
    LIMIT 1
  )
  SELECT
    k.permission_key,
    CASE
      WHEN k.permission_key = 'management_dashboard.view' THEN false
      ELSE COALESCE(rp.allowed, false)
    END AS role_allowed,
    uo.allowed AS override_allowed,
    CASE
      WHEN k.permission_key = 'management_dashboard.view'
        THEN public.can_view_management_dashboard(_target_user_id)
      ELSE public.has_clinic_permission(k.permission_key, _target_user_id)
    END AS effective_allowed,
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

REVOKE ALL ON FUNCTION public.can_view_management_dashboard(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_management_dashboard(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_clinic_user_permission_details(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_clinic_user_permission_details(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
