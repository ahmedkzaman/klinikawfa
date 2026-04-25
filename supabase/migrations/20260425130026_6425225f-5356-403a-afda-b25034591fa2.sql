ALTER TABLE public.diagnoses_backup_20260425 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "diagnoses_backup_admin_select"
  ON public.diagnoses_backup_20260425
  FOR SELECT
  TO authenticated
  USING (is_ops_or_admin(auth.uid()));