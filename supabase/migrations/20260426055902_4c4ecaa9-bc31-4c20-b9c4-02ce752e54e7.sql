-- 1. Tracking table for clinical attachments
CREATE TABLE public.consultation_attachments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id uuid NOT NULL REFERENCES public.consultations(id) ON DELETE CASCADE,
  file_path       text NOT NULL,
  file_name       text NOT NULL,
  content_type    text,
  uploaded_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_consultation_attachments_consultation
  ON public.consultation_attachments (consultation_id);

ALTER TABLE public.consultation_attachments ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated clinic user
CREATE POLICY "attachments_read"
  ON public.consultation_attachments FOR SELECT
  TO authenticated
  USING (true);

-- Insert: ops/admin only (Dispensary staff + doctors)
CREATE POLICY "attachments_insert"
  ON public.consultation_attachments FOR INSERT
  TO authenticated
  WITH CHECK (public.is_ops_or_admin(auth.uid()));

-- Delete: ops/admin only
CREATE POLICY "attachments_delete"
  ON public.consultation_attachments FOR DELETE
  TO authenticated
  USING (public.is_ops_or_admin(auth.uid()));

-- 2. Storage policies on the EXISTING private bucket 'visit-attachment'
-- (bucket already exists; do not recreate it)
DROP POLICY IF EXISTS "visit_attachment_read"   ON storage.objects;
DROP POLICY IF EXISTS "visit_attachment_insert" ON storage.objects;
DROP POLICY IF EXISTS "visit_attachment_delete" ON storage.objects;

CREATE POLICY "visit_attachment_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'visit-attachment');

CREATE POLICY "visit_attachment_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'visit-attachment'
    AND public.is_ops_or_admin(auth.uid())
  );

CREATE POLICY "visit_attachment_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'visit-attachment'
    AND public.is_ops_or_admin(auth.uid())
  );