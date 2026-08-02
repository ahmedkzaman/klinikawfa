-- Offline transcription is a clinical provenance workflow. The two public
-- RPCs below are the only paths that can alter its server-controlled state.

BEGIN;

ALTER TABLE public.consultations
  ADD COLUMN IF NOT EXISTS entry_source text NOT NULL DEFAULT 'live',
  ADD COLUMN IF NOT EXISTS entered_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS original_consulted_at timestamptz,
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS returned_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS returned_at timestamptz,
  ADD COLUMN IF NOT EXISTS return_reason text,
  ADD COLUMN IF NOT EXISTS approval_revision integer NOT NULL DEFAULT 0;

ALTER TABLE public.consultations
  ADD CONSTRAINT consultations_entry_source_check
    CHECK (entry_source IN ('live', 'offline_transcription')),
  ADD CONSTRAINT consultations_approval_status_check
    CHECK (approval_status IN ('not_required', 'pending', 'returned', 'approved')),
  ADD CONSTRAINT consultations_offline_provenance_check
    CHECK (
      (
        entry_source = 'live'
        AND approval_status = 'not_required'
        AND entered_by IS NULL
        AND original_consulted_at IS NULL
      )
      OR (
        entry_source = 'offline_transcription'
        AND entered_by IS NOT NULL
        AND original_consulted_at IS NOT NULL
        AND approval_status IN ('pending', 'returned', 'approved')
      )
    ),
  ADD CONSTRAINT consultations_approval_transition_fields_check
    CHECK (
      approval_revision >= 0
      AND (approval_status <> 'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
      AND (approval_status <> 'returned' OR (
        returned_by IS NOT NULL
        AND returned_at IS NOT NULL
        AND coalesce(btrim(return_reason), '') <> ''
      ))
    );

CREATE TABLE IF NOT EXISTS public.consultation_approval_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id uuid NOT NULL REFERENCES public.consultations(id),
  action text NOT NULL CHECK (
    action IN (
      'submitted',
      'updated',
      'resubmitted',
      'doctor_reassigned',
      'approved',
      'returned'
    )
  ),
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  actor_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  reason text,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
    jsonb_typeof(snapshot) = 'object'
    AND pg_column_size(snapshot) <= 16384
  )
);

CREATE TABLE IF NOT EXISTS public.offline_consultation_write_guard (
  transaction_id bigint NOT NULL,
  backend_pid integer NOT NULL,
  consultation_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  PRIMARY KEY (transaction_id, backend_pid, consultation_id, actor_id)
);

ALTER TABLE public.consultation_approval_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offline_consultation_write_guard ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultation_approval_audit OWNER TO postgres;
ALTER TABLE public.offline_consultation_write_guard OWNER TO postgres;

REVOKE ALL PRIVILEGES ON TABLE public.consultation_approval_audit FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.offline_consultation_write_guard FROM PUBLIC, anon, authenticated;

CREATE INDEX consultation_approval_audit_consultation_created_idx
  ON public.consultation_approval_audit (consultation_id, created_at DESC, id DESC);
CREATE INDEX consultation_approval_audit_actor_created_idx
  ON public.consultation_approval_audit (actor_id, created_at DESC, id DESC);
CREATE INDEX consultations_offline_approval_worklist_idx
  ON public.consultations (doctor_id, approval_status, original_consulted_at DESC)
  WHERE deleted_at IS NULL AND entry_source = 'offline_transcription';

CREATE OR REPLACE FUNCTION public.offline_consultation_write_guard_active(
  p_consultation_id uuid,
  p_actor_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.offline_consultation_write_guard AS guard
    WHERE guard.transaction_id = txid_current()
      AND guard.backend_pid = pg_backend_pid()
      AND guard.consultation_id = p_consultation_id
      AND guard.actor_id = p_actor_id
  );
$function$;

