DROP POLICY IF EXISTS "vendor_invoices_read" ON public.vendor_invoices;
CREATE POLICY "Privileged roles can read vendor_invoices"
ON public.vendor_invoices
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.user_roles
  WHERE user_id = auth.uid()
    AND role IN ('staff','resident_doctor','operations','admin','special_admin','doctor_admin')
));