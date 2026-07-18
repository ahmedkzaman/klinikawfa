-- Restrict patient visit-attachment metadata and storage reads to operations,
-- admins, or the doctor assigned to the matching consultation.

BEGIN;

DO $preflight$
DECLARE
  v_metadata_qual text;
  v_storage_qual text;
BEGIN
  IF to_regprocedure('public.is_ops_or_admin(uuid)') IS NULL THEN
    RAISE EXCEPTION 'visit-attachment preflight failed; public.is_ops_or_admin(uuid) is missing';
  END IF;

  IF to_regprocedure('public.is_current_user_consultation_doctor(uuid)') IS NULL THEN
    RAISE EXCEPTION 'visit-attachment preflight failed; public.is_current_user_consultation_doctor(uuid) is missing';
  END IF;

  SELECT qual
    INTO v_metadata_qual
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'consultation_attachments'
     AND policyname IN ('attachments_read', 'attachments_scoped_read')
     AND cmd = 'SELECT'
     AND roles = ARRAY['authenticated']::name[];

  IF v_metadata_qual IS NULL
     OR (
       position('is_staff_or_clinical' in v_metadata_qual) = 0
       AND NOT (
         position('is_ops_or_admin' in v_metadata_qual) > 0
         AND position('is_current_user_consultation_doctor' in v_metadata_qual) > 0
       )
     ) THEN
    RAISE EXCEPTION 'visit-attachment preflight failed; unexpected consultation_attachments SELECT policy';
  END IF;

  SELECT qual
    INTO v_storage_qual
    FROM pg_policies
   WHERE schemaname = 'storage'
     AND tablename = 'objects'
     AND policyname = 'visit_attachment_read'
     AND cmd = 'SELECT'
     AND roles = ARRAY['authenticated']::name[];

  IF v_storage_qual IS NULL
     OR position('visit-attachment' in v_storage_qual) = 0
     OR (
       position('consultation_attachments' in v_storage_qual) > 0
       AND NOT (
         position('is_ops_or_admin' in v_storage_qual) > 0
         AND position('is_current_user_consultation_doctor' in v_storage_qual) > 0
       )
     ) THEN
    RAISE EXCEPTION 'visit-attachment preflight failed; unexpected storage SELECT policy';
  END IF;
END
$preflight$;

DROP POLICY IF EXISTS "attachments_read" ON public.consultation_attachments;
DROP POLICY IF EXISTS "attachments_scoped_read" ON public.consultation_attachments;

CREATE POLICY "attachments_scoped_read"
  ON public.consultation_attachments
  FOR SELECT
  TO authenticated
  USING (
    public.is_ops_or_admin(auth.uid())
    OR public.is_current_user_consultation_doctor(consultation_id)
  );

DROP POLICY IF EXISTS "visit_attachment_read" ON storage.objects;

CREATE POLICY "visit_attachment_read"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'visit-attachment'
    AND EXISTS (
      SELECT 1
        FROM public.consultation_attachments AS ca
       WHERE ca.file_path = storage.objects.name
         AND (
           public.is_ops_or_admin(auth.uid())
           OR public.is_current_user_consultation_doctor(ca.consultation_id)
         )
    )
  );

DO $postflight$
DECLARE
  v_metadata_qual text;
  v_storage_qual text;
BEGIN
  SELECT qual
    INTO v_metadata_qual
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'consultation_attachments'
     AND policyname = 'attachments_scoped_read'
     AND cmd = 'SELECT'
     AND roles = ARRAY['authenticated']::name[];

  IF v_metadata_qual IS NULL
     OR position('is_ops_or_admin' in v_metadata_qual) = 0
     OR position('is_current_user_consultation_doctor' in v_metadata_qual) = 0
     OR position('is_staff_or_clinical' in v_metadata_qual) > 0 THEN
    RAISE EXCEPTION 'visit-attachment postflight failed; metadata reads are not scoped';
  END IF;

  SELECT qual
    INTO v_storage_qual
    FROM pg_policies
   WHERE schemaname = 'storage'
     AND tablename = 'objects'
     AND policyname = 'visit_attachment_read'
     AND cmd = 'SELECT'
     AND roles = ARRAY['authenticated']::name[];

  IF v_storage_qual IS NULL
     OR position('visit-attachment' in v_storage_qual) = 0
     OR position('consultation_attachments' in v_storage_qual) = 0
     OR position('file_path' in v_storage_qual) = 0
     OR position('is_ops_or_admin' in v_storage_qual) = 0
     OR position('is_current_user_consultation_doctor' in v_storage_qual) = 0 THEN
    RAISE EXCEPTION 'visit-attachment postflight failed; storage reads are not scoped';
  END IF;
END
$postflight$;

COMMIT;