CREATE OR REPLACE FUNCTION public.open_offline_consultation_write_guard(
  p_consultation_id uuid,
  p_actor_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  INSERT INTO public.offline_consultation_write_guard (
    transaction_id,
    backend_pid,
    consultation_id,
    actor_id
  )
  VALUES (txid_current(), pg_backend_pid(), p_consultation_id, p_actor_id)
  ON CONFLICT DO NOTHING;
END;
$function$;

CREATE OR REPLACE FUNCTION public.close_offline_consultation_write_guard(
  p_consultation_id uuid,
  p_actor_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  DELETE FROM public.offline_consultation_write_guard
  WHERE transaction_id = txid_current()
    AND backend_pid = pg_backend_pid()
    AND consultation_id = p_consultation_id
    AND actor_id = p_actor_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_offline_consultation_provenance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_protected_change boolean;
BEGIN
  v_protected_change := (TG_OP = 'INSERT' AND NEW.entry_source = 'offline_transcription')
    OR NEW.entry_source IS DISTINCT FROM OLD.entry_source
    OR NEW.entered_by IS DISTINCT FROM OLD.entered_by
    OR NEW.original_consulted_at IS DISTINCT FROM OLD.original_consulted_at
    OR NEW.approval_status IS DISTINCT FROM OLD.approval_status
    OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
    OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
    OR NEW.returned_by IS DISTINCT FROM OLD.returned_by
    OR NEW.returned_at IS DISTINCT FROM OLD.returned_at
    OR NEW.return_reason IS DISTINCT FROM OLD.return_reason
    OR NEW.approval_revision IS DISTINCT FROM OLD.approval_revision;

  IF v_protected_change
     AND NOT public.offline_consultation_write_guard_active(NEW.id, auth.uid()) THEN
    RAISE EXCEPTION 'offline_consultation_provenance_managed_by_rpc'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_offline_consultation_provenance ON public.consultations;
CREATE TRIGGER guard_offline_consultation_provenance
  BEFORE INSERT OR UPDATE ON public.consultations
  FOR EACH ROW EXECUTE FUNCTION public.guard_offline_consultation_provenance();

-- Preserve the live completed-note lock while allowing only the guarded RPC
-- to correct a returned offline record that has already been checked out.
CREATE OR REPLACE FUNCTION public.guard_completed_consultation_notes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF OLD.status = 'completed'
     AND (NEW.case_note IS DISTINCT FROM OLD.case_note
          OR NEW.dispense_note IS DISTINCT FROM OLD.dispense_note)
     AND NOT (public.is_admin(auth.uid()) OR public.has_strict_role(auth.uid(), 'doctor'))
     AND NOT public.offline_consultation_write_guard_active(OLD.id, auth.uid())
  THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Completed consultation notes are immutable for this role'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

DROP POLICY IF EXISTS consultations_offline_direct_insert_denied ON public.consultations;
CREATE POLICY consultations_offline_direct_insert_denied
  ON public.consultations
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (entry_source = 'live' AND approval_status = 'not_required');

DROP POLICY IF EXISTS consultations_offline_direct_update_denied ON public.consultations;
CREATE POLICY consultations_offline_direct_update_denied
  ON public.consultations
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (entry_source = 'live')
  WITH CHECK (entry_source = 'live' AND approval_status = 'not_required');

CREATE POLICY consultation_approval_audit_read
  ON public.consultation_approval_audit
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.consultations AS consultation
      LEFT JOIN public.doctors AS doctor ON doctor.id = consultation.doctor_id
      WHERE consultation.id = consultation_approval_audit.consultation_id
        AND (
          (
            consultation.entered_by = auth.uid()
            AND EXISTS (
              SELECT 1 FROM public.user_roles
              WHERE user_id = auth.uid() AND role::text = 'ops_staff'
            )
          )
          OR (
            doctor.user_id = auth.uid()
            AND NOT EXISTS (
              SELECT 1 FROM public.user_roles
              WHERE user_id = auth.uid() AND role::text = 'locum'
            )
          )
          OR EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid() AND role::text = 'doctor_admin'
          )
        )
    )
  );

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
  v_role text;
  v_queue public.queue_entries%ROWTYPE;
  v_doctor public.doctors%ROWTYPE;
  v_consultation public.consultations%ROWTYPE;
  v_previous_doctor_id uuid;
  v_existing_return_reason text;
  v_action text;
BEGIN
  SELECT CASE
      WHEN count(*) = 1 AND min(role::text) = 'ops_staff' THEN 'ops_staff'
    END
    INTO v_role
  FROM public.user_roles
  WHERE user_id = v_actor_id;

  IF v_actor_id IS NULL OR v_role IS DISTINCT FROM 'ops_staff' THEN
    RAISE EXCEPTION 'not_authorized_offline_consultation_entry'
      USING ERRCODE = '42501';
  END IF;

  IF p_queue_entry_id IS NULL
     OR p_doctor_id IS NULL
     OR p_original_consulted_at IS NULL
     OR p_expected_revision IS NULL THEN
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
  FROM public.doctors
  WHERE id = p_doctor_id
    AND user_id IS NOT NULL
    AND on_duty
  FOR KEY SHARE;

  IF NOT FOUND
     OR NOT public.is_clinical(v_doctor.user_id)
     OR EXISTS (
       SELECT 1 FROM public.user_roles
       WHERE user_id = v_doctor.user_id AND role::text = 'locum'
     ) THEN
    RAISE EXCEPTION 'offline_consultation_ineligible_doctor'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
    INTO v_consultation
  FROM public.consultations
  WHERE queue_entry_id = p_queue_entry_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    IF p_expected_revision <> 0 THEN
      RAISE EXCEPTION 'stale_offline_consultation'
        USING ERRCODE = '40001';
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

  IF v_consultation.entry_source <> 'offline_transcription' THEN
    RAISE EXCEPTION 'duplicate_offline_consultation'
      USING ERRCODE = '23505';
  END IF;

  IF v_consultation.approval_status NOT IN ('pending', 'returned') THEN
    RAISE EXCEPTION 'offline_consultation_not_editable'
      USING ERRCODE = '42501';
  END IF;

  IF v_consultation.approval_revision IS DISTINCT FROM p_expected_revision THEN
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

