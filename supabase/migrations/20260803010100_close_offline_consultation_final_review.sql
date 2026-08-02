-- Close the six release-review gaps without broadening the offline workflow.

BEGIN;

DO $preflight$
BEGIN
  IF to_regprocedure('public.is_exact_ops_staff(uuid)') IS NULL
     OR to_regprocedure('public.can_edit_dispensary_prices(uuid)') IS NULL
     OR to_regclass('public.consultation_attachments') IS NULL
     OR to_regclass('storage.objects') IS NULL THEN
    RAISE EXCEPTION 'offline final review preflight failed: required objects are missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.consultations
    WHERE deleted_at IS NULL
    GROUP BY queue_entry_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'offline final review preflight failed: duplicate active consultations exist'
      USING ERRCODE = '23505';
  END IF;
END
$preflight$;

CREATE UNIQUE INDEX IF NOT EXISTS consultations_queue_entry_id_active_uidx
  ON public.consultations (queue_entry_id)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.is_eligible_offline_consultation_doctor(
  p_doctor_id uuid
)
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
      AND doctor.status::text = 'active'
      AND (
        SELECT count(*) = 1
          AND min(role::text) IN ('resident_doctor', 'doctor_admin')
        FROM public.user_roles
        WHERE user_id = doctor.user_id
      )
  )
$function$;

CREATE OR REPLACE FUNCTION public.save_offline_consultation(
  p_queue_entry_id uuid,
  p_doctor_id uuid,
  p_original_consulted_at timestamptz,
  p_case_note text,
  p_diagnosis_id uuid,
  p_diagnosis_text text,
  p_dispense_note text,
  p_expected_revision integer
)
RETURNS public.consultations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_queue public.queue_entries%ROWTYPE;
  v_doctor public.doctors%ROWTYPE;
  v_consultation public.consultations%ROWTYPE;
  v_previous_doctor_id uuid;
  v_existing_return_reason text;
  v_action text;
