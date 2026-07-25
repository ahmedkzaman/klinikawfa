-- Dispensary item price edits update consultation_items, not inventory_items.
-- Keep the database staff helpers aligned with the frontend AppRole list.
CREATE OR REPLACE FUNCTION public.is_staff_or_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN (
        'admin', 'special_admin', 'doctor_admin', 'ops_staff', 'operations',
        'staff', 'purchaser', 'staff_nurse'
      )
  )
$function$;

ALTER FUNCTION public.is_staff_or_admin(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_staff_or_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_staff_or_admin(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_ops_or_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN (
        'admin', 'special_admin', 'doctor_admin', 'ops_staff', 'operations',
        'staff', 'purchaser', 'staff_nurse', 'resident_doctor'
      )
  )
$function$;

ALTER FUNCTION public.is_ops_or_admin(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_ops_or_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_ops_or_admin(uuid) TO authenticated;
