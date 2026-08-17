-- Round-four hardening: one server-side doctor visibility ceiling, issue-date
-- document cohorts, collection classification, and authoritative roster hours.
-- Additive only; intentionally not applied by this task.

CREATE OR REPLACE FUNCTION public._insight_rostered_hours(
  _start_date date, _end_date date, _doctor_id uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  WITH current_rosters AS (
    SELECT DISTINCT ON (roster.year, roster.month) roster.roster_data
    FROM public.saved_rosters AS roster
    WHERE roster.roster_type = 'doctor'
    ORDER BY roster.year, roster.month, roster.updated_at DESC, roster.id DESC
  ), valid_assignments AS (
    SELECT DISTINCT day.key::date AS roster_date, shift.key AS shift_key,
      (assignment.value->>'staffId')::uuid AS doctor_id
    FROM current_rosters AS roster
    CROSS JOIN LATERAL jsonb_each(coalesce(roster.roster_data, '{}'::jsonb)) AS day(key, value)
    CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(day.value) = 'object'
      THEN day.value ELSE '{}'::jsonb END) AS shift(key, value)
    CROSS JOIN LATERAL jsonb_array_elements(CASE jsonb_typeof(shift.value)
      WHEN 'array' THEN shift.value WHEN 'object' THEN jsonb_build_array(shift.value)
      ELSE '[]'::jsonb END) AS assignment(value)
    JOIN public.doctors AS mapped_doctor
      ON mapped_doctor.id::text = assignment.value->>'staffId'
    WHERE day.key ~ '^\d{4}-\d{2}-\d{2}$'
      AND day.key::date BETWEEN _start_date AND _end_date
      AND shift.key IN ('DOC_S1', 'shift1', 'DOC_S2', 'shift2', 'DOC_S3', 'shift3')
      AND coalesce(assignment.value->>'staffId', '')
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND lower(coalesce(assignment.value->>'status', '')) NOT IN ('cancelled', 'canceled')
      AND lower(coalesce(assignment.value->>'cancelled', 'false')) <> 'true'
  )
  SELECT coalesce(sum(CASE WHEN shift_key IN ('DOC_S1', 'shift1') THEN 5
    WHEN shift_key IN ('DOC_S2', 'shift2') THEN 5
    WHEN shift_key IN ('DOC_S3', 'shift3') THEN 4 END), 0)::numeric
  FROM valid_assignments
  WHERE _doctor_id IS NULL OR doctor_id = _doctor_id;
$function$;