CREATE OR REPLACE FUNCTION public.review_offline_consultation(
  p_consultation_id uuid,
  p_action text,
  p_reason text default null,
  p_expected_revision integer default null
)
RETURNS public.consultations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_consultation public.consultations%ROWTYPE;
  v_action text := lower(btrim(p_action));
  v_reason text := nullif(btrim(p_reason), '');
  v_is_doctor_admin boolean;
  v_is_locum boolean;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authorized_offline_consultation_review'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_consultation
  FROM public.consultations
  WHERE id = p_consultation_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND OR v_consultation.entry_source <> 'offline_transcription' THEN
    RAISE EXCEPTION 'offline_consultation_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = v_actor_id AND role::text = 'doctor_admin'
    ),
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = v_actor_id AND role::text = 'locum'
    )
    INTO v_is_doctor_admin, v_is_locum;

  IF v_is_locum THEN
    RAISE EXCEPTION 'locum_cannot_review_offline_consultation'
      USING ERRCODE = '42501';
  END IF;

  IF NOT v_is_doctor_admin
     AND NOT EXISTS (
       SELECT 1
       FROM public.doctors
       WHERE id = v_consultation.doctor_id
         AND user_id = v_actor_id
     ) THEN
    RAISE EXCEPTION 'not_authorized_offline_consultation_review'
      USING ERRCODE = '42501';
  END IF;

  IF v_consultation.approval_status <> 'pending' THEN
    RAISE EXCEPTION 'offline_consultation_not_pending'
      USING ERRCODE = '22023';
  END IF;

  IF p_expected_revision IS NOT NULL
     AND v_consultation.approval_revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'stale_offline_consultation'
      USING ERRCODE = '40001';
  END IF;

  IF v_action NOT IN ('approve', 'return') THEN
    RAISE EXCEPTION 'offline_consultation_review_action_invalid'
      USING ERRCODE = '22023';
  END IF;

  IF v_action = 'return' AND v_reason IS NULL THEN
    RAISE EXCEPTION 'return_reason_required'
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.open_offline_consultation_write_guard(v_consultation.id, v_actor_id);

  IF v_action = 'approve' THEN
    UPDATE public.consultations
    SET approval_status = 'approved',
        approved_by = v_actor_id,
        approved_at = now(),
        returned_by = null,
        returned_at = null,
        return_reason = null,
        approval_revision = approval_revision + 1
    WHERE id = v_consultation.id
    RETURNING * INTO v_consultation;
  ELSE
    UPDATE public.consultations
    SET approval_status = 'returned',
        returned_by = v_actor_id,
        returned_at = now(),
        return_reason = v_reason,
        approval_revision = approval_revision + 1
    WHERE id = v_consultation.id
    RETURNING * INTO v_consultation;
  END IF;

  INSERT INTO public.consultation_approval_audit (
    consultation_id, action, actor_id, actor_name, reason, snapshot
  )
  SELECT
    v_consultation.id,
    CASE WHEN v_action = 'approve' THEN 'approved' ELSE 'returned' END,
    v_actor_id,
    COALESCE(NULLIF(btrim(profile.full_name), ''), v_actor_id::text),
    CASE WHEN v_action = 'return' THEN v_reason ELSE null END,
    jsonb_build_object(
      'approval_status', v_consultation.approval_status,
      'approval_revision', v_consultation.approval_revision
    )
  FROM (SELECT 1) AS singleton
  LEFT JOIN public.profiles AS profile ON profile.id = v_actor_id;

  PERFORM public.close_offline_consultation_write_guard(v_consultation.id, v_actor_id);
  RETURN v_consultation;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_offline_consultation_audit(
  p_consultation_id uuid
)
RETURNS TABLE(
  id uuid,
  action text,
  actor_id uuid,
  actor_name text,
  created_at timestamptz,
  reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_consultation public.consultations%ROWTYPE;
BEGIN
  SELECT *
    INTO v_consultation
  FROM public.consultations
  WHERE id = p_consultation_id
    AND deleted_at IS NULL;

  IF v_actor_id IS NULL
     OR NOT FOUND
     OR v_consultation.entry_source <> 'offline_transcription' THEN
    RAISE EXCEPTION 'offline_consultation_audit_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    (
      v_consultation.entered_by = v_actor_id
      AND EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = v_actor_id AND role::text = 'ops_staff'
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.doctors
      WHERE id = v_consultation.doctor_id
        AND user_id = v_actor_id
        AND NOT EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = v_actor_id AND role::text = 'locum'
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = v_actor_id AND role::text = 'doctor_admin'
    )
  ) THEN
    RAISE EXCEPTION 'not_authorized_offline_consultation_audit'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT audit.id,
         audit.action,
         audit.actor_id,
         audit.actor_name,
         audit.created_at,
         audit.reason
  FROM public.consultation_approval_audit AS audit
  WHERE audit.consultation_id = p_consultation_id
  ORDER BY audit.created_at, audit.id;
