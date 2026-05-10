CREATE POLICY "ops_or_admin can delete consultation_documents"
  ON public.consultation_documents
  FOR DELETE
  USING (public.is_ops_or_admin(auth.uid()));