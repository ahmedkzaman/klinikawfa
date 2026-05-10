DROP POLICY IF EXISTS "corporate_clients_auth_select" ON public.corporate_clients;
CREATE POLICY "Privileged roles can read corporate_clients"
ON public.corporate_clients
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.user_roles
  WHERE user_id = auth.uid()
    AND role IN ('staff','resident_doctor','operations','admin','special_admin','doctor_admin')
));