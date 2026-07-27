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
      AND role IN ('admin', 'special_admin', 'doctor_admin')
  )
$$;

REVOKE ALL ON FUNCTION public.can_manage_clinic_permissions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_clinic_permissions(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