BEGIN
  IF NOT public.is_exact_ops_staff(v_actor_id) THEN
    RAISE EXCEPTION 'not_authorized_offline_consultation_entry'
      USING ERRCODE = '42501';
  END IF;

  IF p_queue_entry_id IS NULL
     OR p_doctor_id IS NULL
     OR p_original_consulted_at IS NULL THEN
    RAISE EXCEPTION 'offline_consultation_required_fields_missing'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
    INTO v_queue
  FROM public.queue_entries
  WHERE id = p_queue_entry_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'offline_consultation_queue_visit_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT *
    INTO v_doctor
  FROM public.doctors AS doctor
  WHERE doctor.id = p_doctor_id
    AND doctor.user_id IS NOT NULL
    AND doctor.status::text = 'active'
  FOR UPDATE;

  IF NOT FOUND
     OR NOT public.is_eligible_offline_consultation_doctor(p_doctor_id) THEN
    RAISE EXCEPTION 'offline_consultation_ineligible_doctor'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
    INTO v_consultation
  FROM public.consultations
  WHERE queue_entry_id = p_queue_entry_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF p_expected_revision IS NULL THEN
    IF FOUND THEN
      RAISE EXCEPTION 'duplicate_offline_consultation'
        USING ERRCODE = '23505';
    END IF;

    v_consultation.id := gen_random_uuid();
    PERFORM public.open_offline_consultation_write_guard(v_consultation.id, v_actor_id);

    INSERT INTO public.consultations (
      id,
      queue_entry_id,
      patient_id,
      doctor_id,
      case_note,
      diagnosis_id,
      diagnosis_text,
      dispense_note,
      entry_source,
      entered_by,
      original_consulted_at,
      approval_status,
      approval_revision
    )
    VALUES (
      v_consultation.id,
      v_queue.id,
      v_queue.patient_id,
      v_doctor.id,
      COALESCE(p_case_note, ''),
      p_diagnosis_id,
      COALESCE(p_diagnosis_text, ''),
      COALESCE(p_dispense_note, ''),
      'offline_transcription',
      v_actor_id,
      p_original_consulted_at,
      'pending',
      0
    )
    RETURNING * INTO v_consultation;

    INSERT INTO public.consultation_approval_audit (
      consultation_id, action, actor_id, actor_name, snapshot
    )
    SELECT
      v_consultation.id,
      'submitted',
      v_actor_id,
      COALESCE(NULLIF(btrim(profile.full_name), ''), v_actor_id::text),
      jsonb_build_object(
        'entry_source', v_consultation.entry_source,
        'approval_status', v_consultation.approval_status,
        'doctor_id', v_consultation.doctor_id,
        'original_consulted_at', v_consultation.original_consulted_at
      )
    FROM (SELECT 1) AS singleton
    LEFT JOIN public.profiles AS profile ON profile.id = v_actor_id;

    PERFORM public.close_offline_consultation_write_guard(v_consultation.id, v_actor_id);
    RETURN v_consultation;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'stale_offline_consultation'
      USING ERRCODE = '40001';
  END IF;

  IF v_consultation.entry_source <> 'offline_transcription' THEN
    RAISE EXCEPTION 'duplicate_offline_consultation'
      USING ERRCODE = '23505';
  END IF;

  IF v_consultation.approval_status NOT IN ('pending', 'returned') THEN
    RAISE EXCEPTION 'offline_consultation_not_editable'
      USING ERRCODE = '42501';
  END IF;

  IF p_expected_revision IS NOT NULL
     AND v_consultation.approval_revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'stale_offline_consultation'
      USING ERRCODE = '40001';
  END IF;

  v_previous_doctor_id := v_consultation.doctor_id;
  v_existing_return_reason := v_consultation.return_reason;
  v_action := CASE
    WHEN v_consultation.approval_status = 'returned' THEN 'resubmitted'
    ELSE 'updated'
  END;

  PERFORM public.open_offline_consultation_write_guard(v_consultation.id, v_actor_id);

  UPDATE public.consultations
  SET doctor_id = v_doctor.id,
      case_note = COALESCE(p_case_note, ''),
      diagnosis_id = p_diagnosis_id,
      diagnosis_text = COALESCE(p_diagnosis_text, ''),
      dispense_note = COALESCE(p_dispense_note, ''),
      original_consulted_at = p_original_consulted_at,
      approval_status = 'pending',
      returned_by = null,
      returned_at = null,
      return_reason = null,
      approval_revision = approval_revision + 1
  WHERE id = v_consultation.id
  RETURNING * INTO v_consultation;

  INSERT INTO public.consultation_approval_audit (
    consultation_id, action, actor_id, actor_name, reason, snapshot
  )
  SELECT
    v_consultation.id,
    v_action,
    v_actor_id,
    COALESCE(NULLIF(btrim(profile.full_name), ''), v_actor_id::text),
    v_existing_return_reason,
    jsonb_build_object(
      'approval_status', v_consultation.approval_status,
      'doctor_id', v_consultation.doctor_id,
      'approval_revision', v_consultation.approval_revision
    )
  FROM (SELECT 1) AS singleton
  LEFT JOIN public.profiles AS profile ON profile.id = v_actor_id;

  IF v_previous_doctor_id IS DISTINCT FROM v_consultation.doctor_id THEN
    INSERT INTO public.consultation_approval_audit (
      consultation_id, action, actor_id, actor_name, snapshot
    )
    SELECT
      v_consultation.id,
      'doctor_reassigned',
      v_actor_id,
      COALESCE(NULLIF(btrim(profile.full_name), ''), v_actor_id::text),
      jsonb_build_object(
        'previous_doctor_id', v_previous_doctor_id,
        'doctor_id', v_consultation.doctor_id,
        'approval_revision', v_consultation.approval_revision
      )
    FROM (SELECT 1) AS singleton
    LEFT JOIN public.profiles AS profile ON profile.id = v_actor_id;
  END IF;

  PERFORM public.close_offline_consultation_write_guard(v_consultation.id, v_actor_id);
  RETURN v_consultation;
