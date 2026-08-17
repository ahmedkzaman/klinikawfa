-- Final Task 6 reconciliation: document-only doctor rows, payment-only
-- exclusions, and attendance roster identity validation. Additive only.

ALTER FUNCTION public.get_insight_performance_filtered(date, date, uuid, text, text, boolean)
  RENAME TO _get_insight_performance_filtered_round4;
REVOKE ALL ON FUNCTION public._get_insight_performance_filtered_round4(date, date, uuid, text, text, boolean)
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
  v_doctors jsonb;
  v_clinic jsonb;
  v_quality jsonb;
  v_confidence jsonb;
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
    v_effective_doctor := v_resident_doctor;
  END IF;

  -- Round 4 remains the authorization and non-document metric authority.
  v_result := public._get_insight_performance_filtered_round4(
    _start_date, _end_date, _doctor_id, _payment_type, _activity_type, _include_comparison
  );
  v_doctors := v_result->'doctors';
  v_clinic := v_result->'clinic';
  v_quality := v_result->'quality';
  v_missing_cost := coalesce((v_quality->>'missing_cost_count')::integer, 0);

  WITH selected_consultations AS MATERIALIZED (
    SELECT DISTINCT consultation.id, consultation.doctor_id
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
    SELECT document.id, consultation.doctor_id
    FROM public.consultation_documents AS document
    JOIN public.consultations AS consultation ON consultation.id = document.consultation_id
    JOIN public.queue_entries AS queue_entry ON queue_entry.id = consultation.queue_entry_id
    WHERE lower(coalesce(document.type, '')) IN ('mc', 'quarantine', 'referral')
      AND timezone('Asia/Kuala_Lumpur', document.created_at)::date BETWEEN _start_date AND _end_date
      AND consultation.status = 'completed' AND consultation.deleted_at IS NULL
      AND queue_entry.clinic_status = 'completed' AND queue_entry.deleted_at IS NULL
      AND queue_entry.cancelled_at IS NULL AND queue_entry.visit_type <> 'payment_only'
      AND (coalesce(_payment_type, 'all') = 'all'
        OR public._insight_payment_classification(queue_entry.id, queue_entry.payment_method) = _payment_type)
      AND coalesce(_activity_type, 'all') IN ('all', 'document')
  ), selected_documents AS MATERIALIZED (
    SELECT * FROM issued_documents
    WHERE v_effective_doctor IS NULL OR doctor_id = v_effective_doctor
  ), document_stats AS MATERIALIZED (
    SELECT doctor_id, count(*)::integer AS documents
    FROM issued_documents WHERE doctor_id IS NOT NULL GROUP BY doctor_id
  ), existing_rows AS MATERIALIZED (
    SELECT doctor_row, doctor_ordinality
    FROM jsonb_array_elements(v_doctors) WITH ORDINALITY AS rows(doctor_row, doctor_ordinality)
  ), patched_existing AS (
    SELECT coalesce(jsonb_agg(doctor_row || jsonb_build_object('documents', CASE
      WHEN v_role = 'resident_doctor' AND doctor_row->>'doctor_id' IS NULL THEN coalesce((
        SELECT sum(documents)::integer FROM document_stats WHERE doctor_id <> v_resident_doctor
      ), 0)
      WHEN doctor_row->>'doctor_id' IS NOT NULL THEN coalesce((
        SELECT documents FROM document_stats WHERE doctor_id::text = doctor_row->>'doctor_id'
      ), 0)
      ELSE (SELECT count(*)::integer FROM selected_documents)
    END) ORDER BY doctor_ordinality), '[]'::jsonb) AS rows
    FROM existing_rows
  ), missing_named_rows AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'doctor_id', doctor.id,
      'doctor_name', coalesce(nullif(btrim(profile.full_name), ''), nullif(btrim(doctor.name), ''), 'Unknown doctor'),
      'completed_visits', 0, 'unique_patients', 0,
      'rostered_hours', public._insight_rostered_hours(_start_date, _end_date, doctor.id),
      'patients_per_hour', CASE WHEN public._insight_rostered_hours(_start_date, _end_date, doctor.id) > 0 THEN 0 END,
      'visit_billing', 0, 'revenue_per_hour', CASE
        WHEN public._insight_rostered_hours(_start_date, _end_date, doctor.id) > 0 THEN 0 END,
      'procedures', 0, 'documents', stats.documents, 'missing_attribution', 0
    ) ORDER BY coalesce(profile.full_name, doctor.name), doctor.id), '[]'::jsonb) AS rows
    FROM document_stats AS stats
    JOIN public.doctors AS doctor ON doctor.id = stats.doctor_id AND doctor.status = 'active'
    LEFT JOIN public.profiles AS profile ON profile.id = doctor.user_id
    WHERE v_role IN ('special_admin', 'doctor_admin')
      AND (v_effective_doctor IS NULL OR doctor.id = v_effective_doctor)
      AND NOT EXISTS (SELECT 1 FROM existing_rows WHERE doctor_row->>'doctor_id' = doctor.id::text)
  ), resident_own_row AS (
    SELECT CASE WHEN v_role = 'resident_doctor'
      AND NOT EXISTS (SELECT 1 FROM existing_rows WHERE doctor_row->>'doctor_id' = v_resident_doctor::text)
      AND EXISTS (SELECT 1 FROM document_stats WHERE doctor_id = v_resident_doctor)
    THEN jsonb_build_array(jsonb_build_object(
      'doctor_id', doctor.id,
      'doctor_name', coalesce(nullif(btrim(profile.full_name), ''), nullif(btrim(doctor.name), ''), 'Unknown doctor'),
      'completed_visits', 0, 'unique_patients', 0,
      'rostered_hours', public._insight_rostered_hours(_start_date, _end_date, doctor.id),
      'patients_per_hour', CASE WHEN public._insight_rostered_hours(_start_date, _end_date, doctor.id) > 0 THEN 0 END,
      'visit_billing', 0, 'revenue_per_hour', CASE
        WHEN public._insight_rostered_hours(_start_date, _end_date, doctor.id) > 0 THEN 0 END,
      'procedures', 0, 'documents', (SELECT documents FROM document_stats WHERE doctor_id = doctor.id),
      'missing_attribution', 0
    )) ELSE '[]'::jsonb END AS rows
    FROM public.doctors AS doctor
    LEFT JOIN public.profiles AS profile ON profile.id = doctor.user_id
    WHERE doctor.id = v_resident_doctor
  ), attribution AS (
    SELECT
      (SELECT count(*)::integer FROM selected_documents) AS documents,
      (SELECT count(*)::integer FROM selected_documents WHERE doctor_id IS NULL)
        + (SELECT count(DISTINCT id)::integer FROM selected_consultations WHERE doctor_id IS NULL)
        AS missing_attribution
  )
  SELECT attribution.documents, attribution.missing_attribution,
    CASE
      WHEN v_role IN ('ops_staff', 'operations') THEN '[]'::jsonb
      WHEN v_role IN ('special_admin', 'doctor_admin') THEN patched_existing.rows || missing_named_rows.rows
      WHEN v_role = 'resident_doctor' THEN coalesce(resident_own_row.rows, '[]'::jsonb) || patched_existing.rows
      ELSE CASE WHEN attribution.documents > 0 OR (v_clinic->>'completed_visits')::integer > 0
        THEN jsonb_build_array(jsonb_build_object(
          'doctor_id', null, 'doctor_name', 'Clinic benchmark',
          'completed_visits', (v_clinic->>'completed_visits')::integer,
          'unique_patients', (v_clinic->>'unique_patients')::integer,
          'rostered_hours', (v_clinic->>'rostered_hours')::numeric,
          'patients_per_hour', v_clinic->'patients_per_hour',
          'visit_billing', (v_clinic->>'visit_billing')::numeric,
          'revenue_per_hour', v_clinic->'revenue_per_hour',
          'procedures', (v_clinic->>'procedures')::numeric,
          'documents', attribution.documents, 'missing_attribution', 0
        )) ELSE '[]'::jsonb END
    END
  INTO v_document_count, v_missing_attribution, v_doctors
  FROM attribution CROSS JOIN patched_existing CROSS JOIN missing_named_rows
  LEFT JOIN resident_own_row ON true;

  v_clinic := v_clinic || jsonb_build_object('documents', v_document_count);
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
    'quality', v_quality, 'confidence', v_confidence
  );
