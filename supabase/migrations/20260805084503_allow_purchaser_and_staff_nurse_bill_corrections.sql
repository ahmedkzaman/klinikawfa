-- Purchasers and staff nurses are operation staff for completed-bill
-- correction purposes. The mutation itself remains behind the existing
-- completed-visit, stale-fingerprint, audit, and protected-item guards.
CREATE OR REPLACE FUNCTION public.can_correct_completed_bill(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT _user_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.user_roles ur
       WHERE ur.user_id = _user_id
         AND ur.role::text IN (
           'ops_staff', 'operations', 'staff', 'purchaser', 'staff_nurse',
           'admin', 'special_admin', 'doctor_admin'
         )
     );
$function$;

ALTER FUNCTION public.can_correct_completed_bill(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.can_correct_completed_bill(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_correct_completed_bill(uuid) TO authenticated;
