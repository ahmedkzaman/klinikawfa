-- The previous Task 3 migration is local-time stamped at 23:30, so this
-- CLI-created additive migration is ordered immediately after it.

CREATE OR REPLACE FUNCTION public.list_offline_consultation_entry_visits(
  p_start timestamptz,
  p_end timestamptz
)
RETURNS TABLE(queue_entry_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NOT public.is_exact_ops_staff(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized_offline_consultation_entry'
      USING ERRCODE = '42501';
  END IF;
  IF p_start IS NULL OR p_end IS NULL OR p_end <= p_start OR p_end > p_start + interval '32 days' THEN
    RAISE EXCEPTION 'offline_consultation_visit_window_invalid'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT queue.id
  FROM public.queue_entries AS queue
  LEFT JOIN public.consultations AS consultation
    ON consultation.queue_entry_id = queue.id
   AND consultation.deleted_at IS NULL
  WHERE queue.deleted_at IS NULL
    AND queue.visit_purpose = 'consultation'
    AND queue.created_at >= p_start
    AND queue.created_at < p_end
    AND (
      (
        consultation.id IS NULL
        AND queue.clinic_status::text IN (
          'registered', 'ready_for_doctor', 'with_doctor', 'on_hold'
        )
      )
      OR (
        consultation.entry_source = 'offline_transcription'
        AND consultation.approval_status IN ('pending', 'returned', 'approved')
      )
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_offline_consultation_attachment(
  p_attachment_id uuid,
  p_consultation_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_entry_source text;
  v_approval_status text;
  v_file_path text;
BEGIN
  IF NOT public.is_exact_ops_staff(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized_offline_consultation_entry'
      USING ERRCODE = '42501';
  END IF;

  SELECT consultation.entry_source,
         consultation.approval_status,
         attachment.file_path
    INTO v_entry_source, v_approval_status, v_file_path
  FROM public.consultation_attachments AS attachment
  JOIN public.consultations AS consultation
    ON consultation.id = attachment.consultation_id
  WHERE attachment.id = p_attachment_id
    AND attachment.consultation_id = p_consultation_id
    AND consultation.deleted_at IS NULL
  FOR UPDATE OF consultation, attachment;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'offline_consultation_attachment_not_found'
      USING ERRCODE = 'P0002';
  END IF;
  IF v_entry_source <> 'offline_transcription'
     OR v_approval_status NOT IN ('pending', 'returned') THEN
    RAISE EXCEPTION 'offline_consultation_not_editable'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.consultation_attachments
  WHERE id = p_attachment_id
    AND consultation_id = p_consultation_id;

  RETURN v_file_path;
END;
$function$;

ALTER FUNCTION public.list_offline_consultation_entry_visits(timestamptz, timestamptz)
  OWNER TO postgres;
ALTER FUNCTION public.delete_offline_consultation_attachment(uuid, uuid)
  OWNER TO postgres;

REVOKE ALL ON FUNCTION public.list_offline_consultation_entry_visits(timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_offline_consultation_entry_visits(timestamptz, timestamptz)
  TO authenticated;

REVOKE ALL ON FUNCTION public.delete_offline_consultation_attachment(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_offline_consultation_attachment(uuid, uuid)
  TO authenticated;