END;
$function$;

ALTER FUNCTION public.offline_consultation_write_guard_active(uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.open_offline_consultation_write_guard(uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.close_offline_consultation_write_guard(uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.guard_offline_consultation_provenance() OWNER TO postgres;
ALTER FUNCTION public.guard_completed_consultation_notes() OWNER TO postgres;
ALTER FUNCTION public.save_offline_consultation(uuid, uuid, timestamptz, text, uuid, text, text, integer) OWNER TO postgres;
ALTER FUNCTION public.review_offline_consultation(uuid, text, text, integer) OWNER TO postgres;
ALTER FUNCTION public.get_offline_consultation_audit(uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.offline_consultation_write_guard_active(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.open_offline_consultation_write_guard(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.close_offline_consultation_write_guard(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_offline_consultation_provenance() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_completed_consultation_notes() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.save_offline_consultation(uuid, uuid, timestamptz, text, uuid, text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_offline_consultation(uuid, uuid, timestamptz, text, uuid, text, text, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_offline_consultation(uuid, uuid, timestamptz, text, uuid, text, text, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.review_offline_consultation(uuid, text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_offline_consultation(uuid, text, text, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.review_offline_consultation(uuid, text, text, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.get_offline_consultation_audit(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_offline_consultation_audit(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_offline_consultation_audit(uuid) TO authenticated;

DO $postflight$
DECLARE
  v_save regprocedure := to_regprocedure(
    'public.save_offline_consultation(uuid,uuid,timestamptz,text,uuid,text,text,integer)'
  );
  v_review regprocedure := to_regprocedure(
    'public.review_offline_consultation(uuid,text,text,integer)'
  );
  v_audit regprocedure := to_regprocedure(
    'public.get_offline_consultation_audit(uuid)'
  );
  v_required_columns text[] := ARRAY[
    'entry_source', 'entered_by', 'original_consulted_at', 'approval_status',
    'approved_by', 'approved_at', 'returned_by', 'returned_at',
    'return_reason', 'approval_revision'
  ];
  v_actual_columns text[];
BEGIN
  IF to_regclass('public.consultation_approval_audit') IS NULL
     OR to_regclass('public.offline_consultation_write_guard') IS NULL
     OR v_save IS NULL
     OR v_review IS NULL
     OR v_audit IS NULL THEN
    RAISE EXCEPTION 'offline consultation postflight failed: required objects are missing';
  END IF;

  SELECT array_agg(column_name ORDER BY column_name)
    INTO v_actual_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'consultations'
    AND column_name = ANY (v_required_columns);

  IF v_actual_columns IS DISTINCT FROM ARRAY[
    'approval_revision', 'approval_status', 'approved_at', 'approved_by',
    'entered_by', 'entry_source', 'original_consulted_at', 'return_reason',
    'returned_at', 'returned_by'
  ] THEN
    RAISE EXCEPTION 'offline consultation postflight failed: provenance columns are missing';
  END IF;

  IF has_function_privilege('anon', v_save, 'EXECUTE')
     OR has_function_privilege('anon', v_review, 'EXECUTE')
     OR has_function_privilege('anon', v_audit, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_save, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_review, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_audit, 'EXECUTE') THEN
    RAISE EXCEPTION 'offline consultation postflight failed: RPC privileges are not hardened';
  END IF;

  IF has_table_privilege('authenticated', 'public.consultation_approval_audit', 'INSERT')
     OR has_table_privilege('authenticated', 'public.consultation_approval_audit', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.consultation_approval_audit', 'DELETE')
     OR has_table_privilege('authenticated', 'public.consultation_approval_audit', 'TRUNCATE') THEN
    RAISE EXCEPTION 'offline consultation postflight failed: audit mutation privileges remain';
  END IF;
END
$postflight$;

NOTIFY pgrst, 'reload schema';

COMMIT;
