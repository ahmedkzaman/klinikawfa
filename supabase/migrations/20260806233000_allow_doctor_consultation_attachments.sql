-- Doctors (including locums) may attach files to consultations they own.
-- Offline consultations remain reservation-gated for operations staff.
CREATE OR REPLACE FUNCTION private.can_insert_offline_consultation_attachment_object(
  p_file_path text,
  p_actor_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $function$
DECLARE
  v_consultation_id uuid;
  v_is_offline_path boolean;
BEGIN
  IF p_actor_id IS NULL THEN RETURN false; END IF;
  BEGIN
    v_consultation_id := split_part(p_file_path, '/', 1)::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN false;
  END;

  SELECT consultation.entry_source = 'offline_transcription'
    INTO v_is_offline_path
    FROM public.consultations AS consultation
   WHERE consultation.id = v_consultation_id;

  IF NOT COALESCE(v_is_offline_path, false) THEN
    RETURN public.is_ops_or_admin(p_actor_id)
       OR public.is_current_user_consultation_doctor(v_consultation_id);
  END IF;

  RETURN public.is_exact_ops_staff(p_actor_id)
     AND private.offline_consultation_attachment_upload_active(p_file_path, p_actor_id);
END;
$function$;

DROP POLICY IF EXISTS "attachments_insert" ON public.consultation_attachments;
CREATE POLICY "attachments_insert"
  ON public.consultation_attachments FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_ops_or_admin(auth.uid())
    OR public.is_current_user_consultation_doctor(consultation_id)
  );
