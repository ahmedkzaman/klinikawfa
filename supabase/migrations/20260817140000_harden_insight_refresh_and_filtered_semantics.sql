-- Round-three hardening for live authorization refreshes and filter semantics.
-- Additive only; intentionally not applied by this task.

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
  v_role_created_at timestamptz;
  v_doctor_id uuid;
  v_allowed boolean := false;
  v_permission_version text;
BEGIN
  SELECT role_row.role::text, role_row.created_at
  INTO v_role, v_role_created_at
  FROM public.user_roles AS role_row
  WHERE role_row.user_id = v_user_id
  LIMIT 1;

  v_allowed := v_user_id IS NOT NULL AND public.can_view_insight_workspace();
  IF v_role = 'resident_doctor' THEN
    SELECT doctor.id INTO v_doctor_id
    FROM public.doctors AS doctor
    WHERE doctor.user_id = v_user_id AND doctor.status = 'active'
    ORDER BY doctor.updated_at DESC, doctor.id
    LIMIT 1;
    v_allowed := v_allowed AND v_doctor_id IS NOT NULL;
  END IF;

  SELECT concat_ws(':',
    coalesce(v_role, 'none'),
    coalesce(v_role_created_at::text, 'unversioned-role'),
    coalesce((SELECT max(permission.updated_at)::text
      FROM public.clinic_role_permissions AS permission
      WHERE permission.role::text = v_role
        AND permission.permission_key = 'reports.view'), 'unversioned-default'),
    coalesce((SELECT max(override_row.updated_at)::text
      FROM public.clinic_user_permission_overrides AS override_row
      WHERE override_row.user_id = v_user_id
        AND override_row.permission_key = 'reports.view'), 'unversioned-override')
  ) INTO v_permission_version;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    -- Role is authoritative presentation scope even when reports.view is denied.
    'role', v_role,
    'doctor_id', CASE WHEN v_allowed AND v_role = 'resident_doctor' THEN v_doctor_id END,
    'permission_version', v_permission_version
  );
END;
$function$;

ALTER FUNCTION public.get_insight_viewer_scope() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_insight_viewer_scope() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_insight_viewer_scope() TO authenticated;

