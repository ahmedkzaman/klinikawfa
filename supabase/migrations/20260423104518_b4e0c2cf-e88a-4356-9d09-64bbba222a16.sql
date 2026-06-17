CREATE POLICY vital_signs_ops_insert ON public.vital_signs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_ops_or_admin(auth.uid()));

CREATE POLICY vital_signs_ops_update ON public.vital_signs
  FOR UPDATE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()))
  WITH CHECK (public.is_ops_or_admin(auth.uid()));

CREATE POLICY vital_signs_ops_delete ON public.vital_signs
  FOR DELETE TO authenticated
  USING (public.is_special_admin(auth.uid()));