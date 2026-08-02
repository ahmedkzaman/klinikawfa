-- Task 3 follow-up: bounded ops discovery and authoritative offline-write locks.

ALTER TABLE public.clinic_appointments
  ADD COLUMN IF NOT EXISTS source_consultation_id uuid
    REFERENCES public.consultations(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.is_exact_ops_staff(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT p_user_id IS NOT NULL
    AND count(*) = 1
    AND min(role::text) = 'ops_staff'
  FROM public.user_roles
  WHERE user_id = p_user_id
$function$;

CREATE OR REPLACE FUNCTION public.is_eligible_offline_consultation_doctor(p_doctor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.doctors AS doctor
    WHERE doctor.id = p_doctor_id
      AND doctor.user_id IS NOT NULL
      AND doctor.on_duty
      AND doctor.status::text = 'active'
      AND (
        SELECT count(*) = 1
          AND min(role::text) IN ('resident_doctor', 'doctor_admin')
        FROM public.user_roles
        WHERE user_id = doctor.user_id
      )
  )
$function$;

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
    AND queue.clinic_status::text IN ('registered', 'ready_for_doctor', 'with_doctor', 'on_hold')
    AND (consultation.id IS NULL OR consultation.entry_source = 'offline_transcription');
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_eligible_offline_consultation_doctors()
RETURNS TABLE(id uuid, user_id uuid, name text, status text, on_duty boolean, avatar_url text)
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

  RETURN QUERY
  SELECT doctor.id, doctor.user_id, doctor.name, doctor.status::text,
         doctor.on_duty, doctor.avatar_url
  FROM public.doctors AS doctor
  WHERE public.is_eligible_offline_consultation_doctor(doctor.id)
  ORDER BY doctor.name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_offline_consultation_entry_state(p_consultation_id uuid)
RETURNS TABLE(
  consultation_id uuid,
  queue_entry_id uuid,
  doctor_id uuid,
  doctor_name text,
  approval_status text,
  approval_revision integer,
  entered_by_name text,
  entered_at timestamptz,
  approved_by_name text,
  approved_at timestamptz,
  return_reason text,
  consultation_status text,
  queue_status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NOT public.is_exact_ops_staff(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized_offline_consultation_entry_state'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT consultation.id, consultation.queue_entry_id, consultation.doctor_id,
         doctor.name, consultation.approval_status,
         consultation.approval_revision,
         COALESCE(NULLIF(btrim(entered_profile.full_name), ''), consultation.entered_by::text),
         consultation.created_at,
         COALESCE(NULLIF(btrim(approved_profile.full_name), ''), consultation.approved_by::text),
         consultation.approved_at, consultation.return_reason,
         consultation.status, queue.clinic_status::text
  FROM public.consultations AS consultation
  JOIN public.queue_entries AS queue ON queue.id = consultation.queue_entry_id
  JOIN public.doctors AS doctor ON doctor.id = consultation.doctor_id
  LEFT JOIN public.profiles AS entered_profile ON entered_profile.id = consultation.entered_by
  LEFT JOIN public.profiles AS approved_profile ON approved_profile.id = consultation.approved_by
  WHERE consultation.id = p_consultation_id
    AND consultation.deleted_at IS NULL
    AND consultation.entry_source = 'offline_transcription';
END;
$function$;

CREATE OR REPLACE FUNCTION public.assert_offline_consultation_editable(p_consultation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_entry_source text;
  v_approval_status text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role::text = 'ops_staff'
  ) THEN
    RETURN true;
  END IF;
  IF NOT public.is_exact_ops_staff(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized_offline_consultation_entry'
      USING ERRCODE = '42501';
  END IF;

  SELECT entry_source, approval_status
    INTO v_entry_source, v_approval_status
  FROM public.consultations
  WHERE id = p_consultation_id AND deleted_at IS NULL
  FOR SHARE;

  IF NOT FOUND OR v_entry_source <> 'offline_transcription'
     OR v_approval_status NOT IN ('pending', 'returned') THEN
    RAISE EXCEPTION 'offline_consultation_not_editable'
      USING ERRCODE = '42501';
  END IF;
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_offline_consultation_related_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_consultation_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role::text = 'ops_staff'
  ) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'vital_signs' THEN
    SELECT consultation.id INTO v_consultation_id
    FROM public.consultations AS consultation
    WHERE consultation.queue_entry_id = (CASE WHEN TG_OP = 'DELETE' THEN OLD.queue_entry_id ELSE NEW.queue_entry_id END)
      AND consultation.deleted_at IS NULL;
  ELSIF TG_TABLE_NAME = 'clinic_appointments' THEN
    v_consultation_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.source_consultation_id ELSE NEW.source_consultation_id END;
  ELSE
    v_consultation_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.consultation_id ELSE NEW.consultation_id END;
  END IF;

  IF v_consultation_id IS NOT NULL THEN
    PERFORM public.assert_offline_consultation_editable(v_consultation_id);
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_offline_consultation_doctor_eligibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NEW.entry_source = 'offline_transcription'
     AND public.is_exact_ops_staff(auth.uid())
     AND NOT public.is_eligible_offline_consultation_doctor(NEW.doctor_id) THEN
    RAISE EXCEPTION 'offline_consultation_ineligible_doctor'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_offline_consultation_doctor_eligibility ON public.consultations;
CREATE TRIGGER guard_offline_consultation_doctor_eligibility
  BEFORE INSERT OR UPDATE OF doctor_id ON public.consultations
  FOR EACH ROW EXECUTE FUNCTION public.guard_offline_consultation_doctor_eligibility();

DROP TRIGGER IF EXISTS guard_offline_consultation_items_write ON public.consultation_items;
CREATE TRIGGER guard_offline_consultation_items_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.consultation_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_offline_consultation_related_write();

DROP TRIGGER IF EXISTS guard_offline_vital_signs_write ON public.vital_signs;
CREATE TRIGGER guard_offline_vital_signs_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.vital_signs
  FOR EACH ROW EXECUTE FUNCTION public.guard_offline_consultation_related_write();

DROP TRIGGER IF EXISTS guard_offline_consultation_attachments_write ON public.consultation_attachments;
CREATE TRIGGER guard_offline_consultation_attachments_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.consultation_attachments
  FOR EACH ROW EXECUTE FUNCTION public.guard_offline_consultation_related_write();

DROP TRIGGER IF EXISTS guard_offline_consultation_documents_write ON public.consultation_documents;
CREATE TRIGGER guard_offline_consultation_documents_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.consultation_documents
  FOR EACH ROW EXECUTE FUNCTION public.guard_offline_consultation_related_write();

DROP TRIGGER IF EXISTS guard_offline_clinic_appointments_write ON public.clinic_appointments;
CREATE TRIGGER guard_offline_clinic_appointments_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.clinic_appointments
  FOR EACH ROW EXECUTE FUNCTION public.guard_offline_consultation_related_write();

CREATE OR REPLACE FUNCTION public.proceed_offline_consultation_to_dispensary(
  p_consultation_id uuid,
  p_expected_revision integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_consultation public.consultations%ROWTYPE;
  v_queue public.queue_entries%ROWTYPE;
BEGIN
  IF NOT public.is_exact_ops_staff(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized_offline_consultation_entry'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_consultation
  FROM public.consultations
  WHERE id = p_consultation_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND OR v_consultation.entry_source <> 'offline_transcription'
     OR v_consultation.approval_status NOT IN ('pending', 'returned') THEN
    RAISE EXCEPTION 'offline_consultation_not_editable'
      USING ERRCODE = '42501';
  END IF;
  IF v_consultation.approval_revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'stale_offline_consultation' USING ERRCODE = '40001';
  END IF;
  IF v_consultation.status = 'completed' THEN
    RAISE EXCEPTION 'consultation_workflow_state_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_queue
  FROM public.queue_entries
  WHERE id = v_consultation.queue_entry_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND OR v_queue.clinic_status::text NOT IN ('registered', 'ready_for_doctor', 'with_doctor', 'on_hold') THEN
    RAISE EXCEPTION 'consultation_workflow_state_invalid' USING ERRCODE = '22023';
  END IF;

  UPDATE public.queue_entries
  SET clinic_status = 'sent_to_dispensary', updated_at = now()
  WHERE id = v_queue.id;
  RETURN v_queue.id;
END;
$function$;

ALTER FUNCTION public.is_exact_ops_staff(uuid) OWNER TO postgres;
ALTER FUNCTION public.is_eligible_offline_consultation_doctor(uuid) OWNER TO postgres;
ALTER FUNCTION public.list_offline_consultation_entry_visits(timestamptz, timestamptz) OWNER TO postgres;
ALTER FUNCTION public.list_eligible_offline_consultation_doctors() OWNER TO postgres;
ALTER FUNCTION public.get_offline_consultation_entry_state(uuid) OWNER TO postgres;
ALTER FUNCTION public.assert_offline_consultation_editable(uuid) OWNER TO postgres;
ALTER FUNCTION public.guard_offline_consultation_related_write() OWNER TO postgres;
ALTER FUNCTION public.guard_offline_consultation_doctor_eligibility() OWNER TO postgres;
ALTER FUNCTION public.proceed_offline_consultation_to_dispensary(uuid, integer) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.is_exact_ops_staff(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_eligible_offline_consultation_doctor(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_offline_consultation_related_write() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_offline_consultation_doctor_eligibility() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.list_offline_consultation_entry_visits(timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_eligible_offline_consultation_doctors() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_offline_consultation_entry_state(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assert_offline_consultation_editable(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.proceed_offline_consultation_to_dispensary(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_offline_consultation_entry_visits(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_eligible_offline_consultation_doctors() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_offline_consultation_entry_state(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_offline_consultation_editable(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.proceed_offline_consultation_to_dispensary(uuid, integer) TO authenticated;
