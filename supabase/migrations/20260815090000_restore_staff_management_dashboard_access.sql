-- Generic clinic staff are allowed to view the management dashboard by default.
-- Operations roles and locums remain blocked unless an account-specific override
-- explicitly grants management_dashboard.view.
CREATE OR REPLACE FUNCTION public.can_view_management_dashboard(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT COALESCE(
    (
      SELECT o.allowed
      FROM public.clinic_user_permission_overrides o
      WHERE o.user_id = _user_id
        AND o.permission_key = 'management_dashboard.view'
      LIMIT 1
    ),
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND ur.role::text = ANY (ARRAY[
          'admin', 'special_admin', 'doctor_admin', 'resident_doctor',
          'staff', 'purchaser', 'staff_nurse'
        ])
    )
  );
$function$;

REVOKE ALL ON FUNCTION public.can_view_management_dashboard(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_management_dashboard(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