END;
$function$;

CREATE TABLE private.offline_consultation_attachment_reservations (
  id uuid PRIMARY KEY,
  consultation_id uuid NOT NULL REFERENCES public.consultations(id) ON DELETE CASCADE,
  reserved_by uuid NOT NULL REFERENCES auth.users(id),
  file_path text NOT NULL UNIQUE,
  file_name text NOT NULL CHECK (char_length(btrim(file_name)) BETWEEN 1 AND 512),
  content_type text CHECK (content_type IS NULL OR char_length(content_type) <= 255),
  file_size bigint NOT NULL CHECK (file_size > 0 AND file_size <= 5242880),
  remark text CHECK (remark IS NULL OR char_length(remark) <= 2000),
  status text NOT NULL DEFAULT 'reserved' CHECK (
    status IN ('reserved', 'finalizing', 'finalized', 'cleanup_required', 'cancelled')
  ),
  attachment_id uuid REFERENCES public.consultation_attachments(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  finalized_at timestamptz,
  resolved_at timestamptz,
  CHECK (expires_at > created_at),
  CHECK (file_path = consultation_id::text || '/offline-reservations/' || id::text)
);

CREATE INDEX offline_attachment_reservation_consultation_status_idx
  ON private.offline_consultation_attachment_reservations (
    consultation_id, status, expires_at
  );
CREATE INDEX offline_attachment_reservation_cleanup_idx
  ON private.offline_consultation_attachment_reservations (status, expires_at)
  WHERE status IN ('reserved', 'finalizing', 'cleanup_required');

ALTER TABLE private.offline_consultation_attachment_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.offline_consultation_attachment_reservations OWNER TO postgres;
REVOKE ALL ON TABLE private.offline_consultation_attachment_reservations
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.offline_consultation_attachment_upload_active(
  p_file_path text,
  p_actor_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, private
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM private.offline_consultation_attachment_reservations AS reservation
    WHERE reservation.file_path = p_file_path
      AND reservation.reserved_by = p_actor_id
      AND reservation.status IN ('reserved', 'finalizing')
      AND reservation.expires_at > now()
  )
$function$;

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
  v_is_offline_path boolean;
BEGIN
  IF p_actor_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.consultations AS consultation
    WHERE consultation.id::text = split_part(p_file_path, '/', 1)
      AND consultation.entry_source = 'offline_transcription'
  ) INTO v_is_offline_path;

  IF NOT v_is_offline_path THEN
    RETURN public.is_ops_or_admin(p_actor_id);
  END IF;

  RETURN public.is_exact_ops_staff(p_actor_id)
    AND private.offline_consultation_attachment_upload_active(
      p_file_path,
      p_actor_id
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.reserve_offline_consultation_attachment(
  p_consultation_id uuid,
  p_file_name text,
  p_content_type text,
  p_file_size bigint,
  p_remark text DEFAULT null
)
RETURNS TABLE(reservation_id uuid, file_path text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_consultation public.consultations%ROWTYPE;
  v_reservation_id uuid := gen_random_uuid();
  v_file_path text;
  v_expires_at timestamptz := now() + interval '15 minutes';
BEGIN
  IF NOT public.is_exact_ops_staff(v_actor_id) THEN
    RAISE EXCEPTION 'not_authorized_offline_consultation_entry'
      USING ERRCODE = '42501';
  END IF;
  IF p_consultation_id IS NULL
     OR p_file_size IS NULL
     OR p_file_size <= 0
     OR p_file_size > 5242880
     OR char_length(btrim(COALESCE(p_file_name, ''))) NOT BETWEEN 1 AND 512
     OR (p_content_type IS NOT NULL AND char_length(p_content_type) > 255)
     OR (p_remark IS NOT NULL AND char_length(p_remark) > 2000) THEN
    RAISE EXCEPTION 'offline_consultation_attachment_invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
    INTO v_consultation
  FROM public.consultations
  WHERE id = p_consultation_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND
     OR v_consultation.entry_source <> 'offline_transcription'
     OR v_consultation.approval_status NOT IN ('pending', 'returned') THEN
    RAISE EXCEPTION 'offline_consultation_not_editable'
      USING ERRCODE = '42501';
  END IF;

  v_file_path := p_consultation_id::text
    || '/offline-reservations/'
    || v_reservation_id::text;

  INSERT INTO private.offline_consultation_attachment_reservations (
    id,
    consultation_id,
    reserved_by,
    file_path,
    file_name,
    content_type,
    file_size,
    remark,
    expires_at
  ) VALUES (
    v_reservation_id,
    p_consultation_id,
    v_actor_id,
    v_file_path,
    btrim(p_file_name),
    NULLIF(btrim(COALESCE(p_content_type, '')), ''),
    p_file_size,
    NULLIF(btrim(COALESCE(p_remark, '')), ''),
    v_expires_at
  );

  RETURN QUERY SELECT v_reservation_id, v_file_path, v_expires_at;
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalize_offline_consultation_attachment(
  p_reservation_id uuid
)
RETURNS public.consultation_attachments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, storage
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_reservation private.offline_consultation_attachment_reservations%ROWTYPE;
  v_consultation public.consultations%ROWTYPE;
  v_attachment public.consultation_attachments%ROWTYPE;
BEGIN
  IF NOT public.is_exact_ops_staff(v_actor_id) THEN
    RAISE EXCEPTION 'not_authorized_offline_consultation_entry'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_reservation
  FROM private.offline_consultation_attachment_reservations
  WHERE id = p_reservation_id;

  IF NOT FOUND OR v_reservation.reserved_by <> v_actor_id THEN
    RAISE EXCEPTION 'offline_consultation_attachment_reservation_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT *
    INTO v_consultation
  FROM public.consultations
  WHERE id = v_reservation.consultation_id
    AND deleted_at IS NULL
  FOR UPDATE;

  SELECT *
    INTO v_reservation
  FROM private.offline_consultation_attachment_reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF v_reservation.status = 'finalized' AND v_reservation.attachment_id IS NOT NULL THEN
    SELECT *
      INTO v_attachment
    FROM public.consultation_attachments
    WHERE id = v_reservation.attachment_id;
    IF FOUND THEN
      RETURN v_attachment;
    END IF;
  END IF;

  IF NOT FOUND
     OR v_reservation.reserved_by <> v_actor_id
     OR v_reservation.status NOT IN ('reserved', 'finalizing') THEN
    RAISE EXCEPTION 'offline_consultation_attachment_reservation_not_active'
      USING ERRCODE = '55000';
  END IF;
  IF v_reservation.expires_at <= now() THEN
    RAISE EXCEPTION 'offline_consultation_attachment_reservation_expired'
      USING ERRCODE = '55000';
  END IF;
  IF v_consultation.entry_source <> 'offline_transcription'
     OR v_consultation.approval_status NOT IN ('pending', 'returned') THEN
    RAISE EXCEPTION 'offline_consultation_not_editable'
      USING ERRCODE = '42501';
  END IF;

  UPDATE private.offline_consultation_attachment_reservations
  SET status = 'finalizing'
  WHERE id = p_reservation_id;

  IF NOT EXISTS (
    SELECT 1
    FROM storage.objects AS object
    WHERE object.bucket_id = 'visit-attachment'
      AND object.name = v_reservation.file_path
  ) THEN
    RAISE EXCEPTION 'offline_consultation_attachment_object_missing'
      USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.consultation_attachments (
    consultation_id,
    file_path,
    file_name,
    content_type,
    uploaded_by,
    remark
  ) VALUES (
    v_reservation.consultation_id,
    v_reservation.file_path,
    v_reservation.file_name,
    v_reservation.content_type,
    v_actor_id,
    v_reservation.remark
  )
  RETURNING * INTO v_attachment;

  UPDATE private.offline_consultation_attachment_reservations
  SET status = 'finalized',
      attachment_id = v_attachment.id,
      finalized_at = now(),
      resolved_at = now()
  WHERE id = p_reservation_id;

  RETURN v_attachment;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_offline_consultation_attachment_upload(
  p_reservation_id uuid
)
RETURNS TABLE(status text, file_path text, attachment_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, storage
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_reservation private.offline_consultation_attachment_reservations%ROWTYPE;
  v_object_exists boolean;
BEGIN
  IF NOT public.is_exact_ops_staff(v_actor_id) THEN
    RAISE EXCEPTION 'not_authorized_offline_consultation_entry'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_reservation
  FROM private.offline_consultation_attachment_reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND OR v_reservation.reserved_by <> v_actor_id THEN
    RAISE EXCEPTION 'offline_consultation_attachment_reservation_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_reservation.status = 'finalized' THEN
    RETURN QUERY
    SELECT v_reservation.status, v_reservation.file_path, v_reservation.attachment_id;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM storage.objects AS object
    WHERE object.bucket_id = 'visit-attachment'
      AND object.name = v_reservation.file_path
  ) INTO v_object_exists;

  UPDATE private.offline_consultation_attachment_reservations
  SET status = CASE WHEN v_object_exists THEN 'cleanup_required' ELSE 'cancelled' END,
      resolved_at = now()
  WHERE id = p_reservation_id
  RETURNING * INTO v_reservation;

  RETURN QUERY
  SELECT v_reservation.status, v_reservation.file_path, v_reservation.attachment_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_offline_consultation_related_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $function$
DECLARE
  v_old_consultation_id uuid;
  v_new_consultation_id uuid;
  v_old_is_offline boolean := false;
  v_new_is_offline boolean := false;
  v_old_approval_status text;
  v_new_approval_status text;
  v_has_ops_role boolean;
  v_operational_item_update boolean := false;
  v_parent record;
BEGIN
  IF TG_TABLE_NAME = 'vital_signs' THEN
    IF TG_OP <> 'INSERT' THEN
      SELECT consultation.id
        INTO v_old_consultation_id
      FROM public.consultations AS consultation
      WHERE consultation.queue_entry_id = OLD.queue_entry_id
        AND consultation.deleted_at IS NULL;
    END IF;
    IF TG_OP <> 'DELETE' THEN
      SELECT consultation.id
        INTO v_new_consultation_id
      FROM public.consultations AS consultation
      WHERE consultation.queue_entry_id = NEW.queue_entry_id
        AND consultation.deleted_at IS NULL;
    END IF;
  ELSIF TG_TABLE_NAME = 'clinic_appointments' THEN
    IF TG_OP <> 'INSERT' THEN
      v_old_consultation_id := OLD.source_consultation_id;
    END IF;
    IF TG_OP <> 'DELETE' THEN
      v_new_consultation_id := NEW.source_consultation_id;
    END IF;
  ELSE
    IF TG_OP <> 'INSERT' THEN
      v_old_consultation_id := OLD.consultation_id;
    END IF;
    IF TG_OP <> 'DELETE' THEN
      v_new_consultation_id := NEW.consultation_id;
    END IF;
  END IF;

  FOR v_parent IN
    SELECT consultation.id,
           consultation.entry_source,
           consultation.approval_status
    FROM public.consultations AS consultation
    WHERE consultation.id = ANY (
      array_remove(ARRAY[v_old_consultation_id, v_new_consultation_id], null)
    )
      AND consultation.deleted_at IS NULL
    ORDER BY consultation.id
    FOR UPDATE
  LOOP
    IF v_parent.id = v_old_consultation_id THEN
      v_old_is_offline := v_parent.entry_source = 'offline_transcription';
      v_old_approval_status := v_parent.approval_status;
    END IF;
    IF v_parent.id = v_new_consultation_id THEN
      v_new_is_offline := v_parent.entry_source = 'offline_transcription';
      v_new_approval_status := v_parent.approval_status;
    END IF;
  END LOOP;

  IF NOT v_old_is_offline AND NOT v_new_is_offline THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'consultation_items' AND TG_OP = 'UPDATE' THEN
    v_operational_item_update :=
      OLD.consultation_id = NEW.consultation_id
      AND public.can_edit_dispensary_prices(auth.uid())
      AND (
        to_jsonb(NEW) - ARRAY['dispensed_qty', 'partial_reason', 'is_partial']
      ) = (
        to_jsonb(OLD) - ARRAY['dispensed_qty', 'partial_reason', 'is_partial']
      );
  END IF;

  IF (v_old_is_offline AND v_old_approval_status NOT IN ('pending', 'returned'))
     OR (v_new_is_offline AND v_new_approval_status NOT IN ('pending', 'returned')) THEN
    IF v_operational_item_update THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'offline_consultation_not_editable'
      USING ERRCODE = '42501';
  END IF;

  IF TG_TABLE_NAME = 'consultation_attachments'
     AND TG_OP = 'INSERT'
     AND v_new_is_offline THEN
    IF NOT public.is_exact_ops_staff(auth.uid())
       OR NOT EXISTS (
         SELECT 1
         FROM private.offline_consultation_attachment_reservations AS reservation
         WHERE reservation.consultation_id = NEW.consultation_id
           AND reservation.file_path = NEW.file_path
           AND reservation.reserved_by = auth.uid()
           AND reservation.status = 'finalizing'
           AND reservation.expires_at > now()
       ) THEN
      RAISE EXCEPTION 'offline_consultation_attachment_reservation_required'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role::text = 'ops_staff'
  ) INTO v_has_ops_role;

  IF v_has_ops_role AND NOT public.is_exact_ops_staff(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized_offline_consultation_entry'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION private.guard_offline_approval_attachment_reservations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, storage
AS $function$
BEGIN
  IF NEW.entry_source <> 'offline_transcription'
     OR NEW.approval_status <> 'approved'
     OR OLD.approval_status = 'approved' THEN
    RETURN NEW;
  END IF;

  UPDATE private.offline_consultation_attachment_reservations AS reservation
  SET status = CASE
        WHEN EXISTS (
          SELECT 1
          FROM storage.objects AS object
          WHERE object.bucket_id = 'visit-attachment'
            AND object.name = reservation.file_path
        ) THEN 'cleanup_required'
        ELSE 'cancelled'
      END,
      resolved_at = now()
  WHERE reservation.consultation_id = NEW.id
    AND reservation.status IN ('reserved', 'finalizing')
    AND reservation.expires_at <= now();

  IF EXISTS (
    SELECT 1
    FROM private.offline_consultation_attachment_reservations AS reservation
    WHERE reservation.consultation_id = NEW.id
      AND reservation.status IN ('reserved', 'finalizing')
      AND reservation.expires_at > now()
  ) THEN
    RAISE EXCEPTION 'offline_consultation_attachment_upload_pending'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_offline_approval_attachment_reservations
  ON public.consultations;
CREATE TRIGGER guard_offline_approval_attachment_reservations
  BEFORE UPDATE OF approval_status ON public.consultations
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_offline_approval_attachment_reservations();

DROP POLICY IF EXISTS "visit_attachment_insert" ON storage.objects;
CREATE POLICY "visit_attachment_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'visit-attachment'
    AND private.can_insert_offline_consultation_attachment_object(
      name,
      (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "visit_attachment_read" ON storage.objects;
CREATE POLICY "visit_attachment_read"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'visit-attachment'
    AND (
      EXISTS (
        SELECT 1
        FROM public.consultation_attachments AS attachment
        WHERE attachment.file_path = storage.objects.name
          AND (
            public.is_ops_or_admin((SELECT auth.uid()))
            OR public.is_current_user_consultation_doctor(attachment.consultation_id)
          )
      )
      OR private.offline_consultation_attachment_upload_active(
        name,
        (SELECT auth.uid())
      )
    )
  );

ALTER FUNCTION public.is_eligible_offline_consultation_doctor(uuid) OWNER TO postgres;
ALTER FUNCTION public.save_offline_consultation(uuid, uuid, timestamptz, text, uuid, text, text, integer)
  OWNER TO postgres;
ALTER FUNCTION private.offline_consultation_attachment_upload_active(text, uuid)
  OWNER TO postgres;
ALTER FUNCTION private.can_insert_offline_consultation_attachment_object(text, uuid)
  OWNER TO postgres;
ALTER FUNCTION public.reserve_offline_consultation_attachment(uuid, text, text, bigint, text)
  OWNER TO postgres;
ALTER FUNCTION public.finalize_offline_consultation_attachment(uuid) OWNER TO postgres;
ALTER FUNCTION public.cancel_offline_consultation_attachment_upload(uuid) OWNER TO postgres;
ALTER FUNCTION public.guard_offline_consultation_related_write() OWNER TO postgres;
ALTER FUNCTION private.guard_offline_approval_attachment_reservations() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.is_eligible_offline_consultation_doctor(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_offline_consultation(uuid, uuid, timestamptz, text, uuid, text, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_offline_consultation(uuid, uuid, timestamptz, text, uuid, text, text, integer)
  TO authenticated;

REVOKE ALL ON FUNCTION private.offline_consultation_attachment_upload_active(text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.can_insert_offline_consultation_attachment_object(text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.offline_consultation_attachment_upload_active(text, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_insert_offline_consultation_attachment_object(text, uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION public.reserve_offline_consultation_attachment(uuid, text, text, bigint, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_offline_consultation_attachment(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_offline_consultation_attachment_upload(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_offline_consultation_attachment(uuid, text, text, bigint, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_offline_consultation_attachment(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_offline_consultation_attachment_upload(uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION public.guard_offline_consultation_related_write()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.guard_offline_approval_attachment_reservations()
  FROM PUBLIC, anon, authenticated;

GRANT USAGE ON SCHEMA private TO authenticated;

DO $postflight$
DECLARE
  v_index_is_unique boolean;
  v_index_predicate text;
BEGIN
  SELECT index_definition.indisunique,
         pg_get_expr(index_definition.indpred, index_definition.indrelid)
    INTO v_index_is_unique, v_index_predicate
  FROM pg_index AS index_definition
  WHERE index_definition.indexrelid =
    'public.consultations_queue_entry_id_active_uidx'::regclass;

  IF NOT COALESCE(v_index_is_unique, false)
     OR v_index_predicate IS NULL
     OR position('deleted_at IS NULL' in v_index_predicate) = 0 THEN
    RAISE EXCEPTION 'offline final review postflight failed: active consultation invariant';
  END IF;

  IF has_table_privilege(
       'authenticated',
       'private.offline_consultation_attachment_reservations',
       'SELECT,INSERT,UPDATE,DELETE'
     )
     OR has_function_privilege(
       'anon',
       'public.reserve_offline_consultation_attachment(uuid,text,text,bigint,text)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'authenticated',
       'public.finalize_offline_consultation_attachment(uuid)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'offline final review postflight failed: reservation privileges';
  END IF;
END
$postflight$;

NOTIFY pgrst, 'reload schema';

COMMIT;