ALTER FUNCTION public._insight_rostered_hours(date, date, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public._insight_rostered_hours(date, date, uuid) FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.get_insight_performance(date, date)
  RENAME TO _get_insight_performance_round3;
REVOKE ALL ON FUNCTION public._get_insight_performance_round3(date, date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_insight_performance(_start_date date, _end_date date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_result jsonb;
  v_roster numeric;
  v_collected numeric;
BEGIN
  v_result := public._get_insight_performance_round3(_start_date, _end_date);
  v_roster := public._insight_rostered_hours(_start_date, _end_date, NULL);

  SELECT coalesce(sum(payment.amount), 0)::numeric INTO v_collected
  FROM public.payments AS payment
  JOIN public.queue_entries AS queue_entry ON queue_entry.id = payment.queue_entry_id
  JOIN public.consultations AS consultation ON consultation.queue_entry_id = queue_entry.id
  WHERE payment.deleted_at IS NULL
    AND lower(btrim(coalesce(payment.payment_type, ''))) <> 'panel'
    AND lower(btrim(coalesce(payment.payment_method, ''))) <> 'panel'
    AND consultation.status = 'completed' AND consultation.deleted_at IS NULL
    AND queue_entry.clinic_status = 'completed' AND queue_entry.deleted_at IS NULL
    AND queue_entry.cancelled_at IS NULL AND queue_entry.visit_type <> 'payment_only'
    AND timezone('Asia/Kuala_Lumpur', queue_entry.created_at)::date BETWEEN _start_date AND _end_date;

  RETURN v_result || jsonb_build_object('clinic', (v_result->'clinic') || jsonb_build_object(
    'rostered_hours', round(v_roster, 2),
    'patients_per_hour', CASE WHEN v_roster > 0
      THEN round((v_result->'clinic'->>'completed_visits')::numeric / v_roster, 2) END,
    'revenue_per_hour', CASE WHEN v_roster > 0
      THEN round((v_result->'clinic'->>'visit_billing')::numeric / v_roster, 2) END,
    'patient_collected', round(v_collected, 2)
  ));
END;
$function$;

ALTER FUNCTION public.get_insight_performance(date, date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_insight_performance(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_insight_performance(date, date) TO authenticated;

ALTER FUNCTION public.get_insight_performance_filtered(date, date, uuid, text, text, boolean)
  RENAME TO _get_insight_performance_filtered_round3;
REVOKE ALL ON FUNCTION public._get_insight_performance_filtered_round3(date, date, uuid, text, text, boolean)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_insight_performance_filtered(
  _start_date date, _end_date date, _doctor_id uuid, _payment_type text,
  _activity_type text, _include_comparison boolean
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_role text;
  v_resident_doctor uuid;
  v_effective_doctor uuid := _doctor_id;
  v_result jsonb;
  v_clinic jsonb;
  v_doctors jsonb;
  v_quality jsonb;
  v_confidence jsonb;
  v_roster numeric;
  v_collected numeric;
  v_document_count integer;
  v_missing_attribution integer;
  v_missing_cost integer;
BEGIN
  IF NOT public.can_view_insight_workspace() THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  SELECT role_row.role::text INTO v_role FROM public.user_roles AS role_row
  WHERE role_row.user_id = (SELECT auth.uid()) LIMIT 1;
  SELECT doctor.id INTO v_resident_doctor FROM public.doctors AS doctor
  WHERE doctor.user_id = (SELECT auth.uid()) AND doctor.status = 'active'
  ORDER BY doctor.updated_at DESC, doctor.id LIMIT 1;

  IF v_role = 'resident_doctor' THEN
    IF v_resident_doctor IS NULL OR (_doctor_id IS NOT NULL AND _doctor_id <> v_resident_doctor) THEN
      RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
    END IF;
    v_effective_doctor := v_resident_doctor;
  ELSIF _doctor_id IS NOT NULL AND v_role NOT IN ('special_admin', 'doctor_admin') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF v_effective_doctor IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.doctors AS doctor
    WHERE doctor.id = v_effective_doctor AND doctor.status = 'active'
  ) THEN
    RAISE EXCEPTION 'INVALID_DOCTOR_FILTER' USING ERRCODE = '22023';
  END IF;

  v_result := public._get_insight_performance_filtered_round3(
    _start_date, _end_date, v_effective_doctor, _payment_type, _activity_type, _include_comparison
  );
  v_clinic := v_result->'clinic';
  v_doctors := v_result->'doctors';
  v_quality := v_result->'quality';
  v_missing_cost := coalesce((v_quality->>'missing_cost_count')::integer, 0);
  v_roster := public._insight_rostered_hours(_start_date, _end_date, v_effective_doctor);

  WITH selected_consultations AS MATERIALIZED (
    SELECT DISTINCT consultation.id, consultation.doctor_id, queue_entry.id AS queue_entry_id
    FROM public.consultations AS consultation
    JOIN public.queue_entries AS queue_entry ON queue_entry.id = consultation.queue_entry_id
    WHERE consultation.status = 'completed' AND consultation.deleted_at IS NULL
      AND queue_entry.clinic_status = 'completed' AND queue_entry.deleted_at IS NULL
      AND queue_entry.cancelled_at IS NULL AND queue_entry.visit_type <> 'payment_only'
      AND timezone('Asia/Kuala_Lumpur', queue_entry.created_at)::date BETWEEN _start_date AND _end_date
      AND (v_effective_doctor IS NULL OR consultation.doctor_id = v_effective_doctor)
      AND (coalesce(_payment_type, 'all') = 'all'
        OR public._insight_payment_classification(queue_entry.id, queue_entry.payment_method) = _payment_type)
      AND (coalesce(_activity_type, 'all') IN ('all', 'consultation')
        OR (_activity_type = 'procedure' AND EXISTS (
          SELECT 1 FROM public.consultation_items AS item
          WHERE item.consultation_id = consultation.id AND item.deleted_at IS NULL
            AND public._insight_is_procedure_item(item.service_id, item.item_id, item.package_id, item.item_name)
        )))
  ), issued_documents AS MATERIALIZED (
    SELECT document.id, consultation.id AS consultation_id,
      consultation.doctor_id, queue_entry.id AS queue_entry_id
    FROM public.consultation_documents AS document
    JOIN public.consultations AS consultation ON consultation.id = document.consultation_id
    JOIN public.queue_entries AS queue_entry ON queue_entry.id = consultation.queue_entry_id
    WHERE lower(coalesce(document.type, '')) IN ('mc', 'quarantine', 'referral')
      AND timezone('Asia/Kuala_Lumpur', document.created_at)::date BETWEEN _start_date AND _end_date
      AND consultation.status = 'completed' AND consultation.deleted_at IS NULL
      AND queue_entry.clinic_status = 'completed' AND queue_entry.deleted_at IS NULL
      AND queue_entry.cancelled_at IS NULL
      AND (coalesce(_payment_type, 'all') = 'all'
        OR public._insight_payment_classification(queue_entry.id, queue_entry.payment_method) = _payment_type)
      AND coalesce(_activity_type, 'all') IN ('all', 'document')
  ), selected_documents AS MATERIALIZED (
    SELECT * FROM issued_documents
    WHERE v_effective_doctor IS NULL OR doctor_id = v_effective_doctor
  ), collected AS (
    SELECT coalesce(sum(payment.amount), 0)::numeric AS amount
    FROM public.payments AS payment
    JOIN selected_consultations AS consultation ON consultation.queue_entry_id = payment.queue_entry_id
    WHERE payment.deleted_at IS NULL
      AND lower(btrim(coalesce(payment.payment_type, ''))) <> 'panel'
      AND lower(btrim(coalesce(payment.payment_method, ''))) <> 'panel'
  ), attribution AS (
    SELECT
      (SELECT count(*)::integer FROM selected_documents) AS documents,
      (SELECT count(*)::integer FROM selected_documents WHERE doctor_id IS NULL)
        + (SELECT count(DISTINCT id)::integer FROM selected_consultations WHERE doctor_id IS NULL)
        AS missing_attribution
  ), patched_doctors AS (
    SELECT coalesce(jsonb_agg(
      doctor_row || jsonb_build_object('documents', CASE
        WHEN v_role = 'resident_doctor' AND doctor_row->>'doctor_id' IS NULL THEN (
          SELECT count(*)::integer FROM issued_documents
          WHERE doctor_id IS NOT NULL AND doctor_id <> v_resident_doctor
        )
        WHEN doctor_row->>'doctor_id' IS NOT NULL THEN (
          SELECT count(*)::integer FROM issued_documents
          WHERE doctor_id::text = doctor_row->>'doctor_id'
        )
        ELSE (SELECT documents FROM attribution)
      END)
      ORDER BY doctor_ordinality
    ), '[]'::jsonb) AS rows
    FROM jsonb_array_elements(v_doctors) WITH ORDINALITY AS doctor_rows(doctor_row, doctor_ordinality)
  )
  SELECT collected.amount, attribution.documents, attribution.missing_attribution, patched_doctors.rows
  INTO v_collected, v_document_count, v_missing_attribution, v_doctors
  FROM collected CROSS JOIN attribution CROSS JOIN patched_doctors;

  v_clinic := v_clinic || jsonb_build_object(
    'rostered_hours', round(v_roster, 2),
    'patients_per_hour', CASE WHEN v_roster > 0
      THEN round((v_clinic->>'completed_visits')::numeric / v_roster, 2) END,
    'revenue_per_hour', CASE WHEN v_roster > 0
      THEN round((v_clinic->>'visit_billing')::numeric / v_roster, 2) END,
    'patient_collected', round(v_collected, 2),
    'documents', v_document_count
  );
  v_quality := v_quality || jsonb_build_object('missing_attribution', v_missing_attribution);
  v_confidence := jsonb_build_object(
    'state', CASE
      WHEN (v_clinic->>'completed_visits')::integer = 0 AND v_document_count = 0 THEN 'insufficient'
      WHEN v_missing_attribution > 0 OR v_missing_cost > 0 THEN 'partial'
      ELSE 'reliable' END,
    'missing_attribution', v_missing_attribution,
    'missing_cost_count', v_missing_cost
  );

  RETURN v_result || jsonb_build_object(
    'clinic', v_clinic, 'doctors', v_doctors,
    'quality', v_quality, 'confidence', v_confidence,
    'filters', (v_result->'filters') || jsonb_build_object('doctor_id', v_effective_doctor)
  );
END;
$function$;

ALTER FUNCTION public.get_insight_performance_filtered(date, date, uuid, text, text, boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_insight_performance_filtered(date, date, uuid, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_insight_performance_filtered(date, date, uuid, text, text, boolean) TO authenticated;

ALTER FUNCTION public.get_insight_performance_detail_filtered(date, date, text, text, uuid, text, text)
  RENAME TO _get_insight_performance_detail_filtered_round3;
REVOKE ALL ON FUNCTION public._get_insight_performance_detail_filtered_round3(date, date, text, text, uuid, text, text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_insight_performance_detail_filtered(
  _start_date date, _end_date date, _detail_kind text, _detail_id text,
  _doctor_id uuid, _payment_type text, _activity_type text
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_role text;
  v_resident_doctor uuid;
  v_detail_doctor uuid;
  v_result jsonb;
  v_documents integer;
BEGIN
  IF NOT public.can_view_insight_workspace() THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  SELECT role_row.role::text INTO v_role FROM public.user_roles AS role_row
  WHERE role_row.user_id = (SELECT auth.uid()) LIMIT 1;
  SELECT doctor.id INTO v_resident_doctor FROM public.doctors AS doctor
  WHERE doctor.user_id = (SELECT auth.uid()) AND doctor.status = 'active'
  ORDER BY doctor.updated_at DESC, doctor.id LIMIT 1;

  IF _detail_kind = 'doctor' THEN
    IF v_role NOT IN ('special_admin', 'doctor_admin', 'resident_doctor') THEN
      RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
    END IF;
    BEGIN v_detail_doctor := _detail_id::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'INVALID_DOCTOR_ID' USING ERRCODE = '22023';
    END;
    IF (v_role = 'resident_doctor' AND v_detail_doctor IS DISTINCT FROM v_resident_doctor)
      OR (_doctor_id IS NOT NULL AND _doctor_id <> v_detail_doctor) THEN
      RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
    END IF;
  ELSIF _doctor_id IS NOT NULL AND v_role NOT IN ('special_admin', 'doctor_admin') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF _doctor_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.doctors AS doctor WHERE doctor.id = _doctor_id AND doctor.status = 'active'
  ) THEN
    RAISE EXCEPTION 'INVALID_DOCTOR_FILTER' USING ERRCODE = '22023';
  END IF;

  v_result := public._get_insight_performance_detail_filtered_round3(
    _start_date, _end_date, _detail_kind, _detail_id,
    _doctor_id, _payment_type, _activity_type
  );
  IF _detail_kind = 'doctor' THEN
    SELECT count(*)::integer INTO v_documents
    FROM public.consultation_documents AS document
    JOIN public.consultations AS consultation ON consultation.id = document.consultation_id
    JOIN public.queue_entries AS queue_entry ON queue_entry.id = consultation.queue_entry_id
    WHERE consultation.doctor_id = v_detail_doctor
      AND lower(coalesce(document.type, '')) IN ('mc', 'quarantine', 'referral')
      AND timezone('Asia/Kuala_Lumpur', document.created_at)::date BETWEEN _start_date AND _end_date
      AND consultation.status = 'completed' AND consultation.deleted_at IS NULL
      AND queue_entry.clinic_status = 'completed' AND queue_entry.deleted_at IS NULL
      AND queue_entry.cancelled_at IS NULL
      AND (coalesce(_payment_type, 'all') = 'all'
        OR public._insight_payment_classification(queue_entry.id, queue_entry.payment_method) = _payment_type)
      AND coalesce(_activity_type, 'all') IN ('all', 'document');
    v_result := v_result || jsonb_build_object('documents', v_documents);
  END IF;
  RETURN v_result;
END;
$function$;

ALTER FUNCTION public.get_insight_performance_detail_filtered(date, date, text, text, uuid, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_insight_performance_detail_filtered(date, date, text, text, uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_insight_performance_detail_filtered(date, date, text, text, uuid, text, text)
  TO authenticated;

ALTER FUNCTION public.get_insight_clinical_attendance_heatmap(date, date, uuid)
  RENAME TO _get_insight_clinical_attendance_heatmap_round3;
REVOKE ALL ON FUNCTION public._get_insight_clinical_attendance_heatmap_round3(date, date, uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_insight_clinical_attendance_heatmap(
  _start_date date, _end_date date, _doctor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_role text;
  v_resident_doctor uuid;
  v_effective_doctor uuid := _doctor_id;
  v_result jsonb;
BEGIN
  IF NOT public.can_view_insight_workspace() THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  SELECT role_row.role::text INTO v_role FROM public.user_roles AS role_row
  WHERE role_row.user_id = (SELECT auth.uid()) LIMIT 1;
  SELECT doctor.id INTO v_resident_doctor FROM public.doctors AS doctor
  WHERE doctor.user_id = (SELECT auth.uid()) AND doctor.status = 'active'
  ORDER BY doctor.updated_at DESC, doctor.id LIMIT 1;

  IF v_role = 'resident_doctor' THEN
    IF v_resident_doctor IS NULL OR (_doctor_id IS NOT NULL AND _doctor_id <> v_resident_doctor) THEN
      RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
    END IF;
    v_effective_doctor := v_resident_doctor;
  ELSIF _doctor_id IS NOT NULL AND v_role NOT IN ('special_admin', 'doctor_admin') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF v_effective_doctor IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.doctors AS doctor
    WHERE doctor.id = v_effective_doctor AND doctor.status = 'active'
  ) THEN
    RAISE EXCEPTION 'INVALID_DOCTOR_FILTER' USING ERRCODE = '22023';
  END IF;

  v_result := public._get_insight_clinical_attendance_heatmap_round3(
    _start_date, _end_date, v_effective_doctor
  );
  RETURN v_result || jsonb_build_object('doctors', CASE
    WHEN v_role IN ('special_admin', 'doctor_admin') THEN v_result->'doctors'
    WHEN v_role = 'resident_doctor' THEN coalesce((
      SELECT jsonb_agg(doctor_row)
      FROM jsonb_array_elements(v_result->'doctors') AS doctor_row
      WHERE doctor_row->>'id' = v_resident_doctor::text
    ), '[]'::jsonb)
    ELSE '[]'::jsonb END);
END;
$function$;

ALTER FUNCTION public.get_insight_clinical_attendance_heatmap(date, date, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_insight_clinical_attendance_heatmap(date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_insight_clinical_attendance_heatmap(date, date, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
