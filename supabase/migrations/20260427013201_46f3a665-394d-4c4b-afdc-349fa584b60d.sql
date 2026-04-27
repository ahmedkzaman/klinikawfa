CREATE OR REPLACE FUNCTION public.is_staff_or_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'staff', 'special_admin', 'doctor_admin', 'operations', 'locum')
  )
$$;