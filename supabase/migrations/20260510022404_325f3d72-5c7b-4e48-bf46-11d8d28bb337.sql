DROP POLICY IF EXISTS "Authenticated can read patients" ON public.patients;

CREATE POLICY "Privileged roles can read patients"
ON public.patients
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('staff','resident_doctor','operations','admin','special_admin','doctor_admin')
  )
);