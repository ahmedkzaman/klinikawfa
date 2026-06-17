DROP POLICY IF EXISTS consultation_items_ops_insert ON public.consultation_items;
DROP POLICY IF EXISTS consultation_items_update_active ON public.consultation_items;

CREATE POLICY consultation_items_staff_insert
  ON public.consultation_items FOR INSERT TO authenticated
  WITH CHECK (public.is_staff_or_admin(auth.uid()));

CREATE POLICY consultation_items_staff_update_active
  ON public.consultation_items FOR UPDATE TO authenticated
  USING (deleted_at IS NULL AND public.is_staff_or_admin(auth.uid()))
  WITH CHECK (public.is_staff_or_admin(auth.uid()));