-- The historic UUID overload is required by old server-side report bodies, but
-- must not remain a callable permission oracle through PostgREST.
REVOKE ALL ON FUNCTION public.can_view_insight_workspace(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._insight_is_procedure_item(
  _service_id uuid, _item_id uuid, _package_id uuid, _item_name text
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT CASE
    WHEN _package_id IS NOT NULL THEN true
    WHEN _service_id IS NOT NULL THEN EXISTS (
      SELECT 1 FROM public.services AS service
      WHERE service.id = _service_id
        AND lower(btrim(coalesce(service.category, ''))) = 'procedure'
    )
    -- An explicitly linked inventory row is authoritative. In particular, a
    -- medicine with the same display name as a service cannot fall through.
    WHEN _item_id IS NOT NULL THEN EXISTS (
      SELECT 1 FROM public.inventory_items AS inventory
      WHERE inventory.id = _item_id
        AND lower(btrim(coalesce(inventory.category, ''))) = 'procedure'
    )
    ELSE EXISTS (
      SELECT 1 FROM public.services AS legacy_service
      WHERE lower(btrim(coalesce(legacy_service.category, ''))) = 'procedure'
        AND lower(btrim(legacy_service.name)) = lower(btrim(coalesce(_item_name, '')))
    ) OR lower(btrim(coalesce(_item_name, ''))) IN (
      'excision biopsy', 'excision biopsy (procedure)'
    )
  END;
$function$;

ALTER FUNCTION public._insight_is_procedure_item(uuid, uuid, uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public._insight_is_procedure_item(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._insight_payment_classification(_queue_entry_id uuid, _queue_payment_method text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT CASE WHEN lower(btrim(coalesce(_queue_payment_method, ''))) = 'panel'
    OR EXISTS (
      SELECT 1 FROM public.payments AS payment
      WHERE payment.queue_entry_id = _queue_entry_id
        AND payment.deleted_at IS NULL
        AND (
          lower(btrim(coalesce(payment.payment_type, ''))) = 'panel'
          OR lower(btrim(coalesce(payment.payment_method, ''))) = 'panel'
        )
    ) THEN 'panel' ELSE 'self_pay' END;
$function$;

ALTER FUNCTION public._insight_payment_classification(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public._insight_payment_classification(uuid, text) FROM PUBLIC, anon, authenticated;

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
  ), shifts AS (
    SELECT day.key::date AS roster_date, shift.key AS shift_key,
      CASE WHEN (assignment.value->>'staffId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN (assignment.value->>'staffId')::uuid END AS doctor_id
    FROM current_rosters AS roster
    CROSS JOIN LATERAL jsonb_each(roster.roster_data) AS day(key, value)
    CROSS JOIN LATERAL jsonb_each(day.value) AS shift(key, value)
    CROSS JOIN LATERAL jsonb_array_elements(CASE jsonb_typeof(shift.value)
      WHEN 'array' THEN shift.value WHEN 'object' THEN jsonb_build_array(shift.value)
      ELSE '[]'::jsonb END) AS assignment(value)
    WHERE day.key ~ '^\d{4}-\d{2}-\d{2}$'
      AND shift.key IN ('DOC_S1', 'shift1', 'DOC_S2', 'shift2', 'DOC_S3', 'shift3')
      AND lower(coalesce(assignment.value->>'status', '')) NOT IN ('cancelled', 'canceled')
      AND lower(coalesce(assignment.value->>'cancelled', 'false')) <> 'true'
  )
  SELECT coalesce(sum(CASE WHEN shift_key IN ('DOC_S1', 'shift1') THEN 5
    WHEN shift_key IN ('DOC_S2', 'shift2') THEN 5
    WHEN shift_key IN ('DOC_S3', 'shift3') THEN 4 END), 0)::numeric
  FROM shifts
  WHERE roster_date BETWEEN _start_date AND _end_date
    AND (_doctor_id IS NULL OR doctor_id = _doctor_id);
$function$;

ALTER FUNCTION public._insight_rostered_hours(date, date, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public._insight_rostered_hours(date, date, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_insight_performance_filtered(
  _start_date date, _end_date date, _doctor_id uuid, _payment_type text,
  _activity_type text, _include_comparison boolean
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_result jsonb;
  v_clinic jsonb;
  v_doctors jsonb;
  v_services jsonb;
  v_quality jsonb;
  v_confidence jsonb;
  v_role text;
  v_resident_doctor uuid;
BEGIN
  IF NOT public.can_view_insight_workspace() THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF _start_date IS NULL OR _end_date IS NULL OR _start_date > _end_date
     OR (_end_date - _start_date) > 364 THEN
    RAISE EXCEPTION 'INVALID_DATE_RANGE' USING ERRCODE = '22023';
  END IF;
  IF coalesce(_payment_type, 'all') NOT IN ('all', 'self_pay', 'panel')
     OR coalesce(_activity_type, 'all') NOT IN ('all', 'consultation', 'procedure', 'document') THEN
    RAISE EXCEPTION 'INVALID_FILTER' USING ERRCODE = '22023';
  END IF;
  SELECT role_row.role::text INTO v_role FROM public.user_roles AS role_row
    WHERE role_row.user_id = (SELECT auth.uid()) LIMIT 1;
  SELECT doctor.id INTO v_resident_doctor FROM public.doctors AS doctor
    WHERE doctor.user_id = (SELECT auth.uid()) AND doctor.status = 'active'
    ORDER BY doctor.updated_at DESC, doctor.id LIMIT 1;
  IF v_role = 'resident_doctor' AND
     (v_resident_doctor IS NULL OR coalesce(_doctor_id, v_resident_doctor) <> v_resident_doctor) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  v_result := public.get_insight_performance(_start_date, _end_date);

  WITH visit_pool AS MATERIALIZED (
    SELECT consultation.id, consultation.patient_id, consultation.doctor_id, queue_entry.id AS queue_entry_id,
      public._insight_payment_classification(queue_entry.id, queue_entry.payment_method) AS payment_type
    FROM public.consultations AS consultation
    JOIN public.queue_entries AS queue_entry ON queue_entry.id = consultation.queue_entry_id
    WHERE consultation.status = 'completed' AND consultation.deleted_at IS NULL
      AND queue_entry.clinic_status = 'completed' AND queue_entry.deleted_at IS NULL
      AND queue_entry.cancelled_at IS NULL AND queue_entry.visit_type <> 'payment_only'
      AND (
        (coalesce(_activity_type, 'all') = 'document' AND EXISTS (
          SELECT 1 FROM public.consultation_documents AS issued_document
          WHERE issued_document.consultation_id = consultation.id
            AND lower(coalesce(issued_document.type, '')) IN ('mc', 'quarantine', 'referral')
            AND timezone('Asia/Kuala_Lumpur', issued_document.created_at)::date BETWEEN _start_date AND _end_date
        ))
        OR (coalesce(_activity_type, 'all') <> 'document'
          AND timezone('Asia/Kuala_Lumpur', queue_entry.created_at)::date BETWEEN _start_date AND _end_date)
      )
      AND (_doctor_id IS NULL OR consultation.doctor_id = _doctor_id)
      AND (v_role <> 'resident_doctor' OR consultation.doctor_id = v_resident_doctor)
  ), selected_visits AS MATERIALIZED (
    SELECT visit.* FROM visit_pool AS visit
    WHERE (coalesce(_payment_type, 'all') = 'all' OR visit.payment_type = _payment_type)
      AND (coalesce(_activity_type, 'all') IN ('all', 'consultation')
        OR (coalesce(_activity_type, 'all') = 'procedure' AND EXISTS (
          SELECT 1 FROM public.consultation_items AS item
          WHERE item.consultation_id = visit.id AND item.deleted_at IS NULL
            AND public._insight_is_procedure_item(item.service_id, item.item_id, item.package_id, item.item_name)))
        OR (coalesce(_activity_type, 'all') = 'document' AND EXISTS (
          SELECT 1 FROM public.consultation_documents AS document
          WHERE document.consultation_id = visit.id
            AND lower(coalesce(document.type, '')) IN ('mc', 'quarantine', 'referral'))))
  ), item_stats AS (
    SELECT visit.id AS consultation_id,
      coalesce(sum(item.price * item.quantity), 0)::numeric AS revenue,
      coalesce(sum(item.unit_cost * greatest(CASE WHEN item.item_id IS NOT NULL
        THEN least(coalesce(item.dispensed_qty, item.quantity), greatest(item.quantity, 0))
        ELSE item.quantity END, 0)), 0)::numeric AS cogs,
      count(*) FILTER (WHERE item.item_id IS NOT NULL
        AND greatest(least(coalesce(item.dispensed_qty, item.quantity), greatest(item.quantity, 0)), 0) > 0
        AND item.unit_cost <= 0)::integer AS missing_cost,
      CASE WHEN coalesce(_activity_type, 'all') = 'document' THEN 0 ELSE
        coalesce(sum(item.quantity) FILTER (WHERE public._insight_is_procedure_item(
          item.service_id, item.item_id, item.package_id, item.item_name)), 0) END::numeric AS procedures,
      CASE WHEN coalesce(_activity_type, 'all') = 'procedure' THEN 0 ELSE
        count(DISTINCT item.source_document_id) FILTER (WHERE item.source_document_id IS NOT NULL) END::integer AS documents,
      coalesce((SELECT sum(payment.amount) FROM public.payments AS payment
        WHERE payment.queue_entry_id = visit.queue_entry_id AND payment.deleted_at IS NULL
          AND lower(coalesce(payment.payment_type, '')) <> 'panel'
          AND lower(btrim(coalesce(payment.payment_method, ''))) <> 'panel'), 0)::numeric AS collected
    FROM selected_visits AS visit
    LEFT JOIN public.consultation_items AS item ON item.consultation_id = visit.id AND item.deleted_at IS NULL
    GROUP BY visit.id, visit.queue_entry_id
  ), totals AS (
    SELECT count(*)::integer AS visits, count(DISTINCT visit.patient_id)::integer AS patients,
      coalesce(sum(stats.revenue), 0)::numeric AS revenue, coalesce(sum(stats.cogs), 0)::numeric AS cogs,
      coalesce(sum(stats.missing_cost), 0)::integer AS missing_cost,
      coalesce(sum(stats.procedures), 0)::numeric AS procedures,
      coalesce(sum(stats.documents), 0)::integer AS documents,
      coalesce(sum(stats.collected), 0)::numeric AS collected,
      count(*) FILTER (WHERE visit.payment_type = 'self_pay')::integer AS self_pay,
      count(*) FILTER (WHERE visit.payment_type = 'panel')::integer AS panel
    FROM selected_visits AS visit JOIN item_stats AS stats ON stats.consultation_id = visit.id
  ), roster AS (
    SELECT public._insight_rostered_hours(
      _start_date, _end_date,
      CASE WHEN v_role = 'resident_doctor' THEN v_resident_doctor ELSE _doctor_id END
    ) AS hours
  )
  SELECT (v_result->'clinic') || jsonb_build_object(
    'completed_visits', totals.visits, 'unique_patients', totals.patients,
    'rostered_hours', round(roster.hours, 2),
    'patients_per_hour', CASE WHEN roster.hours > 0 THEN round(totals.visits / roster.hours, 2) END,
    'visit_billing', round(totals.revenue, 2),
    'patient_collected', round(totals.collected, 2),
    'revenue_per_hour', CASE WHEN roster.hours > 0 THEN round(totals.revenue / roster.hours, 2) END,
    'cogs', CASE WHEN totals.missing_cost = 0 THEN round(totals.cogs, 2) END,
    'gross_profit', CASE WHEN totals.missing_cost = 0 THEN round(totals.revenue - totals.cogs, 2) END,
    'procedures', totals.procedures, 'documents', totals.documents,
    'self_pay_visits', totals.self_pay, 'panel_visits', totals.panel
  ) INTO v_clinic FROM totals CROSS JOIN roster;

  WITH visit_pool AS MATERIALIZED (
    SELECT consultation.id, consultation.patient_id, consultation.doctor_id,
      public._insight_payment_classification(queue_entry.id, queue_entry.payment_method) AS payment_type
    FROM public.consultations AS consultation JOIN public.queue_entries AS queue_entry ON queue_entry.id = consultation.queue_entry_id
    WHERE consultation.status = 'completed' AND consultation.deleted_at IS NULL
      AND queue_entry.clinic_status = 'completed' AND queue_entry.deleted_at IS NULL
      AND queue_entry.cancelled_at IS NULL AND queue_entry.visit_type <> 'payment_only'
      AND timezone('Asia/Kuala_Lumpur', queue_entry.created_at)::date BETWEEN _start_date AND _end_date
      AND (_doctor_id IS NULL OR consultation.doctor_id = _doctor_id)
      AND (v_role <> 'resident_doctor' OR consultation.doctor_id = v_resident_doctor)
  ), selected AS MATERIALIZED (
    SELECT visit.* FROM visit_pool AS visit WHERE (coalesce(_payment_type, 'all') = 'all' OR visit.payment_type = _payment_type)
      AND (coalesce(_activity_type, 'all') IN ('all', 'consultation')
        OR (_activity_type = 'procedure' AND EXISTS (SELECT 1 FROM public.consultation_items AS item
          WHERE item.consultation_id = visit.id AND item.deleted_at IS NULL
            AND public._insight_is_procedure_item(item.service_id, item.item_id, item.package_id, item.item_name)))
        OR (_activity_type = 'document' AND EXISTS (SELECT 1 FROM public.consultation_documents AS document
          WHERE document.consultation_id = visit.id AND lower(coalesce(document.type, '')) IN ('mc','quarantine','referral'))))
  ), item_stats AS (
    SELECT selected.id, coalesce(sum(item.price * item.quantity), 0)::numeric AS revenue,
      CASE WHEN coalesce(_activity_type, 'all') = 'document' THEN 0 ELSE
        coalesce(sum(item.quantity) FILTER (WHERE public._insight_is_procedure_item(
          item.service_id, item.item_id, item.package_id, item.item_name)), 0) END::numeric AS procedures,
      CASE WHEN coalesce(_activity_type, 'all') = 'procedure' THEN 0 ELSE
        count(DISTINCT item.source_document_id) FILTER (WHERE item.source_document_id IS NOT NULL) END::integer AS documents
    FROM selected LEFT JOIN public.consultation_items AS item ON item.consultation_id = selected.id AND item.deleted_at IS NULL
    GROUP BY selected.id
  ), grouped AS (
    SELECT selected.doctor_id, count(*)::integer AS visits, count(DISTINCT selected.patient_id)::integer AS patients,
      sum(item_stats.revenue)::numeric AS revenue, sum(item_stats.procedures)::numeric AS procedures,
      sum(item_stats.documents)::integer AS documents
    FROM selected JOIN item_stats USING (id) WHERE selected.doctor_id IS NOT NULL GROUP BY selected.doctor_id
  ), named_rows AS (
    SELECT base.doctor_row || jsonb_build_object('completed_visits', grouped.visits,
      'unique_patients', grouped.patients, 'visit_billing', round(grouped.revenue, 2),
      'rostered_hours', public._insight_rostered_hours(_start_date, _end_date, grouped.doctor_id),
      'patients_per_hour', CASE WHEN public._insight_rostered_hours(_start_date, _end_date, grouped.doctor_id) > 0
        THEN round(grouped.visits / public._insight_rostered_hours(_start_date, _end_date, grouped.doctor_id), 2) END,
      'revenue_per_hour', CASE WHEN public._insight_rostered_hours(_start_date, _end_date, grouped.doctor_id) > 0
        THEN round(grouped.revenue / public._insight_rostered_hours(_start_date, _end_date, grouped.doctor_id), 2) END,
      'procedures', grouped.procedures, 'documents', grouped.documents) AS doctor_row
    FROM grouped JOIN LATERAL (SELECT source_row AS doctor_row FROM jsonb_array_elements(v_result->'doctors') AS source_row
      WHERE source_row->>'doctor_id' = grouped.doctor_id::text LIMIT 1) AS base ON true
  ), resident_benchmark_visits AS MATERIALIZED (
    SELECT consultation.id, consultation.patient_id, consultation.doctor_id, queue_entry.id AS queue_entry_id
    FROM public.consultations AS consultation
    JOIN public.queue_entries AS queue_entry ON queue_entry.id = consultation.queue_entry_id
    WHERE v_role = 'resident_doctor' AND consultation.doctor_id IS DISTINCT FROM v_resident_doctor
      AND consultation.status = 'completed' AND consultation.deleted_at IS NULL
      AND queue_entry.clinic_status = 'completed' AND queue_entry.deleted_at IS NULL
      AND queue_entry.cancelled_at IS NULL AND queue_entry.visit_type <> 'payment_only'
      AND timezone('Asia/Kuala_Lumpur', queue_entry.created_at)::date BETWEEN _start_date AND _end_date
      AND (coalesce(_payment_type, 'all') = 'all'
        OR public._insight_payment_classification(queue_entry.id, queue_entry.payment_method) = _payment_type)
      AND (coalesce(_activity_type, 'all') IN ('all', 'consultation')
        OR (_activity_type = 'procedure' AND EXISTS (
          SELECT 1 FROM public.consultation_items AS procedure_item
          WHERE procedure_item.consultation_id = consultation.id AND procedure_item.deleted_at IS NULL
            AND public._insight_is_procedure_item(procedure_item.service_id, procedure_item.item_id,
              procedure_item.package_id, procedure_item.item_name)
        ))
        OR (_activity_type = 'document' AND EXISTS (
          SELECT 1 FROM public.consultation_documents AS issued_document
          WHERE issued_document.consultation_id = consultation.id
            AND lower(coalesce(issued_document.type, '')) IN ('mc', 'quarantine', 'referral')
            AND timezone('Asia/Kuala_Lumpur', issued_document.created_at)::date BETWEEN _start_date AND _end_date
        )))
  ), resident_benchmark AS (
    SELECT count(DISTINCT visit.id)::integer AS visits,
      count(DISTINCT visit.patient_id)::integer AS patients,
      coalesce(sum(item.price * item.quantity), 0)::numeric AS revenue,
      coalesce(sum(item.quantity) FILTER (WHERE public._insight_is_procedure_item(
        item.service_id, item.item_id, item.package_id, item.item_name)), 0)::numeric AS procedures
    FROM resident_benchmark_visits AS visit
    LEFT JOIN public.consultation_items AS item ON item.consultation_id = visit.id AND item.deleted_at IS NULL
  )
  SELECT CASE
    WHEN v_role IN ('ops_staff', 'operations') THEN '[]'::jsonb
    WHEN v_role IN ('special_admin', 'doctor_admin')
      THEN coalesce((SELECT jsonb_agg(doctor_row ORDER BY doctor_row->>'doctor_name') FROM named_rows), '[]'::jsonb)
    WHEN v_role = 'resident_doctor' THEN
      coalesce((SELECT jsonb_agg(doctor_row ORDER BY doctor_row->>'doctor_name') FROM named_rows), '[]'::jsonb)
      || jsonb_build_array(jsonb_build_object(
        'doctor_id', null, 'doctor_name', 'Clinic benchmark',
        'completed_visits', (SELECT visits FROM resident_benchmark),
        'unique_patients', (SELECT patients FROM resident_benchmark),
        'rostered_hours', public._insight_rostered_hours(_start_date, _end_date, NULL)
          - public._insight_rostered_hours(_start_date, _end_date, v_resident_doctor),
        'patients_per_hour', CASE WHEN public._insight_rostered_hours(_start_date, _end_date, NULL)
          - public._insight_rostered_hours(_start_date, _end_date, v_resident_doctor) > 0
          THEN round((SELECT visits FROM resident_benchmark) /
            (public._insight_rostered_hours(_start_date, _end_date, NULL)
              - public._insight_rostered_hours(_start_date, _end_date, v_resident_doctor)), 2) END,
        'visit_billing', round((SELECT revenue FROM resident_benchmark), 2),
        'revenue_per_hour', CASE WHEN public._insight_rostered_hours(_start_date, _end_date, NULL)
          - public._insight_rostered_hours(_start_date, _end_date, v_resident_doctor) > 0
          THEN round((SELECT revenue FROM resident_benchmark) /
            (public._insight_rostered_hours(_start_date, _end_date, NULL)
              - public._insight_rostered_hours(_start_date, _end_date, v_resident_doctor)), 2) END,
        'procedures', (SELECT procedures FROM resident_benchmark),
        'documents', 0, 'missing_attribution', 0
      ))
    ELSE CASE WHEN (v_clinic->>'completed_visits')::integer > 0 THEN jsonb_build_array(jsonb_build_object(
      'doctor_id', null, 'doctor_name', 'Clinic benchmark',
      'completed_visits', (v_clinic->>'completed_visits')::integer,
      'unique_patients', (v_clinic->>'unique_patients')::integer,
      'rostered_hours', (v_clinic->>'rostered_hours')::numeric,
      'patients_per_hour', v_clinic->'patients_per_hour', 'visit_billing', (v_clinic->>'visit_billing')::numeric,
      'revenue_per_hour', v_clinic->'revenue_per_hour', 'procedures', (v_clinic->>'procedures')::numeric,
      'documents', (v_clinic->>'documents')::integer, 'missing_attribution', 0)) ELSE '[]'::jsonb END
  END INTO v_doctors;

  IF coalesce(_activity_type, 'all') = 'document' OR v_role = 'resident_doctor' THEN
    v_services := '[]'::jsonb;
  ELSE
    WITH periods AS (
      SELECT 'current'::text AS period, _start_date AS start_date, _end_date AS end_date
      UNION ALL SELECT 'previous', _start_date - ((_end_date - _start_date) + 1), _start_date - 1
    ), visits AS MATERIALIZED (
      SELECT period.period, consultation.id, consultation.patient_id, consultation.doctor_id,
        timezone('Asia/Kuala_Lumpur', queue_entry.created_at)::date AS visit_date,
        public._insight_payment_classification(queue_entry.id, queue_entry.payment_method) AS payment_type
      FROM periods AS period JOIN public.queue_entries AS queue_entry
        ON timezone('Asia/Kuala_Lumpur', queue_entry.created_at)::date BETWEEN period.start_date AND period.end_date
      JOIN public.consultations AS consultation ON consultation.queue_entry_id = queue_entry.id
      WHERE consultation.status = 'completed' AND consultation.deleted_at IS NULL
        AND queue_entry.clinic_status = 'completed' AND queue_entry.deleted_at IS NULL
        AND queue_entry.cancelled_at IS NULL AND queue_entry.visit_type <> 'payment_only'
        AND (_doctor_id IS NULL OR consultation.doctor_id = _doctor_id)
    ), procedure_items AS MATERIALIZED (
      SELECT visit.period, visit.patient_id, visit.doctor_id, item.quantity,
        item.price * item.quantity AS revenue,
        item.unit_cost * greatest(CASE WHEN item.item_id IS NOT NULL THEN least(coalesce(item.dispensed_qty, item.quantity), greatest(item.quantity, 0)) ELSE item.quantity END, 0) AS cogs,
        (item.item_id IS NOT NULL AND greatest(least(coalesce(item.dispensed_qty, item.quantity), greatest(item.quantity, 0)), 0) > 0 AND item.unit_cost <= 0) AS missing_cost,
        coalesce(item.service_id::text, item.item_id::text, item.package_id::text, legacy_service.id::text,
          'legacy-procedure:' || lower(btrim(item.item_name))) AS service_id,
        coalesce(service.name, inventory.name, package.name, legacy_service.name, item.item_name) AS service_name
      FROM visits AS visit JOIN public.consultation_items AS item ON item.consultation_id = visit.id AND item.deleted_at IS NULL
      LEFT JOIN public.services AS service ON service.id = item.service_id
      LEFT JOIN public.inventory_items AS inventory ON inventory.id = item.item_id
      LEFT JOIN public.packages AS package ON package.id = item.package_id
      LEFT JOIN LATERAL (SELECT candidate.id, candidate.name FROM public.services AS candidate
        WHERE lower(btrim(coalesce(candidate.category, ''))) = 'procedure'
          AND lower(btrim(candidate.name)) = lower(btrim(item.item_name)) ORDER BY candidate.id LIMIT 1) AS legacy_service ON true
      WHERE (coalesce(_payment_type, 'all') = 'all' OR visit.payment_type = _payment_type)
        AND public._insight_is_procedure_item(item.service_id, item.item_id, item.package_id, item.item_name)
    ), current_stats AS (
      SELECT service_id, max(service_name) AS service_name, sum(quantity)::numeric AS volume,
        count(DISTINCT patient_id)::integer AS patients, round(sum(revenue), 2) AS revenue,
        round(sum(cogs), 2) AS cogs, count(*) FILTER (WHERE missing_cost)::integer AS missing_cost,
        count(DISTINCT doctor_id) FILTER (WHERE doctor_id IS NOT NULL)::integer AS doctors
      FROM procedure_items WHERE period = 'current' GROUP BY service_id
    ), previous_stats AS (
      SELECT service_id, sum(quantity)::numeric AS volume FROM procedure_items WHERE period = 'previous' GROUP BY service_id
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object('service_id', current.service_id, 'service_name', current.service_name,
      'volume', current.volume, 'unique_patients', current.patients, 'revenue', current.revenue,
      'cogs', CASE WHEN current.missing_cost = 0 THEN current.cogs END,
      'profit', CASE WHEN current.missing_cost = 0 THEN current.revenue - current.cogs END,
      'margin_pct', CASE WHEN current.missing_cost = 0 AND current.revenue <> 0 THEN round((current.revenue-current.cogs)/current.revenue*100,2) END,
      'average_price', CASE WHEN current.volume > 0 THEN round(current.revenue/current.volume,2) END,
      'trend_pct', CASE WHEN coalesce(_include_comparison, true) AND previous.volume > 0 THEN round((current.volume-previous.volume)/previous.volume*100,2) END,
      'doctor_count', current.doctors, 'missing_cost_count', current.missing_cost)
      ORDER BY current.revenue DESC, current.service_name), '[]'::jsonb)
    INTO v_services FROM current_stats AS current LEFT JOIN previous_stats AS previous USING (service_id);
  END IF;

  -- Quality is a property of the filtered cohort, not of the unfiltered base
  -- report. Documents deliberately use issue date, so documents issued for an
  -- older visit and unattributed documents remain represented.
  WITH visit_cohort AS MATERIALIZED (
    SELECT consultation.id, consultation.doctor_id, consultation.patient_id, queue_entry.id AS queue_entry_id
    FROM public.consultations AS consultation
    JOIN public.queue_entries AS queue_entry ON queue_entry.id = consultation.queue_entry_id
    WHERE consultation.status = 'completed' AND consultation.deleted_at IS NULL
      AND queue_entry.clinic_status = 'completed' AND queue_entry.deleted_at IS NULL
      AND queue_entry.cancelled_at IS NULL AND queue_entry.visit_type <> 'payment_only'
      AND timezone('Asia/Kuala_Lumpur', queue_entry.created_at)::date BETWEEN _start_date AND _end_date
      AND (_doctor_id IS NULL OR consultation.doctor_id = _doctor_id)
      AND (v_role <> 'resident_doctor' OR consultation.doctor_id = v_resident_doctor)
      AND (coalesce(_payment_type, 'all') = 'all'
        OR public._insight_payment_classification(queue_entry.id, queue_entry.payment_method) = _payment_type)
      AND coalesce(_activity_type, 'all') <> 'document'
      AND (coalesce(_activity_type, 'all') <> 'procedure' OR EXISTS (
        SELECT 1 FROM public.consultation_items AS procedure_item
        WHERE procedure_item.consultation_id = consultation.id
          AND procedure_item.deleted_at IS NULL
          AND public._insight_is_procedure_item(
            procedure_item.service_id, procedure_item.item_id,
            procedure_item.package_id, procedure_item.item_name
          )
      ))
  ), issued_documents AS MATERIALIZED (
    SELECT document.id, consultation.id AS consultation_id,
      consultation.doctor_id, consultation.patient_id, queue_entry.id AS queue_entry_id
    FROM public.consultation_documents AS document
    JOIN public.consultations AS consultation ON consultation.id = document.consultation_id
    JOIN public.queue_entries AS queue_entry ON queue_entry.id = consultation.queue_entry_id
    WHERE lower(coalesce(document.type, '')) IN ('mc', 'quarantine', 'referral')
      AND timezone('Asia/Kuala_Lumpur', document.created_at)::date BETWEEN _start_date AND _end_date
      AND consultation.status = 'completed' AND consultation.deleted_at IS NULL
      AND queue_entry.clinic_status = 'completed' AND queue_entry.deleted_at IS NULL
      AND queue_entry.cancelled_at IS NULL
      AND (_doctor_id IS NULL OR consultation.doctor_id = _doctor_id)
      AND (v_role <> 'resident_doctor' OR consultation.doctor_id = v_resident_doctor)
      AND (coalesce(_payment_type, 'all') = 'all'
        OR public._insight_payment_classification(queue_entry.id, queue_entry.payment_method) = _payment_type)
      AND coalesce(_activity_type, 'all') IN ('all', 'document')
  ), relevant_items AS MATERIALIZED (
    SELECT item.item_id, item.unit_cost,
      greatest(CASE WHEN item.item_id IS NOT NULL
        THEN least(coalesce(item.dispensed_qty, item.quantity), greatest(item.quantity, 0))
        ELSE item.quantity END, 0)::numeric AS cost_quantity
    FROM visit_cohort AS visit
    JOIN public.consultation_items AS item ON item.consultation_id = visit.id AND item.deleted_at IS NULL
    WHERE coalesce(_activity_type, 'all') <> 'procedure'
      OR public._insight_is_procedure_item(item.service_id, item.item_id, item.package_id, item.item_name)
    UNION ALL
    SELECT item.item_id, item.unit_cost,
      greatest(CASE WHEN item.item_id IS NOT NULL
        THEN least(coalesce(item.dispensed_qty, item.quantity), greatest(item.quantity, 0))
        ELSE item.quantity END, 0)::numeric
    FROM issued_documents AS document
    JOIN public.consultation_items AS item ON item.source_document_id = document.id AND item.deleted_at IS NULL
    WHERE coalesce(_activity_type, 'all') = 'document'
  ), quality AS (
    SELECT
      (SELECT count(*)::integer FROM issued_documents WHERE doctor_id IS NULL) AS missing_attribution,
      (SELECT count(*) FILTER (WHERE item_id IS NOT NULL AND cost_quantity > 0 AND unit_cost <= 0)::integer
        FROM relevant_items) AS missing_cost,
      (SELECT count(DISTINCT payment.id)::integer
        FROM public.payments AS payment
        WHERE payment.deleted_at IS NOT NULL AND payment.queue_entry_id IN (
          SELECT queue_entry_id FROM visit_cohort UNION SELECT queue_entry_id FROM issued_documents
        )) AS excluded_voided,
      (SELECT count(*)::integer FROM issued_documents) AS document_count
  )
  SELECT
    jsonb_build_object('missing_attribution', quality.missing_attribution,
      'missing_cost_count', quality.missing_cost,
      'excluded_voided_payments', quality.excluded_voided),
    jsonb_build_object('state', CASE
        WHEN (v_clinic->>'completed_visits')::integer = 0 AND quality.document_count = 0 THEN 'insufficient'
        WHEN quality.missing_attribution > 0 OR quality.missing_cost > 0 THEN 'partial'
        ELSE 'reliable' END,
      'missing_attribution', quality.missing_attribution,
      'missing_cost_count', quality.missing_cost),
    v_clinic || jsonb_build_object('documents', quality.document_count)
  INTO v_quality, v_confidence, v_clinic
  FROM quality;

  RETURN v_result || jsonb_build_object(
    'clinic', v_clinic, 'doctors', v_doctors, 'services', v_services,
    'quality', v_quality, 'confidence', v_confidence,
    'filters', jsonb_build_object('doctor_id', _doctor_id,
      'payment_type', coalesce(_payment_type, 'all'),
      'activity_type', coalesce(_activity_type, 'all'),
      'include_comparison', coalesce(_include_comparison, true))
  );
END;
$function$;

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
BEGIN
  IF NOT public.can_view_insight_workspace() THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF _start_date IS NULL OR _end_date IS NULL OR _start_date > _end_date
     OR (_end_date - _start_date) > 364 OR nullif(btrim(_detail_id), '') IS NULL
     OR _detail_kind NOT IN ('doctor', 'service') THEN
    RAISE EXCEPTION 'INVALID_DETAIL_REQUEST' USING ERRCODE = '22023';
  END IF;
  IF coalesce(_payment_type, 'all') NOT IN ('all', 'self_pay', 'panel')
     OR coalesce(_activity_type, 'all') NOT IN ('all', 'consultation', 'procedure', 'document') THEN
    RAISE EXCEPTION 'INVALID_FILTER' USING ERRCODE = '22023';
  END IF;
  SELECT role_row.role::text INTO v_role FROM public.user_roles AS role_row
    WHERE role_row.user_id = (SELECT auth.uid()) LIMIT 1;
  SELECT doctor.id INTO v_resident_doctor FROM public.doctors AS doctor
    WHERE doctor.user_id = (SELECT auth.uid()) AND doctor.status = 'active'
    ORDER BY doctor.updated_at DESC, doctor.id LIMIT 1;

  IF _detail_kind = 'doctor' THEN
    BEGIN v_detail_doctor := _detail_id::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'INVALID_DOCTOR_ID' USING ERRCODE = '22023';
    END;
    IF v_role NOT IN ('special_admin', 'doctor_admin', 'resident_doctor')
      OR (_doctor_id IS NOT NULL AND _doctor_id <> v_detail_doctor)
      OR (v_role = 'resident_doctor' AND v_resident_doctor IS DISTINCT FROM v_detail_doctor) THEN
      RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
    END IF;

    WITH visits AS MATERIALIZED (
      SELECT consultation.*, timezone('Asia/Kuala_Lumpur', queue_entry.created_at)::date AS visit_date,
        CASE WHEN timezone('Asia/Kuala_Lumpur', coalesce(queue_entry.called_at, queue_entry.created_at))::time < time '12:00' THEN 'S1'
          WHEN timezone('Asia/Kuala_Lumpur', coalesce(queue_entry.called_at, queue_entry.created_at))::time < time '17:00' THEN 'S2'
          ELSE 'S3' END AS actual_shift,
        CASE WHEN queue_entry.called_at IS NOT NULL AND consultation.updated_at > queue_entry.called_at
          THEN extract(epoch FROM (consultation.updated_at - queue_entry.called_at)) / 60 END AS duration_minutes,
        public._insight_payment_classification(queue_entry.id, queue_entry.payment_method) AS payment_type
      FROM public.consultations AS consultation
      JOIN public.queue_entries AS queue_entry ON queue_entry.id = consultation.queue_entry_id
      WHERE consultation.doctor_id = v_detail_doctor AND consultation.status = 'completed'
        AND consultation.deleted_at IS NULL AND queue_entry.clinic_status = 'completed'
        AND queue_entry.deleted_at IS NULL AND queue_entry.cancelled_at IS NULL
        AND queue_entry.visit_type <> 'payment_only'
        AND timezone('Asia/Kuala_Lumpur', queue_entry.created_at)::date BETWEEN _start_date AND _end_date
        AND (coalesce(_payment_type, 'all') = 'all'
          OR public._insight_payment_classification(queue_entry.id, queue_entry.payment_method) = _payment_type)
        AND (coalesce(_activity_type, 'all') IN ('all', 'consultation')
          OR (_activity_type = 'procedure' AND EXISTS (SELECT 1 FROM public.consultation_items AS filter_item
            WHERE filter_item.consultation_id = consultation.id AND filter_item.deleted_at IS NULL
              AND public._insight_is_procedure_item(filter_item.service_id, filter_item.item_id, filter_item.package_id, filter_item.item_name)))
          OR (_activity_type = 'document' AND EXISTS (SELECT 1 FROM public.consultation_documents AS document
            WHERE document.consultation_id = consultation.id
              AND lower(coalesce(document.type, '')) IN ('mc', 'quarantine', 'referral'))))
    ), items AS MATERIALIZED (
      SELECT item.*, visit.patient_id, visit.visit_date,
        greatest(CASE WHEN item.item_id IS NOT NULL
          THEN least(coalesce(item.dispensed_qty, item.quantity), greatest(item.quantity, 0))
          ELSE item.quantity END, 0)::numeric AS cost_quantity
      FROM visits AS visit JOIN public.consultation_items AS item
        ON item.consultation_id = visit.id AND item.deleted_at IS NULL
    ), financial AS (
      SELECT coalesce(sum(price * quantity), 0)::numeric AS revenue,
        coalesce(sum(unit_cost * cost_quantity), 0)::numeric AS cogs,
        count(*) FILTER (WHERE item_id IS NOT NULL AND cost_quantity > 0 AND unit_cost <= 0)::integer AS missing_cost
      FROM items
    ), quality AS (
      SELECT count(*) FILTER (WHERE btrim(coalesce(case_note, '')) = '')::integer AS missing_notes,
        count(*) FILTER (WHERE diagnosis_id IS NULL AND btrim(coalesce(diagnosis_text, '')) = '')::integer AS missing_diagnosis,
        count(*) FILTER (WHERE btrim(coalesce(dispense_note, '')) = '')::integer AS missing_dispense,
        count(*) FILTER (WHERE entry_source = 'offline_transcription' AND returned_at IS NOT NULL)::integer AS returned_offline,
        count(*) FILTER (WHERE doctor_id IS NULL)::integer AS missing_attribution,
        (SELECT count(DISTINCT audit.consultation_id)::integer FROM public.completed_bill_correction_audit AS audit
          JOIN visits AS corrected ON corrected.id = audit.consultation_id) AS corrected
      FROM visits
    )
    SELECT jsonb_build_object(
      'kind', 'doctor', 'doctor_id', v_detail_doctor,
      'visits_by_shift', coalesce((SELECT jsonb_agg(jsonb_build_object('date', grouped.visit_date,
        'shift', grouped.actual_shift, 'visits', grouped.visits) ORDER BY grouped.visit_date, grouped.actual_shift)
        FROM (SELECT visit_date, actual_shift, count(*)::integer AS visits FROM visits GROUP BY 1,2) AS grouped), '[]'::jsonb),
      'average_visit_duration_minutes', (SELECT round(avg(duration_minutes), 1) FROM visits WHERE duration_minutes IS NOT NULL),
      'duration_measured_visits', (SELECT count(*) FROM visits WHERE duration_minutes IS NOT NULL),
      'payment_mix', coalesce((SELECT jsonb_agg(jsonb_build_object('payment_type', grouped.payment_type,
        'visits', grouped.visits) ORDER BY grouped.payment_type)
        FROM (SELECT payment_type, count(*)::integer AS visits FROM visits GROUP BY payment_type) AS grouped), '[]'::jsonb),
      'financial', jsonb_build_object('revenue', round(financial.revenue, 2),
        'cogs', CASE WHEN financial.missing_cost = 0 THEN round(financial.cogs, 2) END,
        'gross_profit', CASE WHEN financial.missing_cost = 0 THEN round(financial.revenue - financial.cogs, 2) END,
        'margin_pct', CASE WHEN financial.missing_cost = 0 AND financial.revenue <> 0
          THEN round((financial.revenue - financial.cogs) / financial.revenue * 100, 2) END,
        'revenue_per_visit', CASE WHEN (SELECT count(*) FROM visits) > 0
          THEN round(financial.revenue / (SELECT count(*) FROM visits), 2) END,
        'revenue_per_hour', (SELECT (doctor_row->>'revenue_per_hour')::numeric
          FROM jsonb_array_elements(public.get_insight_performance_filtered(
            _start_date, _end_date, v_detail_doctor, _payment_type, _activity_type, false
          )->'doctors') AS doctor_row WHERE doctor_row->>'doctor_id' = v_detail_doctor::text LIMIT 1),
        'missing_cost_count', financial.missing_cost),
      'quality', jsonb_build_object('missing_consultation_notes', quality.missing_notes,
        'missing_diagnosis', quality.missing_diagnosis, 'missing_dispense_note', quality.missing_dispense,
        'returned_offline_consultations', quality.returned_offline,
        'incomplete_doctor_attribution', quality.missing_attribution,
        'bills_corrected_after_completion', quality.corrected),
      'diagnoses', coalesce((SELECT jsonb_agg(jsonb_build_object('name', diagnosis.name, 'visits', diagnosis.visits))
        FROM (SELECT coalesce(nullif(btrim(visit.diagnosis_text), ''), diagnosis_row.name, 'Not recorded') AS name,
          count(*)::integer AS visits FROM visits AS visit LEFT JOIN public.diagnoses AS diagnosis_row
            ON diagnosis_row.id = visit.diagnosis_id GROUP BY 1) AS diagnosis), '[]'::jsonb),
      'procedures', coalesce((SELECT jsonb_agg(jsonb_build_object('name', grouped.item_name,
        'quantity', grouped.quantity, 'charged', grouped.charged,
        'cogs', CASE WHEN grouped.missing_cost = 0 THEN grouped.cogs END,
        'gross_profit', CASE WHEN grouped.missing_cost = 0 THEN grouped.charged - grouped.cogs END))
        FROM (SELECT item_name, sum(quantity)::numeric AS quantity, round(sum(price * quantity), 2) AS charged,
          round(sum(unit_cost * cost_quantity), 2) AS cogs,
          count(*) FILTER (WHERE item_id IS NOT NULL AND cost_quantity > 0 AND unit_cost <= 0)::integer AS missing_cost
          FROM items WHERE coalesce(_activity_type, 'all') <> 'document'
            AND public._insight_is_procedure_item(service_id, item_id, package_id, item_name)
          GROUP BY item_name) AS grouped), '[]'::jsonb),
      'medicines', coalesce((SELECT jsonb_agg(jsonb_build_object('name', grouped.item_name, 'quantity', grouped.quantity))
        FROM (SELECT item_name, sum(cost_quantity)::numeric AS quantity FROM items WHERE item_id IS NOT NULL GROUP BY item_name) AS grouped), '[]'::jsonb)
    ) INTO v_result FROM financial CROSS JOIN quality;
  ELSE
    IF v_role NOT IN ('special_admin', 'doctor_admin', 'admin', 'ops_staff', 'operations')
      OR v_role = 'resident_doctor' OR coalesce(_activity_type, 'all') = 'document' THEN
      RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
    END IF;
    WITH service_items AS MATERIALIZED (
      SELECT item.*, consultation.patient_id, consultation.doctor_id, queue_entry.id AS queue_entry_id,
        queue_entry.queue_sequence, timezone('Asia/Kuala_Lumpur', queue_entry.created_at)::date AS visit_date,
        public._insight_payment_classification(queue_entry.id, queue_entry.payment_method) AS payment_type,
        coalesce(service.name, inventory.name, package.name, legacy_service.name, item.item_name) AS service_name,
        coalesce(item.service_id::text, item.item_id::text, item.package_id::text,
          legacy_service.id::text, 'legacy-procedure:' || lower(btrim(item.item_name))) AS service_key,
        greatest(CASE WHEN item.item_id IS NOT NULL
          THEN least(coalesce(item.dispensed_qty, item.quantity), greatest(item.quantity, 0))
          ELSE item.quantity END, 0)::numeric AS cost_quantity,
        (item.item_id IS NOT NULL AND greatest(least(coalesce(item.dispensed_qty, item.quantity),
          greatest(item.quantity, 0)), 0) > 0 AND item.unit_cost <= 0) AS missing_cost
      FROM public.consultation_items AS item
      JOIN public.consultations AS consultation ON consultation.id = item.consultation_id
      JOIN public.queue_entries AS queue_entry ON queue_entry.id = consultation.queue_entry_id
      LEFT JOIN public.services AS service ON service.id = item.service_id
      LEFT JOIN public.inventory_items AS inventory ON inventory.id = item.item_id
      LEFT JOIN public.packages AS package ON package.id = item.package_id
      LEFT JOIN LATERAL (SELECT candidate.id, candidate.name FROM public.services AS candidate
        WHERE lower(btrim(coalesce(candidate.category, ''))) = 'procedure'
          AND lower(btrim(candidate.name)) = lower(btrim(item.item_name)) ORDER BY candidate.id LIMIT 1) AS legacy_service ON true
      WHERE item.deleted_at IS NULL AND consultation.deleted_at IS NULL
        AND consultation.status = 'completed' AND queue_entry.clinic_status = 'completed'
        AND queue_entry.deleted_at IS NULL AND queue_entry.cancelled_at IS NULL
        AND timezone('Asia/Kuala_Lumpur', queue_entry.created_at)::date BETWEEN _start_date AND _end_date
        AND (_doctor_id IS NULL OR consultation.doctor_id = _doctor_id)
        AND public._insight_is_procedure_item(item.service_id, item.item_id, item.package_id, item.item_name)
        AND coalesce(item.service_id::text, item.item_id::text, item.package_id::text,
          legacy_service.id::text, 'legacy-procedure:' || lower(btrim(item.item_name))) = _detail_id
        AND (coalesce(_payment_type, 'all') = 'all'
          OR public._insight_payment_classification(queue_entry.id, queue_entry.payment_method) = _payment_type)
    ), validated AS (
      SELECT count(*) AS item_count FROM service_items
    ), doctor_mix AS (
      SELECT item.doctor_id, coalesce(nullif(btrim(profile.full_name), ''), nullif(btrim(doctor.name), ''), 'Unknown doctor') AS doctor_name,
        sum(item.quantity)::numeric AS volume FROM service_items AS item JOIN public.doctors AS doctor ON doctor.id = item.doctor_id
      LEFT JOIN public.profiles AS profile ON profile.id = doctor.user_id GROUP BY item.doctor_id, profile.full_name, doctor.name
    )
    SELECT CASE WHEN validated.item_count = 0 THEN NULL ELSE jsonb_build_object(
      'kind', 'service', 'service_id', _detail_id, 'service_name', (SELECT max(service_name) FROM service_items),
      'trend', coalesce((SELECT jsonb_agg(jsonb_build_object('date', grouped.visit_date, 'volume', grouped.volume,
        'revenue', grouped.revenue) ORDER BY grouped.visit_date) FROM (SELECT visit_date, sum(quantity)::numeric AS volume,
          round(sum(price * quantity), 2) AS revenue FROM service_items GROUP BY visit_date) AS grouped), '[]'::jsonb),
      'doctor_contribution', CASE WHEN v_role IN ('special_admin', 'doctor_admin') THEN coalesce((SELECT jsonb_agg(
        jsonb_build_object('doctor_id', doctor_id, 'doctor_name', doctor_name, 'volume', volume)) FROM doctor_mix), '[]'::jsonb) ELSE '[]'::jsonb END,
      'payment_mix', coalesce((SELECT jsonb_agg(jsonb_build_object('payment_type', grouped.payment_type, 'visits', grouped.visits))
        FROM (SELECT payment_type, count(DISTINCT consultation_id)::integer AS visits FROM service_items GROUP BY payment_type) AS grouped), '[]'::jsonb),
      'visits', coalesce((SELECT jsonb_agg(jsonb_build_object('queue_entry_id', queue_entry_id,
        'queue_sequence', queue_sequence, 'visit_date', visit_date, 'payment_type', payment_type,
        'quantity', quantity, 'unit_price', price, 'total_price', price * quantity,
        'cogs', CASE WHEN missing_cost THEN NULL ELSE unit_cost * cost_quantity END,
        'gross_profit', CASE WHEN missing_cost THEN NULL ELSE price * quantity - unit_cost * cost_quantity END)
        ORDER BY visit_date DESC, queue_sequence DESC) FROM service_items), '[]'::jsonb),
      'current_catalog', coalesce((SELECT jsonb_build_object('price', catalog.price_to_patient,
        'cogs', catalog.cost,
        'gross_profit', catalog.price_to_patient - catalog.cost,
        'margin_pct', CASE WHEN catalog.price_to_patient <> 0
          THEN round((catalog.price_to_patient - catalog.cost) / catalog.price_to_patient * 100, 2) END)
        FROM public.services AS catalog WHERE catalog.id::text = _detail_id), 'null'::jsonb),
      'margin_history', coalesce((SELECT jsonb_agg(jsonb_build_object('date', grouped.visit_date,
        'average_price', grouped.average_price, 'average_cogs', CASE WHEN grouped.missing_cost = 0 THEN grouped.average_cogs END,
        'margin_pct', CASE WHEN grouped.missing_cost = 0 AND grouped.revenue <> 0
          THEN round((grouped.revenue - grouped.cogs) / grouped.revenue * 100, 2) END) ORDER BY grouped.visit_date)
        FROM (SELECT visit_date, round(sum(price * quantity) / nullif(sum(quantity), 0), 2) AS average_price,
          round(sum(unit_cost * cost_quantity) / nullif(sum(quantity), 0), 2) AS average_cogs,
          sum(price * quantity)::numeric AS revenue, sum(unit_cost * cost_quantity)::numeric AS cogs,
          count(*) FILTER (WHERE missing_cost)::integer AS missing_cost FROM service_items GROUP BY visit_date) AS grouped), '[]'::jsonb)
    ) END INTO v_result FROM validated;
    IF v_result IS NULL THEN
      RAISE EXCEPTION 'INVALID_PROCEDURE_SERVICE' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_insight_clinical_attendance_heatmap(
  _start_date date,
  _end_date date,
  _doctor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_range_days integer;
  v_comparison_start date;
  v_comparison_end date;
  v_result jsonb;
BEGIN
  IF NOT public.can_view_insight_workspace() THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  IF _start_date IS NULL
     OR _end_date IS NULL
     OR _start_date > _end_date
     OR (_end_date - _start_date) > 364 THEN
    RAISE EXCEPTION 'INVALID_DATE_RANGE' USING ERRCODE = '22023';
  END IF;

  v_range_days := (_end_date - _start_date) + 1;
  v_comparison_start := _start_date - v_range_days;
  v_comparison_end := _start_date - 1;

  WITH period_days AS MATERIALIZED (
    SELECT 'selected'::text AS period, day::date AS day
    FROM generate_series(_start_date, _end_date, interval '1 day') AS days(day)
    UNION ALL
    SELECT 'comparison'::text AS period, day::date AS day
    FROM generate_series(v_comparison_start, v_comparison_end, interval '1 day') AS days(day)
  ),
  current_rosters AS MATERIALIZED (
    SELECT DISTINCT ON (sr.year, sr.month)
      sr.year,
      sr.month,
      sr.roster_data
    FROM public.saved_rosters AS sr
    WHERE sr.roster_type = 'doctor'
    ORDER BY sr.year, sr.month, sr.updated_at DESC, sr.id DESC
  ),
  roster_assignments AS MATERIALIZED (
    SELECT
      pd.period,
      pd.day,
      shift_entry.key AS shift_key,
      NULLIF(btrim(assignment.value->>'staffId'), '') AS doctor_id,
      NULLIF(btrim(assignment.value->>'staffName'), '') AS roster_doctor_name,
      CASE
        WHEN shift_entry.key IN ('DOC_S1', 'shift1') THEN 8
        WHEN shift_entry.key IN ('DOC_S2', 'shift2') THEN 14
        WHEN shift_entry.key IN ('DOC_S3', 'shift3') THEN 20
      END AS start_hour,
      CASE
        WHEN shift_entry.key IN ('DOC_S1', 'shift1') THEN 13
        WHEN shift_entry.key IN ('DOC_S2', 'shift2') THEN 19
        WHEN shift_entry.key IN ('DOC_S3', 'shift3') THEN 24
      END AS end_hour
    FROM period_days AS pd
    JOIN current_rosters AS sr
      ON sr.month = extract(month FROM pd.day)::integer
      AND sr.year = extract(year FROM pd.day)::integer
    CROSS JOIN LATERAL jsonb_each(
      coalesce(sr.roster_data -> to_char(pd.day, 'YYYY-MM-DD'), '{}'::jsonb)
    ) AS shift_entry(key, value)
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE jsonb_typeof(shift_entry.value)
        WHEN 'array' THEN shift_entry.value
        WHEN 'object' THEN jsonb_build_array(shift_entry.value)
        ELSE '[]'::jsonb
      END
    ) AS assignment(value)
    WHERE shift_entry.key IN ('DOC_S1', 'shift1', 'DOC_S2', 'shift2', 'DOC_S3', 'shift3')
      AND NULLIF(btrim(assignment.value->>'staffId'), '') IS NOT NULL
      AND lower(coalesce(assignment.value->>'status', '')) NOT IN ('cancelled', 'canceled')
      AND lower(coalesce(assignment.value->>'cancelled', 'false')) <> 'true'
  ),
  roster_slots AS MATERIALIZED (
    SELECT
      ra.period,
      ra.day,
      hour.hour::integer AS hour,
      count(DISTINCT ra.doctor_id)::integer AS doctors_rostered,
      bool_or(true) AS any_doctor,
      bool_or(ra.doctor_id = _doctor_id::text) AS selected_doctor,
      bool_or(ra.doctor_id IS DISTINCT FROM _doctor_id::text) AS another_doctor
    FROM roster_assignments AS ra
    CROSS JOIN LATERAL generate_series(ra.start_hour, ra.end_hour - 1) AS hour(hour)
    GROUP BY ra.period, ra.day, hour.hour
  ),
  queue_candidates AS MATERIALIZED (
    SELECT
      pd.period,
      qe.id,
      qe.created_at,
      qe.called_at,
      local_time.local_created_at
    FROM public.queue_entries AS qe
    CROSS JOIN LATERAL (
      SELECT timezone('Asia/Kuala_Lumpur', qe.created_at) AS local_created_at
    ) AS local_time
    JOIN period_days AS pd ON pd.day = local_time.local_created_at::date
    WHERE qe.queue_number IS NOT NULL
      AND qe.created_at IS NOT NULL
      AND qe.deleted_at IS NULL
      AND qe.cancelled_at IS NULL
      AND qe.clinic_status::text <> 'cancelled'
      AND qe.visit_type::text <> 'payment_only'
      AND qe.created_at >= (v_comparison_start::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur')
      AND qe.created_at < ((_end_date + 1)::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur')
      AND extract(hour FROM local_time.local_created_at) BETWEEN 8 AND 23
  ),
  attendance_facts AS MATERIALIZED (
    SELECT
      qe.period,
      qe.local_created_at::date AS day,
      extract(isodow FROM qe.local_created_at)::integer AS weekday,
      extract(hour FROM qe.local_created_at)::integer AS hour,
      c.doctor_id::text AS doctor_id,
      coalesce(nullif(btrim(d.name), ''), 'Unknown doctor') AS doctor_name,
      CASE
        WHEN qe.called_at >= qe.created_at
          THEN extract(epoch FROM (qe.called_at - qe.created_at)) / 60.0
      END AS wait_minutes
    FROM queue_candidates AS qe
    JOIN public.consultations AS c
      ON c.queue_entry_id = qe.id
      AND c.deleted_at IS NULL
    LEFT JOIN public.doctors AS d ON d.id = c.doctor_id
    WHERE _doctor_id IS NULL OR c.doctor_id = _doctor_id
  ),
  attendance_daily AS MATERIALIZED (
    SELECT
      period,
      day,
      weekday,
      hour,
      count(*)::integer AS visits,
      coalesce(sum(wait_minutes) FILTER (WHERE wait_minutes IS NOT NULL), 0)::numeric AS wait_total_minutes,
      count(*) FILTER (WHERE wait_minutes IS NOT NULL)::integer AS wait_measured_visits
    FROM attendance_facts
    GROUP BY period, day, weekday, hour
  ),
  grid AS MATERIALIZED (
    SELECT
      pd.period,
      pd.day,
      extract(isodow FROM pd.day)::integer AS weekday,
      hour.hour::integer AS hour,
      CASE WHEN _doctor_id IS NULL
        THEN coalesce(rs.any_doctor, false)
        ELSE coalesce(rs.selected_doctor, false)
      END AS operating,
      coalesce(rs.doctors_rostered, 0)::integer AS doctors_rostered,
      coalesce(rs.selected_doctor, false) AS selected_doctor_scheduled,
      CASE WHEN _doctor_id IS NULL THEN false
        ELSE coalesce(rs.selected_doctor, false) AND coalesce(rs.another_doctor, false)
      END AS other_doctor_covered
    FROM period_days AS pd
    CROSS JOIN generate_series(8, 23) AS hour(hour)
    LEFT JOIN roster_slots AS rs
      ON rs.period = pd.period AND rs.day = pd.day AND rs.hour = hour.hour
  ),
  cell_daily AS MATERIALIZED (
    SELECT
      g.period,
      g.day,
      g.weekday,
      g.hour,
      g.operating,
      g.doctors_rostered,
      g.selected_doctor_scheduled,
      g.other_doctor_covered,
      coalesce(ad.visits, 0)::integer AS visits,
      coalesce(ad.wait_total_minutes, 0)::numeric AS wait_total_minutes,
      coalesce(ad.wait_measured_visits, 0)::integer AS wait_measured_visits
    FROM grid AS g
    LEFT JOIN attendance_daily AS ad
      ON ad.period = g.period
      AND ad.day = g.day
      AND ad.weekday = g.weekday
      AND ad.hour = g.hour
  ),
  weekday_hour_cells AS MATERIALIZED (
    SELECT weekday.weekday::integer AS weekday, hour.hour::integer AS hour
    FROM generate_series(1, 7) AS weekday(weekday)
    CROSS JOIN generate_series(8, 23) AS hour(hour)
  ),
  cell_stats AS MATERIALIZED (
    SELECT
      period.period,
      wh.weekday,
      wh.hour,
      coalesce(sum(cd.visits), 0)::integer AS raw_total_visits,
      coalesce(sum(cd.visits) FILTER (WHERE cd.operating), 0)::integer AS covered_total_visits,
      coalesce(sum(cd.visits) FILTER (WHERE NOT cd.operating), 0)::integer AS uncovered_visits,
      count(cd.day) FILTER (WHERE cd.operating)::integer AS operating_occurrences,
      percentile_disc(0.5) WITHIN GROUP (ORDER BY cd.visits)
        FILTER (WHERE cd.operating)::integer AS median_visits,
      max(cd.visits) FILTER (WHERE cd.operating)::integer AS peak_visits,
      coalesce(sum(cd.wait_total_minutes) FILTER (WHERE cd.operating), 0)::numeric AS wait_total_minutes,
      coalesce(sum(cd.wait_measured_visits) FILTER (WHERE cd.operating), 0)::integer AS wait_measured_visits,
      count(cd.day) FILTER (WHERE cd.other_doctor_covered)::integer AS other_doctor_covered_occurrences,
      coalesce(jsonb_agg(jsonb_build_object(
        'date', cd.day,
        'visits', cd.visits,
        'averageWaitMinutes', CASE WHEN cd.wait_measured_visits > 0
          THEN round(cd.wait_total_minutes / cd.wait_measured_visits, 1)
        END
      ) ORDER BY cd.day) FILTER (WHERE cd.operating), '[]'::jsonb) AS dates
    FROM (VALUES ('selected'::text), ('comparison'::text)) AS period(period)
    CROSS JOIN weekday_hour_cells AS wh
    LEFT JOIN cell_daily AS cd
      ON cd.period = period.period
      AND cd.weekday = wh.weekday
      AND cd.hour = wh.hour
    GROUP BY period.period, wh.weekday, wh.hour
  ),
  cells AS MATERIALIZED (
    SELECT
      selected.weekday,
      selected.hour,
      selected.covered_total_visits AS total_visits,
      selected.raw_total_visits,
      selected.operating_occurrences,
      CASE WHEN selected.operating_occurrences > 0
        THEN round(selected.covered_total_visits::numeric / selected.operating_occurrences, 2)
      END AS average_visits,
      selected.median_visits,
      selected.peak_visits,
      CASE WHEN selected.wait_measured_visits > 0
        THEN round(selected.wait_total_minutes / selected.wait_measured_visits, 1)
      END AS average_wait_minutes,
      selected.wait_measured_visits,
      CASE WHEN comparison.operating_occurrences > 0
        THEN round(comparison.covered_total_visits::numeric / comparison.operating_occurrences, 2)
      END AS comparison_average_visits,
      selected.other_doctor_covered_occurrences,
      selected.dates,
      CASE
        WHEN selected.operating_occurrences = 0 THEN 'uncovered'
        WHEN selected.uncovered_visits > 0 THEN 'insufficient'
        WHEN selected.operating_occurrences < 8 THEN 'insufficient'
        ELSE 'complete'
      END AS coverage
    FROM cell_stats AS selected
    JOIN cell_stats AS comparison
      ON comparison.period = 'comparison'
      AND comparison.weekday = selected.weekday
      AND comparison.hour = selected.hour
    WHERE selected.period = 'selected'
  ),
  observation_weeks AS MATERIALIZED (
    SELECT date_trunc('week', cd.day)::date AS week_start
    FROM cell_daily AS cd
    WHERE cd.period = 'selected'
      AND cd.operating
    GROUP BY date_trunc('week', cd.day)::date
    ORDER BY week_start DESC
    LIMIT 52
  ),
  observations AS MATERIALIZED (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'date', cd.day,
      'weekday', cd.weekday,
      'hour', cd.hour,
      'visits', cd.visits,
      'averageWaitMinutes', CASE WHEN cd.wait_measured_visits > 0
        THEN round(cd.wait_total_minutes / cd.wait_measured_visits, 1) END,
      'waitMeasuredVisits', cd.wait_measured_visits,
      'doctorsRostered', cd.doctors_rostered,
      'selectedDoctorScheduled', cd.selected_doctor_scheduled,
      'backupDoctorCovered', cd.other_doctor_covered
    ) ORDER BY cd.day, cd.hour) FILTER (WHERE cd.period = 'selected' AND cd.operating), '[]'::jsonb) AS rows
    FROM cell_daily AS cd
    JOIN observation_weeks AS ow
      ON ow.week_start = date_trunc('week', cd.day)::date
  ),
  doctor_directory AS MATERIALIZED (
    SELECT doctor_id, max(doctor_name) AS doctor_name
    FROM (
      SELECT ra.doctor_id, coalesce(ra.roster_doctor_name, d.name, 'Unknown doctor') AS doctor_name
      FROM roster_assignments AS ra
      LEFT JOIN public.doctors AS d ON d.id::text = ra.doctor_id
      UNION ALL
      SELECT doctor_id, doctor_name FROM attendance_facts
    ) AS doctors
    GROUP BY doctor_id
  ),
  warnings AS MATERIALIZED (
    SELECT array_remove(ARRAY[
      CASE WHEN EXISTS (
        SELECT 1 FROM cell_daily
        WHERE period = 'selected' AND visits > 0 AND NOT operating
      ) THEN 'Roster gaps leave one or more attendance cells uncovered.' END,
      CASE WHEN EXISTS (
        SELECT 1 FROM cells WHERE coverage = 'insufficient'
      ) THEN 'Some roster-backed cells have incomplete coverage or fewer than eight operating occurrences.' END,
      CASE WHEN NOT EXISTS (
        SELECT 1 FROM roster_assignments WHERE period = 'selected'
      ) THEN 'No non-cancelled doctor roster assignments were found for the selected period.' END
    ]::text[], NULL) AS rows
  )
  SELECT jsonb_build_object(
    'period', jsonb_build_object(
      'startDate', _start_date,
      'endDate', _end_date,
      'comparisonStartDate', v_comparison_start,
      'comparisonEndDate', v_comparison_end,
      'timezone', 'Asia/Kuala_Lumpur'
    ),
    'cells', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'weekday', weekday,
        'hour', hour,
        'totalVisits', total_visits,
        'rawTotalVisits', raw_total_visits,
        'operatingOccurrences', operating_occurrences,
        'averageVisits', average_visits,
        'medianVisits', median_visits,
        'peakVisits', peak_visits,
        'averageWaitMinutes', average_wait_minutes,
        'waitMeasuredVisits', wait_measured_visits,
        'comparisonAverageVisits', comparison_average_visits,
        'otherDoctorCoveredOccurrences', other_doctor_covered_occurrences,
        'dates', dates,
        'coverage', coverage
      ) ORDER BY weekday, hour)
      FROM cells
    ), '[]'::jsonb),
    'observations', coalesce((SELECT rows FROM observations), '[]'::jsonb),
    'doctors', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', doctor_id, 'name', doctor_name)
        ORDER BY doctor_name, doctor_id)
      FROM doctor_directory
    ), '[]'::jsonb),
    'warnings', coalesce((SELECT to_jsonb(rows) FROM warnings), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

ALTER FUNCTION public.get_insight_clinical_attendance_heatmap(date, date, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_insight_clinical_attendance_heatmap(date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_insight_clinical_attendance_heatmap(date, date, uuid) TO authenticated;

-- Management keeps its original permission domain and endpoint.
REVOKE ALL ON FUNCTION public.get_clinical_attendance_heatmap(date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_clinical_attendance_heatmap(date, date, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_insight_performance(
  _start_date date,
  _end_date date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_caller_id uuid := auth.uid();
  v_caller_role text;
  v_caller_doctor_id uuid;
  v_range_days integer;
  v_previous_start date;
  v_previous_end date;
  v_result jsonb;
BEGIN
  SELECT role_row.role::text
  INTO v_caller_role
  FROM public.user_roles AS role_row
  JOIN public.profiles AS profile ON profile.id = role_row.user_id
  WHERE role_row.user_id = v_caller_id
  LIMIT 1;

  IF v_caller_id IS NULL
     OR v_caller_role IS NULL
     OR v_caller_role NOT IN (
       'special_admin', 'admin', 'doctor_admin', 'resident_doctor',
       'ops_staff', 'operations'
     )
     OR NOT public.has_clinic_permission('reports.view', v_caller_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  SELECT doctor.id
  INTO v_caller_doctor_id
  FROM public.profiles AS profile
  JOIN public.doctors AS doctor ON doctor.user_id = profile.id
  WHERE profile.id = v_caller_id
    AND doctor.status = 'active'
  ORDER BY doctor.updated_at DESC, doctor.id
  LIMIT 1;

  IF v_caller_role = 'resident_doctor' AND v_caller_doctor_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  IF _start_date IS NULL OR _end_date IS NULL THEN
    RAISE EXCEPTION 'INSIGHT_PERFORMANCE_DATES_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF _start_date > _end_date THEN
    RAISE EXCEPTION 'INSIGHT_PERFORMANCE_DATE_RANGE_REVERSED' USING ERRCODE = '22023';
  END IF;
  IF (_end_date - _start_date) > 364 THEN
    RAISE EXCEPTION 'INSIGHT_PERFORMANCE_DATE_RANGE_TOO_LARGE' USING ERRCODE = '22023';
  END IF;

  v_range_days := (_end_date - _start_date) + 1;
  v_previous_start := _start_date - v_range_days;
  v_previous_end := _start_date - 1;

  WITH
  selected_visits AS MATERIALIZED (
    SELECT
      consultation.id AS consultation_id,
      consultation.queue_entry_id,
      consultation.patient_id,
      consultation.doctor_id,
      queue_entry.created_at,
      timezone('Asia/Kuala_Lumpur', queue_entry.created_at)::date AS visit_date,
      public._insight_payment_classification(
        queue_entry.id, queue_entry.payment_method
      ) AS payment_type
    FROM public.consultations AS consultation
    JOIN public.queue_entries AS queue_entry
      ON queue_entry.id = consultation.queue_entry_id
    WHERE consultation.status = 'completed'
      AND consultation.deleted_at IS NULL
      AND queue_entry.deleted_at IS NULL
      AND queue_entry.cancelled_at IS NULL
      AND queue_entry.clinic_status = 'completed'
      AND queue_entry.visit_type <> 'payment_only'
      AND timezone('Asia/Kuala_Lumpur', queue_entry.created_at)::date
        BETWEEN _start_date AND _end_date
  ),
  previous_visits AS MATERIALIZED (
    SELECT
      consultation.id AS consultation_id,
      consultation.patient_id,
      consultation.doctor_id
    FROM public.consultations AS consultation
    JOIN public.queue_entries AS queue_entry
      ON queue_entry.id = consultation.queue_entry_id
    WHERE consultation.status = 'completed'
      AND consultation.deleted_at IS NULL
      AND queue_entry.deleted_at IS NULL
      AND queue_entry.cancelled_at IS NULL
      AND queue_entry.clinic_status = 'completed'
      AND queue_entry.visit_type <> 'payment_only'
      AND timezone('Asia/Kuala_Lumpur', queue_entry.created_at)::date
        BETWEEN v_previous_start AND v_previous_end
  ),
  active_items AS MATERIALIZED (
    SELECT
      visit.consultation_id,
      visit.patient_id,
      visit.doctor_id,
      item.id AS item_id,
      item.service_id,
      item.item_id AS inventory_item_id,
      item.package_id,
      item.item_name,
      item.quantity::numeric AS quantity,
      item.dispensed_qty::numeric AS dispensed_qty,
      item.price::numeric AS price,
      item.unit_cost::numeric AS unit_cost,
      round(item.price * item.quantity, 2) AS revenue,
      CASE WHEN item.item_id IS NOT NULL THEN greatest(
        least(coalesce(item.dispensed_qty, item.quantity), greatest(item.quantity, 0)),
        0
      ) ELSE greatest(item.quantity, 0) END::numeric AS cost_quantity,
      round(item.unit_cost * CASE WHEN item.item_id IS NOT NULL THEN greatest(
        least(coalesce(item.dispensed_qty, item.quantity), greatest(item.quantity, 0)),
        0
      ) ELSE greatest(item.quantity, 0) END, 2) AS cogs,
      service.name AS configured_service_name,
      service.category AS service_category,
      inventory_item.category AS inventory_category,
      package.name AS package_name,
      legacy_service.id AS legacy_service_id,
      legacy_service.name AS legacy_service_name
    FROM selected_visits AS visit
    JOIN public.consultation_items AS item
      ON item.consultation_id = visit.consultation_id
    LEFT JOIN public.services AS service ON service.id = item.service_id
    LEFT JOIN public.inventory_items AS inventory_item ON inventory_item.id = item.item_id
    LEFT JOIN public.packages AS package ON package.id = item.package_id
    LEFT JOIN LATERAL (
      SELECT candidate.id, candidate.name
      FROM public.services AS candidate
      WHERE lower(trim(candidate.category)) = 'procedure'
        AND lower(trim(candidate.name)) = lower(trim(item.item_name))
      ORDER BY candidate.id
      LIMIT 1
    ) AS legacy_service ON item.service_id IS NULL AND item.item_id IS NULL AND item.package_id IS NULL
    WHERE item.deleted_at IS NULL
  ),
  previous_active_items AS MATERIALIZED (
    SELECT
      visit.consultation_id,
      visit.patient_id,
      visit.doctor_id,
      item.service_id,
      item.item_id AS inventory_item_id,
      item.package_id,
      item.item_name,
      item.quantity::numeric AS quantity,
      item.price::numeric AS price,
      service.name AS configured_service_name,
      service.category AS service_category,
      inventory_item.category AS inventory_category,
      package.name AS package_name,
      legacy_service.id AS legacy_service_id,
      legacy_service.name AS legacy_service_name
    FROM previous_visits AS visit
    JOIN public.consultation_items AS item
      ON item.consultation_id = visit.consultation_id
    LEFT JOIN public.services AS service ON service.id = item.service_id
    LEFT JOIN public.inventory_items AS inventory_item ON inventory_item.id = item.item_id
    LEFT JOIN public.packages AS package ON package.id = item.package_id
    LEFT JOIN LATERAL (
      SELECT candidate.id, candidate.name
      FROM public.services AS candidate
      WHERE lower(trim(candidate.category)) = 'procedure'
        AND lower(trim(candidate.name)) = lower(trim(item.item_name))
      ORDER BY candidate.id
      LIMIT 1
    ) AS legacy_service ON item.service_id IS NULL AND item.item_id IS NULL AND item.package_id IS NULL
    WHERE item.deleted_at IS NULL
  ),
  active_payments AS MATERIALIZED (
    SELECT
      payment.queue_entry_id,
      round(sum(payment.amount), 2) AS patient_collected
    FROM public.payments AS payment
    JOIN selected_visits AS visit ON visit.queue_entry_id = payment.queue_entry_id
    WHERE payment.deleted_at IS NULL
      AND lower(btrim(payment.payment_method)) <> 'panel'
    GROUP BY payment.queue_entry_id
  ),
  visit_item_totals AS MATERIALIZED (
    SELECT
      visit.consultation_id,
      coalesce(sum(item.revenue), 0)::numeric AS visit_billing,
      coalesce(sum(item.cogs), 0)::numeric AS known_cogs,
      count(item.item_id) FILTER (
        WHERE item.inventory_item_id IS NOT NULL
          AND item.cost_quantity > 0
          AND item.unit_cost <= 0
      )::integer
        AS missing_cost_count,
      coalesce(sum(item.quantity) FILTER (
        WHERE public._insight_is_procedure_item(
          item.service_id, item.inventory_item_id, item.package_id, item.item_name
        )
      ), 0)::numeric AS procedures
    FROM selected_visits AS visit
    LEFT JOIN active_items AS item ON item.consultation_id = visit.consultation_id
    GROUP BY visit.consultation_id
  ),
  issued_documents AS MATERIALIZED (
    SELECT
      document.id,
      consultation.doctor_id
    FROM public.consultation_documents AS document
    JOIN public.consultations AS consultation
      ON consultation.id = document.consultation_id
    JOIN public.queue_entries AS queue_entry
      ON queue_entry.id = consultation.queue_entry_id
    WHERE lower(coalesce(document.type, '')) IN ('mc', 'quarantine', 'referral')
      AND timezone('Asia/Kuala_Lumpur', document.created_at)::date
        BETWEEN _start_date AND _end_date
      AND consultation.status = 'completed'
      AND consultation.deleted_at IS NULL
      AND queue_entry.clinic_status = 'completed'
      AND queue_entry.deleted_at IS NULL
      AND queue_entry.cancelled_at IS NULL
      AND queue_entry.visit_type <> 'payment_only'
  ),
  document_totals AS MATERIALIZED (
    SELECT doctor_id, count(*)::integer AS documents
    FROM issued_documents
    WHERE doctor_id IS NOT NULL
    GROUP BY doctor_id
  ),
  current_rosters AS MATERIALIZED (
    SELECT DISTINCT ON (saved_roster.year, saved_roster.month)
      saved_roster.year,
      saved_roster.month,
      saved_roster.roster_data
    FROM public.saved_rosters AS saved_roster
    WHERE saved_roster.roster_type = 'doctor'
    ORDER BY saved_roster.year, saved_roster.month,
      saved_roster.updated_at DESC, saved_roster.id DESC
  ),
  roster_assignments AS MATERIALIZED (
    SELECT DISTINCT
      roster_day.key::date AS roster_date,
      shift_entry.key AS shift_key,
      assignment.value->>'staffId' AS doctor_id_text,
      CASE
        WHEN shift_entry.key IN ('DOC_S1', 'shift1') THEN 5
        WHEN shift_entry.key IN ('DOC_S2', 'shift2') THEN 5
        WHEN shift_entry.key IN ('DOC_S3', 'shift3') THEN 4
      END::numeric AS rostered_hours
    FROM current_rosters AS saved_roster
    CROSS JOIN LATERAL jsonb_each(coalesce(saved_roster.roster_data, '{}'::jsonb))
      AS roster_day(key, value)
    CROSS JOIN LATERAL jsonb_each(
      CASE WHEN jsonb_typeof(roster_day.value) = 'object'
        THEN roster_day.value ELSE '{}'::jsonb END
    ) AS shift_entry(key, value)
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE jsonb_typeof(shift_entry.value)
        WHEN 'array' THEN shift_entry.value
        WHEN 'object' THEN jsonb_build_array(shift_entry.value)
        ELSE '[]'::jsonb
      END
    ) AS assignment(value)
    WHERE roster_day.key ~ '^\d{4}-\d{2}-\d{2}$'
      AND roster_day.key::date BETWEEN _start_date AND _end_date
      AND shift_entry.key IN (
        'DOC_S1', 'shift1', 'DOC_S2', 'shift2', 'DOC_S3', 'shift3'
      )
      AND coalesce(assignment.value->>'staffId', '')
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND lower(coalesce(assignment.value->>'status', ''))
        NOT IN ('cancelled', 'canceled')
      AND lower(coalesce(assignment.value->>'cancelled', 'false')) <> 'true'
  ),
  roster_hours AS MATERIALIZED (
    SELECT
      doctor_id_text::uuid AS doctor_id,
      sum(rostered_hours)::numeric AS rostered_hours
    FROM roster_assignments
    GROUP BY doctor_id_text::uuid
  ),
  doctor_visit_stats AS MATERIALIZED (
    SELECT
      visit.doctor_id,
      count(*)::integer AS completed_visits,
      count(DISTINCT visit.patient_id)::integer AS unique_patients,
      coalesce(sum(item_total.visit_billing), 0)::numeric AS visit_billing,
      coalesce(sum(item_total.procedures), 0)::numeric AS procedures
    FROM selected_visits AS visit
    JOIN visit_item_totals AS item_total
      ON item_total.consultation_id = visit.consultation_id
    WHERE visit.doctor_id IS NOT NULL
    GROUP BY visit.doctor_id
  ),
  doctor_keys AS MATERIALIZED (
    SELECT doctor_id FROM doctor_visit_stats
    UNION
    SELECT doctor_id FROM roster_hours
    UNION
    SELECT doctor_id FROM document_totals
  ),
  doctor_rows AS MATERIALIZED (
    SELECT
      doctor_key.doctor_id,
      coalesce(nullif(btrim(profile.full_name), ''), nullif(btrim(doctor.name), ''), 'Unknown doctor')
        AS doctor_name,
      coalesce(visit_stats.completed_visits, 0)::integer AS completed_visits,
      coalesce(visit_stats.unique_patients, 0)::integer AS unique_patients,
      coalesce(roster.rostered_hours, 0)::numeric AS rostered_hours,
      CASE WHEN coalesce(roster.rostered_hours, 0) > 0
        THEN round(coalesce(visit_stats.completed_visits, 0)::numeric / roster.rostered_hours, 2)
      END AS patients_per_hour,
      round(coalesce(visit_stats.visit_billing, 0), 2) AS visit_billing,
      CASE WHEN coalesce(roster.rostered_hours, 0) > 0
        THEN round(coalesce(visit_stats.visit_billing, 0) / roster.rostered_hours, 2)
      END AS revenue_per_hour,
      coalesce(visit_stats.procedures, 0)::numeric AS procedures,
      coalesce(document_total.documents, 0)::integer AS documents,
      0::integer AS missing_attribution
    FROM doctor_keys AS doctor_key
    JOIN public.doctors AS doctor ON doctor.id = doctor_key.doctor_id
    LEFT JOIN public.profiles AS profile ON profile.id = doctor.user_id
    LEFT JOIN doctor_visit_stats AS visit_stats ON visit_stats.doctor_id = doctor_key.doctor_id
    LEFT JOIN roster_hours AS roster ON roster.doctor_id = doctor_key.doctor_id
    LEFT JOIN document_totals AS document_total ON document_total.doctor_id = doctor_key.doctor_id
  ),
  clinic_stats AS MATERIALIZED (
    SELECT
      count(*)::integer AS completed_visits,
      count(DISTINCT visit.patient_id)::integer AS unique_patients,
      (
        count(*) FILTER (WHERE visit.doctor_id IS NULL)
        + (SELECT count(*) FROM issued_documents WHERE doctor_id IS NULL)
      )::integer AS missing_attribution,
      coalesce(sum(item_total.visit_billing), 0)::numeric AS visit_billing,
      coalesce(sum(item_total.known_cogs), 0)::numeric AS known_cogs,
      coalesce(sum(item_total.missing_cost_count), 0)::integer AS missing_cost_count,
      coalesce(sum(item_total.procedures), 0)::numeric AS procedures,
      (SELECT count(*)::integer FROM issued_documents) AS documents,
      count(*) FILTER (WHERE visit.payment_type = 'self_pay')::integer AS self_pay_visits,
      count(*) FILTER (WHERE visit.payment_type = 'panel')::integer AS panel_visits,
      coalesce(sum(payment.patient_collected), 0)::numeric AS patient_collected
    FROM selected_visits AS visit
    JOIN visit_item_totals AS item_total
      ON item_total.consultation_id = visit.consultation_id
    LEFT JOIN active_payments AS payment ON payment.queue_entry_id = visit.queue_entry_id
  ),
  service_items AS MATERIALIZED (
    SELECT
      coalesce(
        item.service_id::text,
        item.inventory_item_id::text,
        item.package_id::text,
        item.legacy_service_id::text,
        'legacy-procedure:' || lower(trim(item.item_name))
      ) AS service_id,
      coalesce(
        nullif(btrim(item.configured_service_name), ''),
        nullif(btrim(item.legacy_service_name), ''),
        nullif(btrim(item.package_name), ''),
        nullif(btrim(item.item_name), ''),
        'Unknown service'
      ) AS service_name,
      item.consultation_id,
      item.patient_id,
      item.doctor_id,
      item.quantity,
      item.revenue,
      item.cogs,
      item.unit_cost,
      item.inventory_item_id,
      item.cost_quantity
    FROM active_items AS item
    WHERE public._insight_is_procedure_item(
          item.service_id, item.inventory_item_id, item.package_id, item.item_name
        )
  ),
  previous_service_items AS MATERIALIZED (
    SELECT
      coalesce(
        item.service_id::text,
        item.inventory_item_id::text,
        item.package_id::text,
        item.legacy_service_id::text,
        'legacy-procedure:' || lower(trim(item.item_name))
      ) AS service_id,
      coalesce(
        nullif(btrim(item.configured_service_name), ''),
        nullif(btrim(item.legacy_service_name), ''),
        nullif(btrim(item.package_name), ''),
        nullif(btrim(item.item_name), ''),
        'Unknown service'
      ) AS service_name,
      item.quantity
    FROM previous_active_items AS item
    WHERE public._insight_is_procedure_item(
          item.service_id, item.inventory_item_id, item.package_id, item.item_name
        )
  ),
  previous_service_stats AS MATERIALIZED (
    SELECT
      service_id,
      sum(quantity)::numeric AS volume
    FROM previous_service_items
    WHERE service_id IS NOT NULL
    GROUP BY service_id
  ),
  service_stats AS MATERIALIZED (
    SELECT
      service.service_id,
      max(service.service_name) AS service_name,
      sum(service.quantity)::numeric AS volume,
      count(DISTINCT service.patient_id)::integer AS unique_patients,
      round(sum(service.revenue), 2) AS revenue,
      round(sum(service.cogs), 2) AS known_cogs,
      count(*) FILTER (
        WHERE service.inventory_item_id IS NOT NULL
          AND service.cost_quantity > 0
          AND service.unit_cost <= 0
      )::integer
        AS missing_cost_count,
      count(DISTINCT service.doctor_id) FILTER (WHERE service.doctor_id IS NOT NULL)::integer
        AS doctor_count
    FROM service_items AS service
    WHERE service.service_id IS NOT NULL
    GROUP BY service.service_id
  ),
  service_rows AS MATERIALIZED (
    SELECT
      service.service_id,
      service.service_name,
      service.volume,
      service.unique_patients,
      service.revenue,
      CASE WHEN service.missing_cost_count = 0 THEN service.known_cogs END AS cogs,
      CASE WHEN service.missing_cost_count = 0
        THEN round(service.revenue - service.known_cogs, 2)
      END AS profit,
      CASE WHEN service.missing_cost_count = 0 AND service.revenue <> 0
        THEN round((service.revenue - service.known_cogs) / service.revenue * 100, 2)
      END AS margin_pct,
      CASE WHEN service.volume > 0
        THEN round(service.revenue / service.volume, 2)
      END AS average_price,
      CASE WHEN coalesce(previous.volume, 0) > 0
        THEN round((service.volume - previous.volume) / previous.volume * 100, 2)
      END AS trend_pct,
      service.doctor_count,
      service.missing_cost_count
    FROM service_stats AS service
    LEFT JOIN previous_service_stats AS previous ON previous.service_id = service.service_id
  ),
  doctor_json AS MATERIALIZED (
    SELECT CASE
      WHEN v_caller_role IN ('ops_staff', 'operations') THEN '[]'::jsonb
      WHEN v_caller_role IN ('special_admin', 'doctor_admin') THEN coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'doctor_id', row.doctor_id,
          'doctor_name', row.doctor_name,
          'completed_visits', row.completed_visits,
          'unique_patients', row.unique_patients,
          'rostered_hours', round(row.rostered_hours, 2),
          'patients_per_hour', row.patients_per_hour,
          'visit_billing', row.visit_billing,
          'revenue_per_hour', row.revenue_per_hour,
          'procedures', row.procedures,
          'documents', row.documents,
          'missing_attribution', row.missing_attribution
        ) ORDER BY row.completed_visits DESC, row.doctor_name, row.doctor_id)
        FROM doctor_rows AS row
      ), '[]'::jsonb)
      ELSE coalesce((
        SELECT jsonb_agg(visible.row ORDER BY visible.sort_order)
        FROM (
          SELECT 0 AS sort_order, jsonb_build_object(
            'doctor_id', own.doctor_id,
            'doctor_name', own.doctor_name,
            'completed_visits', own.completed_visits,
            'unique_patients', own.unique_patients,
            'rostered_hours', round(own.rostered_hours, 2),
            'patients_per_hour', own.patients_per_hour,
            'visit_billing', own.visit_billing,
            'revenue_per_hour', own.revenue_per_hour,
            'procedures', own.procedures,
            'documents', own.documents,
            'missing_attribution', own.missing_attribution
          ) AS row
          FROM doctor_rows AS own
          WHERE v_caller_role = 'resident_doctor'
            AND own.doctor_id = v_caller_doctor_id
          UNION ALL
          SELECT 1 AS sort_order, jsonb_build_object(
            'doctor_id', NULL,
            'doctor_name', 'Clinic benchmark',
            'completed_visits', clinic.completed_visits,
            'unique_patients', clinic.unique_patients,
            'rostered_hours', round(coalesce((SELECT sum(rostered_hours) FROM roster_hours), 0), 2),
            'patients_per_hour', CASE
              WHEN coalesce((SELECT sum(rostered_hours) FROM roster_hours), 0) > 0
                THEN round(clinic.completed_visits::numeric /
                  (SELECT sum(rostered_hours) FROM roster_hours), 2)
            END,
            'visit_billing', round(clinic.visit_billing, 2),
            'revenue_per_hour', CASE
              WHEN coalesce((SELECT sum(rostered_hours) FROM roster_hours), 0) > 0
                THEN round(clinic.visit_billing /
                  (SELECT sum(rostered_hours) FROM roster_hours), 2)
            END,
            'procedures', clinic.procedures,
            'documents', clinic.documents,
            'missing_attribution', clinic.missing_attribution
          ) AS row
          FROM clinic_stats AS clinic
        ) AS visible
      ), '[]'::jsonb)
    END AS rows
  ),
  service_json AS MATERIALIZED (
    SELECT CASE WHEN v_caller_role = 'resident_doctor' THEN '[]'::jsonb ELSE coalesce(jsonb_agg(jsonb_build_object(
      'service_id', row.service_id,
      'service_name', row.service_name,
      'volume', row.volume,
      'unique_patients', row.unique_patients,
      'revenue', row.revenue,
      'cogs', row.cogs,
      'profit', row.profit,
      'margin_pct', row.margin_pct,
      'average_price', row.average_price,
      'trend_pct', row.trend_pct,
      'doctor_count', row.doctor_count,
      'missing_cost_count', row.missing_cost_count
    ) ORDER BY row.revenue DESC, row.service_name, row.service_id), '[]'::jsonb) END AS rows
    FROM service_rows AS row
  )
  SELECT jsonb_build_object(
    'clinic', jsonb_build_object(
      'completed_visits', clinic.completed_visits,
      'unique_patients', clinic.unique_patients,
      'rostered_hours', round(coalesce((SELECT sum(rostered_hours) FROM roster_hours), 0), 2),
      'patients_per_hour', CASE
        WHEN coalesce((SELECT sum(rostered_hours) FROM roster_hours), 0) > 0
          THEN round(clinic.completed_visits::numeric /
            (SELECT sum(rostered_hours) FROM roster_hours), 2)
      END,
      'visit_billing', round(clinic.visit_billing, 2),
      'patient_collected', round(clinic.patient_collected, 2),
      'revenue_per_hour', CASE
        WHEN coalesce((SELECT sum(rostered_hours) FROM roster_hours), 0) > 0
          THEN round(clinic.visit_billing /
            (SELECT sum(rostered_hours) FROM roster_hours), 2)
      END,
      'cogs', CASE WHEN clinic.missing_cost_count = 0 THEN round(clinic.known_cogs, 2) END,
      'gross_profit', CASE WHEN clinic.missing_cost_count = 0
        THEN round(clinic.visit_billing - clinic.known_cogs, 2) END,
      'procedures', clinic.procedures,
      'documents', clinic.documents,
      'self_pay_visits', clinic.self_pay_visits,
      'panel_visits', clinic.panel_visits
    ),
    'doctors', doctor_json.rows,
    'services', service_json.rows,
    'quality', jsonb_build_object(
      'missing_attribution', clinic.missing_attribution,
      'missing_cost_count', clinic.missing_cost_count,
      'excluded_voided_payments', (
        SELECT count(*)::integer
        FROM public.payments AS payment
        JOIN selected_visits AS visit ON visit.queue_entry_id = payment.queue_entry_id
        WHERE payment.deleted_at IS NOT NULL
      )
    ),
    'confidence', jsonb_build_object(
      'state', CASE
        WHEN clinic.completed_visits = 0 THEN 'insufficient'
        WHEN clinic.missing_attribution > 0 OR clinic.missing_cost_count > 0 THEN 'partial'
        ELSE 'reliable'
      END,
      'missing_attribution', clinic.missing_attribution,
      'missing_cost_count', clinic.missing_cost_count
    ),
    'generated_at', statement_timestamp()
  )
  INTO v_result
  FROM clinic_stats AS clinic
  CROSS JOIN doctor_json
  CROSS JOIN service_json;

  RETURN v_result;
END;
$function$;

NOTIFY pgrst, 'reload schema';
