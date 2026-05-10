DROP POLICY IF EXISTS "Authenticated can read queue_entries" ON public.queue_entries;
DROP POLICY IF EXISTS "queue_entries_read_active" ON public.queue_entries;

CREATE POLICY "Privileged roles can read queue_entries"
ON public.queue_entries
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('staff','resident_doctor','operations','admin','special_admin','doctor_admin')
  )
);