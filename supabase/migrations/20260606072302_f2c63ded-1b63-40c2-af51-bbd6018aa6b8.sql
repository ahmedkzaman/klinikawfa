CREATE OR REPLACE FUNCTION public.is_ops_or_admin(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin','special_admin','doctor_admin','ops_staff','operations','staff','resident_doctor')
  )
$function$;