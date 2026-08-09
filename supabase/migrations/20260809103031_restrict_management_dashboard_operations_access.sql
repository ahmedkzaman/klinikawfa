-- Exclude operations staff and locums from management reporting at the
-- database boundary. Editing remains restricted to administrator roles.
CREATE OR REPLACE FUNCTION public.can_view_management_dashboard(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role::text = ANY (ARRAY[
        'admin', 'special_admin', 'doctor_admin', 'resident_doctor', 'staff',
        'purchaser', 'staff_nurse'
      ])
  );
$function$;

REVOKE ALL ON FUNCTION public.can_view_management_dashboard(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_management_dashboard(uuid) TO authenticated;
