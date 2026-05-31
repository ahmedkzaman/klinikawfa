-- Pivot is_internal_staff from exclusion list to explicit inclusion list.
-- Mirrors the isStaffOrAdmin flag in AuthContext.tsx so frontend and backend
-- share one definition of "permanent internal employee".
CREATE OR REPLACE FUNCTION public.is_internal_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN (
        'admin',
        'special_admin',
        'doctor_admin',
        'staff',
        'ops_staff',
        'operations',
        'resident_doctor'
      )
  )
$$;