END;
$function$;

ALTER FUNCTION public.get_insight_performance_filtered(date, date, uuid, text, text, boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_insight_performance_filtered(date, date, uuid, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_insight_performance_filtered(date, date, uuid, text, text, boolean) TO authenticated;

ALTER FUNCTION public.get_insight_performance_detail_filtered(date, date, text, text, uuid, text, text)
  RENAME TO _get_insight_performance_detail_filtered_round4;
REVOKE ALL ON FUNCTION public._get_insight_performance_detail_filtered_round4(date, date, text, text, uuid, text, text)
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
  v_result jsonb;
  v_detail_doctor uuid;
  v_documents integer;
BEGIN
  v_result := public._get_insight_performance_detail_filtered_round4(
    _start_date, _end_date, _detail_kind, _detail_id,
    _doctor_id, _payment_type, _activity_type
  );
  IF _detail_kind = 'doctor' THEN
    v_detail_doctor := _detail_id::uuid;
    SELECT count(*)::integer INTO v_documents
    FROM public.consultation_documents AS document
    JOIN public.consultations AS consultation ON consultation.id = document.consultation_id
    JOIN public.queue_entries AS queue_entry ON queue_entry.id = consultation.queue_entry_id
    WHERE consultation.doctor_id = v_detail_doctor
      AND lower(coalesce(document.type, '')) IN ('mc', 'quarantine', 'referral')
      AND timezone('Asia/Kuala_Lumpur', document.created_at)::date BETWEEN _start_date AND _end_date
      AND consultation.status = 'completed' AND consultation.deleted_at IS NULL
      AND queue_entry.clinic_status = 'completed' AND queue_entry.deleted_at IS NULL
      AND queue_entry.cancelled_at IS NULL AND queue_entry.visit_type <> 'payment_only'
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

-- Keep the complete, previously reviewed attendance calculation while tightening
-- its roster source at the authority boundary.  A roster string is not an
-- identity until it is both a UUID and an active doctors.id.
DO $migration$
DECLARE
  v_definition text;
  v_original text;
  v_needle text := E'    ) AS assignment(value)\n    WHERE shift_entry.key IN';
  v_replacement text := E'    ) AS assignment(value)\n    JOIN public.doctors AS mapped_roster_doctor\n      ON mapped_roster_doctor.id::text = NULLIF(btrim(assignment.value->>''staffId''), '''')\n      AND mapped_roster_doctor.status = ''active''\n    WHERE shift_entry.key IN';
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public._get_insight_clinical_attendance_heatmap_round3(date,date,uuid)'::regprocedure
  ) INTO v_definition;
  v_original := v_definition;
  v_definition := replace(v_definition, v_needle, v_replacement);
  IF v_definition = v_original THEN
    RAISE EXCEPTION 'ATTENDANCE_ROSTER_SOURCE_NOT_FOUND';
  END IF;
  v_definition := replace(
    v_definition,
    E'      AND NULLIF(btrim(assignment.value->>''staffId''), '''') IS NOT NULL',
    E'      AND NULLIF(btrim(assignment.value->>''staffId''), '''') ~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$''\n      AND NULLIF(btrim(assignment.value->>''staffId''), '''') IS NOT NULL'
  );
  IF v_definition NOT LIKE '%mapped_roster_doctor.status = ''active''%'
     OR v_definition NOT LIKE '%[0-9a-f]{12}$%' THEN
    RAISE EXCEPTION 'ATTENDANCE_ROSTER_GUARD_NOT_INSTALLED';
  END IF;
  EXECUTE v_definition;
END;
$migration$;

ALTER FUNCTION public._get_insight_clinical_attendance_heatmap_round3(date, date, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public._get_insight_clinical_attendance_heatmap_round3(date, date, uuid)
  FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
