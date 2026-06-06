DROP POLICY IF EXISTS "Privileged roles can read patients" ON public.patients;

CREATE POLICY "Privileged roles can read patients"
ON public.patients
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = ANY (ARRAY[
        'staff'::app_role,
        'ops_staff'::app_role,
        'operations'::app_role,
        'resident_doctor'::app_role,
        'locum'::app_role,
        'doctor_admin'::app_role,
        'admin'::app_role,
        'special_admin'::app_role
      ])
  )
);