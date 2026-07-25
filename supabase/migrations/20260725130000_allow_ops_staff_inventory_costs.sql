-- Operations staff manage inventory pricing and cost values.
-- Keep this role aligned with the inventory write policy.
CREATE OR REPLACE FUNCTION public.can_view_inventory_costs(_user_id uuid)
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
      AND role IN (
        'admin',
        'special_admin',
        'doctor_admin',
        'ops_staff',
        'operations',
        'staff',
        'resident_doctor'
      )
  )
$function$;
