-- Additive completion of the secured Insight Performance contract. This file
-- intentionally follows Task 5; it is not safe to apply before that migration.

CREATE OR REPLACE FUNCTION public.get_insight_viewer_scope()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_role text;
  v_doctor_id uuid;
  v_allowed boolean := false;
  v_permission_version timestamptz;
BEGIN
  SELECT role_row.role::text
  INTO v_role
  FROM public.user_roles AS role_row
  JOIN public.profiles AS profile ON profile.id = role_row.user_id
  WHERE role_row.user_id = v_user_id
  LIMIT 1;

  v_allowed := v_user_id IS NOT NULL
    AND public.can_view_insight_workspace((SELECT auth.uid()));

  IF v_allowed AND v_role = 'resident_doctor' THEN
    SELECT doctor.id
    INTO v_doctor_id
    FROM public.doctors AS doctor
    WHERE doctor.user_id = v_user_id AND doctor.status = 'active'
    ORDER BY doctor.updated_at DESC, doctor.id
    LIMIT 1;
    v_allowed := v_doctor_id IS NOT NULL;
  END IF;

  SELECT greatest(
    coalesce((SELECT max(permission.updated_at)
      FROM public.clinic_role_permissions AS permission
      JOIN public.user_roles AS role_row ON role_row.role = permission.role
      WHERE role_row.user_id = v_user_id
        AND permission.permission_key = 'reports.view'), '-infinity'::timestamptz),
    coalesce((SELECT max(override_row.updated_at)
      FROM public.clinic_user_permission_overrides AS override_row
      WHERE override_row.user_id = v_user_id
        AND override_row.permission_key = 'reports.view'), '-infinity'::timestamptz)
  ) INTO v_permission_version;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'role', CASE WHEN v_allowed THEN v_role END,
    'doctor_id', CASE WHEN v_allowed AND v_role = 'resident_doctor' THEN v_doctor_id END,
    'permission_version', coalesce(v_permission_version::text, 'unversioned')
  );
END;
$function$;

