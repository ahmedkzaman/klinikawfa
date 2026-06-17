
CREATE POLICY "Ops/admin can insert services"
  ON public.services FOR INSERT TO authenticated
  WITH CHECK (public.is_ops_or_admin(auth.uid()));

CREATE POLICY "Ops/admin can update services"
  ON public.services FOR UPDATE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()))
  WITH CHECK (public.is_ops_or_admin(auth.uid()));

CREATE POLICY "Ops/admin can delete services"
  ON public.services FOR DELETE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()));