ALTER FUNCTION public.get_insight_viewer_scope() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_insight_viewer_scope() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_insight_viewer_scope() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_doctor_clinical_activity(
  _start_date date, _end_date date
)
RETURNS TABLE (
  activity_id uuid, activity_kind text, activity_date date, activity_name text,
  consultation_id uuid, queue_entry_id uuid, queue_created_at timestamptz,
  queue_sequence integer, doctor_id uuid, doctor_name text, patient_name text,
  unit_price numeric, quantity numeric, total_price numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_role text;
BEGIN
  IF NOT public.can_view_insight_workspace((SELECT auth.uid())) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  SELECT role_row.role::text INTO v_role FROM public.user_roles AS role_row
    WHERE role_row.user_id = (SELECT auth.uid()) LIMIT 1;
  IF v_role NOT IN ('special_admin', 'doctor_admin') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF _start_date IS NULL OR _end_date IS NULL OR _start_date > _end_date THEN
    RAISE EXCEPTION 'INVALID_DATE_RANGE' USING ERRCODE = '22023';
  END IF;
  IF (_end_date - _start_date) > 364 THEN
    RAISE EXCEPTION 'DATE_RANGE_TOO_LARGE' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT activity.* FROM (
    SELECT item.id, 'procedure'::text,
      timezone('Asia/Kuala_Lumpur', queue_entry.created_at)::date,
      coalesce(service.name, inventory.name, package.name, item.item_name),
      consultation.id, queue_entry.id, queue_entry.created_at,
      queue_entry.queue_sequence, consultation.doctor_id,
      CASE WHEN consultation.doctor_id IS NULL THEN 'Unassigned'
        ELSE coalesce(nullif(btrim(profile.full_name), ''), nullif(btrim(doctor.name), ''), 'Unknown doctor') END,
      coalesce(nullif(btrim(patient.name), ''), 'Unknown patient'),
      item.price::numeric, item.quantity::numeric,
      (item.price * item.quantity)::numeric
    FROM public.consultation_items AS item
    JOIN public.consultations AS consultation ON consultation.id = item.consultation_id
    JOIN public.queue_entries AS queue_entry ON queue_entry.id = consultation.queue_entry_id
    LEFT JOIN public.services AS service ON service.id = item.service_id
    LEFT JOIN public.inventory_items AS inventory ON inventory.id = item.item_id
    LEFT JOIN public.packages AS package ON package.id = item.package_id
    LEFT JOIN public.doctors AS doctor ON doctor.id = consultation.doctor_id
    LEFT JOIN public.profiles AS profile ON profile.id = doctor.user_id
    LEFT JOIN public.patients AS patient ON patient.id = consultation.patient_id
    WHERE (item.service_id IS NOT NULL OR item.package_id IS NOT NULL
      OR lower(trim(coalesce(inventory.category, ''))) = 'procedure'
      OR EXISTS (SELECT 1 FROM public.services AS legacy_service
        WHERE lower(trim(legacy_service.category)) = 'procedure'
          AND lower(trim(legacy_service.name)) = lower(trim(item.item_name)))
      OR lower(trim(item.item_name)) IN ('excision biopsy', 'excision biopsy (procedure)'))
      AND item.deleted_at IS NULL AND consultation.deleted_at IS NULL
      AND consultation.status = 'completed'
      AND queue_entry.clinic_status = 'completed'
      AND queue_entry.deleted_at IS NULL AND queue_entry.cancelled_at IS NULL
      AND timezone('Asia/Kuala_Lumpur', queue_entry.created_at)::date BETWEEN _start_date AND _end_date
    UNION ALL
    SELECT document.id, lower(document.type),
      timezone('Asia/Kuala_Lumpur', document.created_at)::date,
      coalesce(nullif(btrim(document.template_name), ''),
        CASE lower(document.type) WHEN 'mc' THEN 'Medical certificate'
          WHEN 'quarantine' THEN 'Quarantine letter' WHEN 'referral' THEN 'Referral letter' END),
      consultation.id, queue_entry.id, queue_entry.created_at,
      queue_entry.queue_sequence, consultation.doctor_id,
      CASE WHEN consultation.doctor_id IS NULL THEN 'Unassigned'
        ELSE coalesce(nullif(btrim(profile.full_name), ''), nullif(btrim(doctor.name), ''), 'Unknown doctor') END,
      coalesce(nullif(btrim(patient.name), ''), 'Unknown patient'),
      document_item.price::numeric, document_item.quantity::numeric,
      (document_item.price * document_item.quantity)::numeric
    FROM public.consultation_documents AS document
    JOIN public.consultations AS consultation ON consultation.id = document.consultation_id
    JOIN public.queue_entries AS queue_entry ON queue_entry.id = consultation.queue_entry_id
    LEFT JOIN public.consultation_items AS document_item
      ON document_item.source_document_id = document.id
      AND document_item.deleted_at IS NULL
    LEFT JOIN public.doctors AS doctor ON doctor.id = consultation.doctor_id
    LEFT JOIN public.profiles AS profile ON profile.id = doctor.user_id
    LEFT JOIN public.patients AS patient ON patient.id = consultation.patient_id
    WHERE lower(coalesce(document.type, '')) IN ('mc', 'quarantine', 'referral')
      AND consultation.deleted_at IS NULL AND consultation.status = 'completed'
      AND queue_entry.clinic_status = 'completed'
      AND queue_entry.deleted_at IS NULL AND queue_entry.cancelled_at IS NULL
      AND timezone('Asia/Kuala_Lumpur', document.created_at)::date BETWEEN _start_date AND _end_date
  ) AS activity(activity_id, activity_kind, activity_date, activity_name,
    consultation_id, queue_entry_id, queue_created_at, queue_sequence,
    doctor_id, doctor_name, patient_name, unit_price, quantity, total_price)
  ORDER BY activity.activity_date, activity.activity_kind, activity.activity_id;
END;
$function$;

ALTER FUNCTION public.get_doctor_clinical_activity(date, date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_doctor_clinical_activity(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_doctor_clinical_activity(date, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_insight_performance_filtered(
  _start_date date,
  _end_date date,
  _doctor_id uuid,
  _payment_type text,
  _activity_type text,
  _include_comparison boolean
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_role text;
  v_caller_doctor_id uuid;
  v_result jsonb;
  v_doctors jsonb;
  v_services jsonb;
  v_clinic jsonb;
  v_range_days integer;
  v_previous_start date;
  v_previous_end date;
BEGIN
  IF NOT public.can_view_insight_workspace((SELECT auth.uid())) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF _start_date IS NULL OR _end_date IS NULL OR _start_date > _end_date
     OR (_end_date - _start_date) > 364 THEN
    RAISE EXCEPTION 'INVALID_DATE_RANGE' USING ERRCODE = '22023';
  END IF;
  IF coalesce(_payment_type, 'all') NOT IN ('all', 'self_pay', 'panel') THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_FILTER' USING ERRCODE = '22023';
  END IF;
  IF coalesce(_activity_type, 'all') NOT IN ('all', 'consultation', 'procedure', 'document') THEN
    RAISE EXCEPTION 'INVALID_ACTIVITY_FILTER' USING ERRCODE = '22023';
  END IF;

  SELECT role_row.role::text INTO v_role FROM public.user_roles AS role_row
    WHERE role_row.user_id = (SELECT auth.uid()) LIMIT 1;
  SELECT doctor.id INTO v_caller_doctor_id FROM public.doctors AS doctor
    WHERE doctor.user_id = (SELECT auth.uid()) AND doctor.status = 'active'
    ORDER BY doctor.updated_at DESC, doctor.id LIMIT 1;
  IF v_role = 'resident_doctor'
     AND (v_caller_doctor_id IS NULL OR (_doctor_id IS NOT NULL AND _doctor_id <> v_caller_doctor_id)) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF _doctor_id IS NOT NULL AND v_role NOT IN ('special_admin', 'doctor_admin', 'resident_doctor') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  v_range_days := (_end_date - _start_date) + 1;
  v_previous_start := _start_date - v_range_days;
  v_previous_end := _start_date - 1;

  v_result := public.get_insight_performance(_start_date, _end_date);
  SELECT coalesce(jsonb_agg(row_value), '[]'::jsonb) INTO v_doctors
  FROM jsonb_array_elements(v_result->'doctors') AS row_value
  WHERE _doctor_id IS NULL OR row_value->>'doctor_id' IS NULL
    OR row_value->>'doctor_id' = _doctor_id::text;

  SELECT coalesce(jsonb_agg(
    CASE WHEN coalesce(_include_comparison, true) THEN row_value
      ELSE jsonb_set(row_value, '{trend_pct}', 'null'::jsonb) END
  ), '[]'::jsonb) INTO v_services
  FROM jsonb_array_elements(v_result->'services') AS row_value
  WHERE coalesce(_activity_type, 'all') IN ('all', 'procedure');

  WITH filtered_visits AS (
    SELECT consultation.id, consultation.patient_id, consultation.doctor_id,
      queue_entry.id AS queue_entry_id,
      CASE WHEN lower(coalesce(queue_entry.payment_method, '')) = 'panel'
        OR EXISTS (SELECT 1 FROM public.payments AS classified_payment
          WHERE classified_payment.queue_entry_id = queue_entry.id
            AND classified_payment.deleted_at IS NULL
            AND (lower(coalesce(classified_payment.payment_type, '')) = 'panel'
              OR lower(btrim(classified_payment.payment_method)) = 'panel'))
        THEN 'panel' ELSE 'self_pay' END AS payment_type
    FROM public.consultations AS consultation
    JOIN public.queue_entries AS queue_entry ON queue_entry.id = consultation.queue_entry_id
    WHERE consultation.status = 'completed' AND consultation.deleted_at IS NULL
      AND queue_entry.clinic_status = 'completed' AND queue_entry.deleted_at IS NULL
      AND queue_entry.cancelled_at IS NULL AND queue_entry.visit_type <> 'payment_only'
      AND timezone('Asia/Kuala_Lumpur', queue_entry.created_at)::date BETWEEN _start_date AND _end_date
      AND (_doctor_id IS NULL OR consultation.doctor_id = _doctor_id)
  ), selected_visits AS (
    SELECT visit.* FROM filtered_visits AS visit
    WHERE (coalesce(_payment_type, 'all') = 'all' OR visit.payment_type = _payment_type)
      AND (coalesce(_activity_type, 'all') IN ('all', 'consultation')
        OR (coalesce(_activity_type, 'all') = 'procedure' AND EXISTS (
          SELECT 1 FROM public.consultation_items AS procedure_item
          LEFT JOIN public.inventory_items AS inventory ON inventory.id = procedure_item.item_id
          LEFT JOIN public.services AS service ON service.id = procedure_item.service_id
          WHERE procedure_item.consultation_id = visit.id AND procedure_item.deleted_at IS NULL
            AND (procedure_item.service_id IS NOT NULL OR procedure_item.package_id IS NOT NULL
              OR lower(coalesce(inventory.category, '')) = 'procedure'
              OR lower(coalesce(service.category, '')) = 'procedure')))
        OR (coalesce(_activity_type, 'all') = 'document' AND EXISTS (
          SELECT 1 FROM public.consultation_documents AS document
          WHERE document.consultation_id = visit.id
            AND lower(coalesce(document.type, '')) IN ('mc', 'quarantine', 'referral'))))
  ), item_totals AS (
    SELECT visit.id AS consultation_id,
      coalesce(sum(item.price * item.quantity), 0)::numeric AS revenue,
      coalesce(sum(item.unit_cost * greatest(CASE WHEN item.item_id IS NOT NULL
        THEN least(coalesce(item.dispensed_qty, item.quantity), greatest(item.quantity, 0))
        ELSE item.quantity END, 0)), 0)::numeric AS cogs,
      count(*) FILTER (WHERE item.item_id IS NOT NULL AND item.quantity > 0 AND item.unit_cost <= 0)::integer AS missing_cost,
      coalesce(sum(item.quantity) FILTER (WHERE item.service_id IS NOT NULL OR item.package_id IS NOT NULL), 0)::numeric AS procedures
    FROM selected_visits AS visit
    LEFT JOIN public.consultation_items AS item ON item.consultation_id = visit.id AND item.deleted_at IS NULL
    GROUP BY visit.id
  ), aggregate_row AS (
    SELECT count(*)::integer AS visits, count(DISTINCT visit.patient_id)::integer AS patients,
      coalesce(sum(item.revenue), 0)::numeric AS revenue,
      coalesce(sum(item.cogs), 0)::numeric AS cogs,
      coalesce(sum(item.missing_cost), 0)::integer AS missing_cost,
      coalesce(sum(item.procedures), 0)::numeric AS procedures,
      count(*) FILTER (WHERE visit.payment_type = 'self_pay')::integer AS self_pay,
      count(*) FILTER (WHERE visit.payment_type = 'panel')::integer AS panel,
      count(*) FILTER (WHERE visit.doctor_id IS NULL)::integer AS missing_attribution,
      (SELECT count(*)::integer FROM public.consultation_documents AS document
        JOIN selected_visits AS document_visit ON document_visit.id = document.consultation_id
        WHERE lower(coalesce(document.type, '')) IN ('mc', 'quarantine', 'referral')
          AND timezone('Asia/Kuala_Lumpur', document.created_at)::date BETWEEN _start_date AND _end_date) AS documents
    FROM selected_visits AS visit JOIN item_totals AS item ON item.consultation_id = visit.id
  )
  SELECT (v_result->'clinic') || jsonb_build_object(
    'completed_visits', aggregate_row.visits,
    'unique_patients', aggregate_row.patients,
    'visit_billing', round(aggregate_row.revenue, 2),
    'cogs', CASE WHEN aggregate_row.missing_cost = 0 THEN round(aggregate_row.cogs, 2) END,
    'gross_profit', CASE WHEN aggregate_row.missing_cost = 0 THEN round(aggregate_row.revenue - aggregate_row.cogs, 2) END,
    'procedures', aggregate_row.procedures,
    'documents', aggregate_row.documents,
    'self_pay_visits', aggregate_row.self_pay,
    'panel_visits', aggregate_row.panel
  ) INTO v_clinic FROM aggregate_row;

  WITH filtered_doctor_visits AS MATERIALIZED (
    SELECT consultation.id, consultation.patient_id, consultation.doctor_id,
      CASE WHEN lower(coalesce(queue_entry.payment_method, '')) = 'panel'
        OR EXISTS (SELECT 1 FROM public.payments AS classified_payment
          WHERE classified_payment.queue_entry_id = queue_entry.id
            AND classified_payment.deleted_at IS NULL
            AND (lower(coalesce(classified_payment.payment_type, '')) = 'panel'
              OR lower(btrim(classified_payment.payment_method)) = 'panel'))
        THEN 'panel' ELSE 'self_pay' END AS payment_type
    FROM public.consultations AS consultation
    JOIN public.queue_entries AS queue_entry ON queue_entry.id = consultation.queue_entry_id
    WHERE consultation.status = 'completed' AND consultation.deleted_at IS NULL
      AND queue_entry.clinic_status = 'completed' AND queue_entry.deleted_at IS NULL
      AND queue_entry.cancelled_at IS NULL AND queue_entry.visit_type <> 'payment_only'
      AND timezone('Asia/Kuala_Lumpur', queue_entry.created_at)::date BETWEEN _start_date AND _end_date
      AND (_doctor_id IS NULL OR consultation.doctor_id = _doctor_id)
      AND (coalesce(_payment_type, 'all') = 'all' OR CASE
        WHEN lower(coalesce(queue_entry.payment_method, '')) = 'panel'
          OR EXISTS (SELECT 1 FROM public.payments AS classified_payment
            WHERE classified_payment.queue_entry_id = queue_entry.id
              AND classified_payment.deleted_at IS NULL
              AND (lower(coalesce(classified_payment.payment_type, '')) = 'panel'
                OR lower(btrim(classified_payment.payment_method)) = 'panel'))
        THEN 'panel' ELSE 'self_pay' END = _payment_type)
      AND (coalesce(_activity_type, 'all') IN ('all', 'consultation')
        OR (coalesce(_activity_type, 'all') = 'procedure' AND EXISTS (
          SELECT 1 FROM public.consultation_items AS procedure_item
          WHERE procedure_item.consultation_id = consultation.id
            AND procedure_item.deleted_at IS NULL
            AND (procedure_item.service_id IS NOT NULL OR procedure_item.package_id IS NOT NULL)))
        OR (coalesce(_activity_type, 'all') = 'document' AND EXISTS (
          SELECT 1 FROM public.consultation_documents AS document
          WHERE document.consultation_id = consultation.id
            AND lower(coalesce(document.type, '')) IN ('mc', 'quarantine', 'referral'))))
  ), doctor_stats AS (
    SELECT visit.doctor_id, count(*)::integer AS visits,
      count(DISTINCT visit.patient_id)::integer AS patients,
      coalesce(sum(item.price * item.quantity), 0)::numeric AS revenue,
      coalesce(sum(item.quantity) FILTER (WHERE item.service_id IS NOT NULL OR item.package_id IS NOT NULL), 0)::numeric AS procedures,
      (SELECT count(*)::integer FROM public.consultation_documents AS document
        JOIN filtered_doctor_visits AS document_visit ON document_visit.id = document.consultation_id
        WHERE document_visit.doctor_id = visit.doctor_id
          AND lower(coalesce(document.type, '')) IN ('mc', 'quarantine', 'referral')
          AND timezone('Asia/Kuala_Lumpur', document.created_at)::date BETWEEN _start_date AND _end_date) AS documents
    FROM filtered_doctor_visits AS visit
    LEFT JOIN public.consultation_items AS item ON item.consultation_id = visit.id AND item.deleted_at IS NULL
    WHERE visit.doctor_id IS NOT NULL GROUP BY visit.doctor_id
  ), original_rows AS (
    SELECT row_value, nullif(row_value->>'doctor_id', '') AS doctor_id_text
    FROM jsonb_array_elements(v_doctors) AS row_value
  )
  SELECT coalesce(jsonb_agg(CASE WHEN original.doctor_id_text IS NULL THEN
      original.row_value || jsonb_build_object('completed_visits', v_clinic->'completed_visits',
        'unique_patients', v_clinic->'unique_patients', 'visit_billing', v_clinic->'visit_billing',
        'procedures', v_clinic->'procedures', 'documents', v_clinic->'documents')
    ELSE original.row_value || jsonb_build_object(
      'completed_visits', coalesce(stats.visits, 0), 'unique_patients', coalesce(stats.patients, 0),
      'visit_billing', round(coalesce(stats.revenue, 0), 2),
      'patients_per_hour', CASE WHEN (original.row_value->>'rostered_hours')::numeric > 0
        THEN round(coalesce(stats.visits, 0)::numeric / (original.row_value->>'rostered_hours')::numeric, 2) END,
      'revenue_per_hour', CASE WHEN (original.row_value->>'rostered_hours')::numeric > 0
        THEN round(coalesce(stats.revenue, 0) / (original.row_value->>'rostered_hours')::numeric, 2) END,
      'procedures', coalesce(stats.procedures, 0), 'documents', coalesce(stats.documents, 0)) END), '[]'::jsonb)
  INTO v_doctors FROM original_rows AS original
  LEFT JOIN doctor_stats AS stats ON stats.doctor_id::text = original.doctor_id_text;

  IF coalesce(_activity_type, 'all') IN ('all', 'procedure')
     AND v_role <> 'resident_doctor' THEN
    WITH visit_pool AS MATERIALIZED (
      SELECT consultation.id, consultation.patient_id, consultation.doctor_id,
        timezone('Asia/Kuala_Lumpur', queue_entry.created_at)::date AS visit_date,
        CASE WHEN lower(coalesce(queue_entry.payment_method, '')) = 'panel'
          OR EXISTS (SELECT 1 FROM public.payments AS classified_payment
            WHERE classified_payment.queue_entry_id = queue_entry.id
              AND classified_payment.deleted_at IS NULL
              AND (lower(coalesce(classified_payment.payment_type, '')) = 'panel'
                OR lower(btrim(classified_payment.payment_method)) = 'panel'))
          THEN 'panel' ELSE 'self_pay' END AS payment_type
      FROM public.consultations AS consultation
      JOIN public.queue_entries AS queue_entry ON queue_entry.id = consultation.queue_entry_id
      WHERE consultation.status = 'completed' AND consultation.deleted_at IS NULL
        AND queue_entry.clinic_status = 'completed' AND queue_entry.deleted_at IS NULL
        AND queue_entry.cancelled_at IS NULL AND queue_entry.visit_type <> 'payment_only'
        AND timezone('Asia/Kuala_Lumpur', queue_entry.created_at)::date BETWEEN v_previous_start AND _end_date
        AND (_doctor_id IS NULL OR consultation.doctor_id = _doctor_id)
    ), procedure_items AS MATERIALIZED (
      SELECT visit.visit_date, visit.patient_id, visit.doctor_id,
        coalesce(item.service_id::text, item.item_id::text, item.package_id::text,
          legacy_service.id::text, 'legacy-procedure:' || lower(trim(item.item_name))) AS service_id,
        coalesce(nullif(btrim(service.name), ''), nullif(btrim(legacy_service.name), ''),
          nullif(btrim(package.name), ''), nullif(btrim(item.item_name), ''), 'Unknown service') AS service_name,
        item.quantity::numeric AS quantity, (item.price * item.quantity)::numeric AS revenue,
        (item.unit_cost * greatest(CASE WHEN item.item_id IS NOT NULL
          THEN least(coalesce(item.dispensed_qty, item.quantity), greatest(item.quantity, 0))
          ELSE item.quantity END, 0))::numeric AS cogs,
        (item.item_id IS NOT NULL AND item.quantity > 0 AND item.unit_cost <= 0) AS missing_cost
      FROM visit_pool AS visit
      JOIN public.consultation_items AS item ON item.consultation_id = visit.id AND item.deleted_at IS NULL
      LEFT JOIN public.services AS service ON service.id = item.service_id
      LEFT JOIN public.inventory_items AS inventory ON inventory.id = item.item_id
      LEFT JOIN public.packages AS package ON package.id = item.package_id
      LEFT JOIN LATERAL (SELECT candidate.id, candidate.name FROM public.services AS candidate
        WHERE lower(trim(candidate.category)) = 'procedure'
          AND lower(trim(candidate.name)) = lower(trim(item.item_name))
        ORDER BY candidate.id LIMIT 1) AS legacy_service ON item.service_id IS NULL
      WHERE (coalesce(_payment_type, 'all') = 'all' OR visit.payment_type = _payment_type)
        AND (item.service_id IS NOT NULL OR item.package_id IS NOT NULL
          OR lower(coalesce(inventory.category, '')) = 'procedure'
          OR lower(coalesce(service.category, '')) = 'procedure'
          OR legacy_service.id IS NOT NULL
          OR lower(trim(item.item_name)) IN ('excision biopsy', 'excision biopsy (procedure)'))
    ), current_stats AS (
      SELECT service_id, max(service_name) AS service_name, sum(quantity)::numeric AS volume,
        count(DISTINCT patient_id)::integer AS patients, round(sum(revenue), 2) AS revenue,
        round(sum(cogs), 2) AS cogs, count(*) FILTER (WHERE missing_cost)::integer AS missing_cost,
        count(DISTINCT doctor_id) FILTER (WHERE doctor_id IS NOT NULL)::integer AS doctors
      FROM procedure_items WHERE visit_date BETWEEN _start_date AND _end_date GROUP BY service_id
    ), previous_stats AS (
      SELECT service_id, sum(quantity)::numeric AS volume FROM procedure_items
      WHERE visit_date BETWEEN v_previous_start AND v_previous_end GROUP BY service_id
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'service_id', current.service_id, 'service_name', current.service_name,
      'volume', current.volume, 'unique_patients', current.patients,
      'revenue', current.revenue,
      'cogs', CASE WHEN current.missing_cost = 0 THEN current.cogs END,
      'profit', CASE WHEN current.missing_cost = 0 THEN round(current.revenue - current.cogs, 2) END,
      'margin_pct', CASE WHEN current.missing_cost = 0 AND current.revenue <> 0
        THEN round((current.revenue - current.cogs) / current.revenue * 100, 2) END,
      'average_price', CASE WHEN current.volume > 0 THEN round(current.revenue / current.volume, 2) END,
      'trend_pct', CASE WHEN coalesce(_include_comparison, true) AND previous.volume > 0
        THEN round((current.volume - previous.volume) / previous.volume * 100, 2) END,
      'doctor_count', current.doctors, 'missing_cost_count', current.missing_cost
    ) ORDER BY current.revenue DESC, current.service_name), '[]'::jsonb)
    INTO v_services
    FROM current_stats AS current LEFT JOIN previous_stats AS previous USING (service_id);
  END IF;

  RETURN v_result || jsonb_build_object(
    'clinic', v_clinic, 'doctors', v_doctors, 'services', v_services,
    'filters', jsonb_build_object('doctor_id', _doctor_id, 'payment_type', coalesce(_payment_type, 'all'),
      'activity_type', coalesce(_activity_type, 'all'), 'include_comparison', coalesce(_include_comparison, true))
  );
END;
$function$;

ALTER FUNCTION public.get_insight_performance_filtered(date, date, uuid, text, text, boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_insight_performance_filtered(date, date, uuid, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_insight_performance_filtered(date, date, uuid, text, text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_insight_performance_detail(
  _start_date date,
  _end_date date,
  _detail_kind text,
  _detail_id text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_role text;
  v_caller_doctor_id uuid;
  v_detail_doctor_id uuid;
  v_result jsonb;
BEGIN
  IF NOT public.can_view_insight_workspace((SELECT auth.uid())) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF _start_date IS NULL OR _end_date IS NULL OR _start_date > _end_date
     OR (_end_date - _start_date) > 364 OR _detail_id IS NULL OR btrim(_detail_id) = '' THEN
    RAISE EXCEPTION 'INVALID_DETAIL_REQUEST' USING ERRCODE = '22023';
  END IF;
  IF _detail_kind NOT IN ('doctor', 'service') THEN
    RAISE EXCEPTION 'INVALID_DETAIL_KIND' USING ERRCODE = '22023';
  END IF;
  SELECT role_row.role::text INTO v_role FROM public.user_roles AS role_row
    WHERE role_row.user_id = (SELECT auth.uid()) LIMIT 1;
  SELECT doctor.id INTO v_caller_doctor_id FROM public.doctors AS doctor
    WHERE doctor.user_id = (SELECT auth.uid()) AND doctor.status = 'active'
    ORDER BY doctor.updated_at DESC, doctor.id LIMIT 1;

  IF _detail_kind = 'doctor' THEN
    BEGIN v_detail_doctor_id := _detail_id::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'INVALID_DOCTOR_ID' USING ERRCODE = '22023';
    END;
    IF v_role NOT IN ('special_admin', 'doctor_admin', 'resident_doctor')
       OR (v_role = 'resident_doctor' AND v_detail_doctor_id IS DISTINCT FROM v_caller_doctor_id) THEN
      RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
    END IF;

    WITH visits AS MATERIALIZED (
      SELECT consultation.*, queue_entry.created_at AS visit_created_at,
        queue_entry.called_at, queue_entry.updated_at AS queue_updated_at,
        queue_entry.queue_sequence,
        timezone('Asia/Kuala_Lumpur', queue_entry.created_at)::date AS visit_date,
        CASE
          WHEN timezone('Asia/Kuala_Lumpur', coalesce(queue_entry.called_at, queue_entry.created_at))::time < time '12:00' THEN 'S1'
          WHEN timezone('Asia/Kuala_Lumpur', coalesce(queue_entry.called_at, queue_entry.created_at))::time < time '17:00' THEN 'S2'
          ELSE 'S3'
        END AS actual_shift,
        CASE WHEN queue_entry.called_at IS NOT NULL AND consultation.updated_at > queue_entry.called_at
          THEN extract(epoch FROM (consultation.updated_at - queue_entry.called_at)) / 60 END AS duration_minutes,
        CASE WHEN lower(coalesce(queue_entry.payment_method, '')) = 'panel'
          OR EXISTS (SELECT 1 FROM public.payments AS classified_payment
            WHERE classified_payment.queue_entry_id = queue_entry.id
              AND classified_payment.deleted_at IS NULL
              AND (lower(coalesce(classified_payment.payment_type, '')) = 'panel'
                OR lower(btrim(classified_payment.payment_method)) = 'panel'))
          THEN 'panel' ELSE 'self_pay' END AS payment_type
      FROM public.consultations AS consultation
      JOIN public.queue_entries AS queue_entry ON queue_entry.id = consultation.queue_entry_id
      WHERE consultation.doctor_id = v_detail_doctor_id
        AND consultation.status = 'completed' AND consultation.deleted_at IS NULL
        AND queue_entry.clinic_status = 'completed' AND queue_entry.deleted_at IS NULL
        AND queue_entry.cancelled_at IS NULL AND queue_entry.visit_type <> 'payment_only'
        AND timezone('Asia/Kuala_Lumpur', queue_entry.created_at)::date BETWEEN _start_date AND _end_date
    ), items AS MATERIALIZED (
      SELECT item.*, visit.patient_id, visit.visit_date
      FROM visits AS visit JOIN public.consultation_items AS item
        ON item.consultation_id = visit.id AND item.deleted_at IS NULL
    ), financial AS (
      SELECT coalesce(sum(item.price * item.quantity), 0)::numeric AS revenue,
        coalesce(sum(item.unit_cost * greatest(CASE WHEN item.item_id IS NOT NULL
          THEN least(coalesce(item.dispensed_qty, item.quantity), greatest(item.quantity, 0))
          ELSE item.quantity END, 0)), 0)::numeric AS cogs,
        count(*) FILTER (WHERE item.item_id IS NOT NULL AND item.quantity > 0 AND item.unit_cost <= 0)::integer AS missing_cost
      FROM items AS item
    ), quality AS (
      SELECT count(*) FILTER (WHERE btrim(coalesce(visit.case_note, '')) = '')::integer AS missing_notes,
        count(*) FILTER (WHERE visit.diagnosis_id IS NULL AND btrim(coalesce(visit.diagnosis_text, '')) = '')::integer AS missing_diagnosis,
        count(*) FILTER (WHERE btrim(coalesce(visit.dispense_note, '')) = '')::integer AS missing_dispense_note,
        count(*) FILTER (WHERE visit.entry_source = 'offline_transcription' AND visit.returned_at IS NOT NULL)::integer AS returned_offline,
        count(*) FILTER (WHERE visit.doctor_id IS NULL)::integer AS missing_attribution,
        (SELECT count(DISTINCT audit.consultation_id)::integer
          FROM public.completed_bill_correction_audit AS audit
          JOIN visits AS corrected ON corrected.id = audit.consultation_id) AS corrected_bills
      FROM visits AS visit
    )
    SELECT jsonb_build_object(
      'kind', 'doctor', 'doctor_id', v_detail_doctor_id,
      'visits_by_shift', coalesce((SELECT jsonb_agg(jsonb_build_object('date', grouped.visit_date,
        'shift', grouped.actual_shift, 'visits', grouped.visit_count) ORDER BY grouped.visit_date, grouped.actual_shift)
        FROM (SELECT visit_date, actual_shift, count(*)::integer AS visit_count FROM visits
          GROUP BY visit_date, actual_shift) AS grouped), '[]'::jsonb),
      'average_visit_duration_minutes', (SELECT round(avg(duration_minutes), 1) FROM visits WHERE duration_minutes IS NOT NULL),
      'duration_measured_visits', (SELECT count(*) FROM visits WHERE duration_minutes IS NOT NULL),
      'payment_mix', coalesce((SELECT jsonb_agg(jsonb_build_object('payment_type', grouped.payment_type,
        'visits', grouped.visit_count) ORDER BY grouped.payment_type)
        FROM (SELECT payment_type, count(*)::integer AS visit_count FROM visits GROUP BY payment_type) AS grouped), '[]'::jsonb),
      'financial', jsonb_build_object('revenue', round(financial.revenue, 2),
        'cogs', CASE WHEN financial.missing_cost = 0 THEN round(financial.cogs, 2) END,
        'gross_profit', CASE WHEN financial.missing_cost = 0 THEN round(financial.revenue - financial.cogs, 2) END,
        'margin_pct', CASE WHEN financial.missing_cost = 0 AND financial.revenue <> 0
          THEN round((financial.revenue - financial.cogs) / financial.revenue * 100, 2) END,
        'revenue_per_visit', CASE WHEN (SELECT count(*) FROM visits) > 0
          THEN round(financial.revenue / (SELECT count(*) FROM visits), 2) END,
        'revenue_per_hour', (SELECT (doctor_row->>'revenue_per_hour')::numeric
          FROM jsonb_array_elements(public.get_insight_performance(_start_date, _end_date)->'doctors') AS doctor_row
          WHERE doctor_row->>'doctor_id' = v_detail_doctor_id::text LIMIT 1),
        'missing_cost_count', financial.missing_cost),
      'quality', jsonb_build_object('missing_consultation_notes', quality.missing_notes,
        'missing_diagnosis', quality.missing_diagnosis,
        'missing_dispense_note', quality.missing_dispense_note,
        'returned_offline_consultations', quality.returned_offline,
        'incomplete_doctor_attribution', quality.missing_attribution,
        'bills_corrected_after_completion', quality.corrected_bills),
      'diagnoses', coalesce((SELECT jsonb_agg(jsonb_build_object('name', diagnosis.name, 'visits', diagnosis.visits)
        ORDER BY diagnosis.visits DESC, diagnosis.name) FROM (
          SELECT coalesce(nullif(btrim(visit.diagnosis_text), ''), diagnosis_row.name, 'Not recorded') AS name,
            count(*)::integer AS visits FROM visits AS visit
          LEFT JOIN public.diagnoses AS diagnosis_row ON diagnosis_row.id = visit.diagnosis_id
          GROUP BY 1) AS diagnosis), '[]'::jsonb),
      'procedures', coalesce((SELECT jsonb_agg(jsonb_build_object('name', procedure.item_name,
        'quantity', procedure.quantity, 'charged', procedure.charged,
        'cogs', procedure.cogs, 'gross_profit', procedure.charged - procedure.cogs)
        ORDER BY procedure.charged DESC, procedure.item_name) FROM (
          SELECT item.item_name, sum(item.quantity)::numeric AS quantity,
            round(sum(item.price * item.quantity), 2) AS charged,
            round(sum(item.unit_cost * item.quantity), 2) AS cogs
          FROM items AS item
          WHERE item.service_id IS NOT NULL OR item.package_id IS NOT NULL
            OR EXISTS (SELECT 1 FROM public.inventory_items AS inventory
              WHERE inventory.id = item.item_id AND lower(coalesce(inventory.category, '')) = 'procedure')
            OR EXISTS (SELECT 1 FROM public.services AS service
              WHERE service.id = item.service_id AND lower(coalesce(service.category, '')) = 'procedure')
          GROUP BY item.item_name) AS procedure), '[]'::jsonb),
      'medicines', coalesce((SELECT jsonb_agg(jsonb_build_object('name', medicine.item_name,
        'quantity', medicine.quantity) ORDER BY medicine.quantity DESC, medicine.item_name) FROM (
          SELECT item_name, sum(coalesce(dispensed_qty, quantity))::numeric AS quantity FROM items
          WHERE item_id IS NOT NULL GROUP BY item_name) AS medicine), '[]'::jsonb)
    ) INTO v_result FROM financial CROSS JOIN quality;
  ELSE
    IF v_role = 'resident_doctor' OR v_role NOT IN ('special_admin', 'doctor_admin', 'admin', 'ops_staff', 'operations') THEN
      RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
    END IF;
    WITH service_items AS MATERIALIZED (
      SELECT item.*, consultation.patient_id, consultation.doctor_id,
        queue_entry.id AS queue_entry_id, queue_entry.queue_sequence,
        timezone('Asia/Kuala_Lumpur', queue_entry.created_at)::date AS visit_date,
        CASE WHEN lower(coalesce(queue_entry.payment_method, '')) = 'panel'
          OR EXISTS (SELECT 1 FROM public.payments AS classified_payment
            WHERE classified_payment.queue_entry_id = queue_entry.id
              AND classified_payment.deleted_at IS NULL
              AND (lower(coalesce(classified_payment.payment_type, '')) = 'panel'
                OR lower(btrim(classified_payment.payment_method)) = 'panel'))
          THEN 'panel' ELSE 'self_pay' END AS payment_type,
        coalesce(service.name, inventory.name, package.name, item.item_name) AS service_name,
        coalesce(item.service_id::text, item.item_id::text, item.package_id::text,
          'legacy-procedure:' || lower(trim(item.item_name))) AS service_key
      FROM public.consultation_items AS item
      JOIN public.consultations AS consultation ON consultation.id = item.consultation_id
      JOIN public.queue_entries AS queue_entry ON queue_entry.id = consultation.queue_entry_id
      LEFT JOIN public.services AS service ON service.id = item.service_id
      LEFT JOIN public.inventory_items AS inventory ON inventory.id = item.item_id
      LEFT JOIN public.packages AS package ON package.id = item.package_id
      WHERE item.deleted_at IS NULL AND consultation.deleted_at IS NULL
        AND consultation.status = 'completed' AND queue_entry.clinic_status = 'completed'
        AND queue_entry.deleted_at IS NULL AND queue_entry.cancelled_at IS NULL
        AND timezone('Asia/Kuala_Lumpur', queue_entry.created_at)::date BETWEEN _start_date AND _end_date
        AND coalesce(item.service_id::text, item.item_id::text, item.package_id::text,
          'legacy-procedure:' || lower(trim(item.item_name))) = _detail_id
    ), doctor_mix AS (
      SELECT item.doctor_id,
        coalesce(nullif(btrim(profile.full_name), ''), nullif(btrim(doctor.name), ''), 'Unknown doctor') AS doctor_name,
        sum(item.quantity)::numeric AS volume
      FROM service_items AS item JOIN public.doctors AS doctor ON doctor.id = item.doctor_id
      LEFT JOIN public.profiles AS profile ON profile.id = doctor.user_id
      GROUP BY item.doctor_id, profile.full_name, doctor.name
    )
    SELECT jsonb_build_object(
      'kind', 'service', 'service_id', _detail_id,
      'service_name', (SELECT max(service_name) FROM service_items),
      'trend', coalesce((SELECT jsonb_agg(jsonb_build_object('date', grouped.visit_date,
        'volume', grouped.volume, 'revenue', grouped.revenue) ORDER BY grouped.visit_date)
        FROM (SELECT visit_date, sum(quantity)::numeric AS volume,
          round(sum(price * quantity), 2) AS revenue FROM service_items GROUP BY visit_date) AS grouped), '[]'::jsonb),
      'doctor_contribution', CASE WHEN v_role IN ('special_admin', 'doctor_admin') THEN
        coalesce((SELECT jsonb_agg(jsonb_build_object('doctor_id', doctor_id,
          'doctor_name', doctor_name, 'volume', volume) ORDER BY volume DESC) FROM doctor_mix), '[]'::jsonb)
        ELSE '[]'::jsonb END,
      'payment_mix', coalesce((SELECT jsonb_agg(jsonb_build_object('payment_type', grouped.payment_type,
        'visits', grouped.visits) ORDER BY grouped.payment_type) FROM (
          SELECT payment_type, count(DISTINCT consultation_id)::integer AS visits FROM service_items GROUP BY payment_type) AS grouped), '[]'::jsonb),
      'visits', coalesce((SELECT jsonb_agg(jsonb_build_object('queue_entry_id', queue_entry_id,
        'queue_sequence', queue_sequence, 'visit_date', visit_date, 'payment_type', payment_type,
        'quantity', quantity, 'unit_price', price, 'total_price', price * quantity,
        'cogs', unit_cost * quantity, 'gross_profit', (price - unit_cost) * quantity)
        ORDER BY visit_date DESC, queue_sequence DESC) FROM service_items), '[]'::jsonb),
      'current_catalog', coalesce((SELECT jsonb_build_object('price', service.price_to_patient,
        'cogs', service.cost, 'gross_profit', service.price_to_patient - service.cost,
        'margin_pct', CASE WHEN service.price_to_patient <> 0 THEN
          round((service.price_to_patient - service.cost) / service.price_to_patient * 100, 2) END)
        FROM public.services AS service WHERE service.id::text = _detail_id), 'null'::jsonb),
      'margin_history', coalesce((SELECT jsonb_agg(jsonb_build_object('date', grouped.visit_date,
        'average_price', grouped.average_price, 'average_cogs', grouped.average_cogs,
        'margin_pct', grouped.margin_pct) ORDER BY grouped.visit_date) FROM (
          SELECT visit_date, round(sum(price * quantity) / nullif(sum(quantity), 0), 2) AS average_price,
            round(sum(unit_cost * quantity) / nullif(sum(quantity), 0), 2) AS average_cogs,
            CASE WHEN sum(price * quantity) <> 0 THEN round((sum(price * quantity) - sum(unit_cost * quantity))
              / sum(price * quantity) * 100, 2) END AS margin_pct
          FROM service_items GROUP BY visit_date) AS grouped), '[]'::jsonb)
    ) INTO v_result;
  END IF;
  RETURN v_result;
END;
$function$;

ALTER FUNCTION public.get_insight_performance_detail(date, date, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_insight_performance_detail(date, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_insight_performance_detail(date, date, text, text) TO authenticated;

COMMENT ON FUNCTION public.get_insight_viewer_scope() IS
  'Returns the effective reports.view boundary and resident doctor identity without exposing permission tables.';
COMMENT ON FUNCTION public.get_insight_performance_filtered(date, date, uuid, text, text, boolean) IS
  'Returns server-filtered performance aggregates; never trusts caller-supplied role or resident identity.';
COMMENT ON FUNCTION public.get_insight_performance_detail(date, date, text, text) IS
  'Returns a lazy role-redacted doctor or service performance drill-down.';

NOTIFY pgrst, 'reload schema';
