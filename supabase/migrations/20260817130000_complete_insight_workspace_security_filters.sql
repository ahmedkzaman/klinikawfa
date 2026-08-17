-- Round-two hardening for the complete Clinic Insight workspace. This migration
-- is additive and must follow 20260817120000; it is intentionally not applied here.

CREATE OR REPLACE FUNCTION public.can_view_insight_workspace()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_roles AS role_row
      WHERE role_row.user_id = (SELECT auth.uid())
        AND role_row.role::text IN (
          'special_admin', 'admin', 'doctor_admin',
          'resident_doctor', 'ops_staff', 'operations'
        )
    )
    AND public.has_clinic_permission('reports.view', (SELECT auth.uid()));
$function$;

ALTER FUNCTION public.can_view_insight_workspace() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.can_view_insight_workspace() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_insight_workspace() TO authenticated;

-- Older reports call this role-era helper. Make that path authoritative too,
-- while rejecting attempts to ask about another account.
CREATE OR REPLACE FUNCTION public.can_view_insights(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT _user_id IS NOT DISTINCT FROM (SELECT auth.uid())
    AND public.can_view_insight_workspace();
$function$;

ALTER FUNCTION public.can_view_insights(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.can_view_insights(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_insights(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_insight_clinic_health_metrics(
  _start_date date, _end_date date
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NOT public.can_view_insight_workspace() THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  RETURN public.get_clinic_health_metrics(_start_date, _end_date);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_insight_financial_control_summary(
  _start_date date, _end_date date, _comparison_start date,
  _comparison_end date, _as_of_date date
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $function$
BEGIN
  IF NOT public.can_view_insight_workspace() THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  RETURN public.get_financial_control_summary(
    _start_date, _end_date, _comparison_start, _comparison_end, _as_of_date
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_insight_financial_control_details(
  _start_date date, _end_date date, _as_of_date date, _metric text,
  _group_by text, _alert_key text, _page integer, _page_size integer
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $function$
BEGIN
  IF NOT public.can_view_insight_workspace() THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  RETURN public.get_financial_control_details(
    _start_date, _end_date, _as_of_date, _metric, _group_by,
    _alert_key, _page, _page_size
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_insight_clinical_attendance_heatmap(
  _start_date date, _end_date date, _doctor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NOT public.can_view_insight_workspace() THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  RETURN public.get_clinical_attendance_heatmap(_start_date, _end_date, _doctor_id);
END;
$function$;

-- The old names are implementation details now. Direct PostgREST calls cannot
-- bypass reports.view; only the four guarded Insight entry points are granted.
REVOKE ALL ON FUNCTION public.get_clinic_health_metrics(date, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_financial_control_summary(date, date, date, date, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_financial_control_details(date, date, date, text, text, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_clinical_attendance_heatmap(date, date, uuid) FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.get_insight_clinic_health_metrics(date, date) OWNER TO postgres;
ALTER FUNCTION public.get_insight_financial_control_summary(date, date, date, date, date) OWNER TO postgres;
ALTER FUNCTION public.get_insight_financial_control_details(date, date, date, text, text, text, integer, integer) OWNER TO postgres;
ALTER FUNCTION public.get_insight_clinical_attendance_heatmap(date, date, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_insight_clinic_health_metrics(date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_insight_financial_control_summary(date, date, date, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_insight_financial_control_details(date, date, date, text, text, text, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_insight_clinical_attendance_heatmap(date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_insight_clinic_health_metrics(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_insight_financial_control_summary(date, date, date, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_insight_financial_control_details(date, date, date, text, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_insight_clinical_attendance_heatmap(date, date, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public._insight_is_procedure_item(
  _service_id uuid, _item_id uuid, _package_id uuid, _item_name text
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT _package_id IS NOT NULL
    OR EXISTS (SELECT 1 FROM public.services AS service
      WHERE service.id = _service_id AND lower(btrim(coalesce(service.category, ''))) = 'procedure')
    OR EXISTS (SELECT 1 FROM public.inventory_items AS inventory
      WHERE inventory.id = _item_id AND lower(btrim(coalesce(inventory.category, ''))) = 'procedure')
    OR EXISTS (SELECT 1 FROM public.services AS legacy_service
      WHERE lower(btrim(coalesce(legacy_service.category, ''))) = 'procedure'
        AND lower(btrim(legacy_service.name)) = lower(btrim(coalesce(_item_name, ''))))
    OR lower(btrim(coalesce(_item_name, ''))) IN ('excision biopsy', 'excision biopsy (procedure)');
$function$;

ALTER FUNCTION public._insight_is_procedure_item(uuid, uuid, uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public._insight_is_procedure_item(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_doctor_clinical_activity(
  _start_date date, _end_date date
)
RETURNS TABLE (
  activity_id uuid, activity_kind text, activity_date date, activity_name text,
  consultation_id uuid, queue_entry_id uuid, queue_created_at timestamptz,
  queue_sequence integer, doctor_id uuid, doctor_name text, patient_name text,
  unit_price numeric, quantity numeric, total_price numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE v_role text;
BEGIN
  IF NOT public.can_view_insight_workspace() THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  SELECT role_row.role::text INTO v_role FROM public.user_roles AS role_row
    WHERE role_row.user_id = (SELECT auth.uid()) LIMIT 1;
  IF v_role NOT IN ('special_admin', 'doctor_admin') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF _start_date IS NULL OR _end_date IS NULL OR _start_date > _end_date OR (_end_date - _start_date) > 364 THEN
    RAISE EXCEPTION 'INVALID_DATE_RANGE' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  SELECT activity.* FROM (
    SELECT item.id, 'procedure'::text, timezone('Asia/Kuala_Lumpur', queue_entry.created_at)::date,
      coalesce(service.name, inventory.name, package.name, item.item_name), consultation.id,
      queue_entry.id, queue_entry.created_at, queue_entry.queue_sequence, consultation.doctor_id,
      CASE WHEN consultation.doctor_id IS NULL THEN 'Unassigned' ELSE
        coalesce(nullif(btrim(profile.full_name), ''), nullif(btrim(doctor.name), ''), 'Unknown doctor') END,
      coalesce(nullif(btrim(patient.name), ''), 'Unknown patient'), item.price::numeric,
      item.quantity::numeric, (item.price * item.quantity)::numeric
    FROM public.consultation_items AS item
    JOIN public.consultations AS consultation ON consultation.id = item.consultation_id
    JOIN public.queue_entries AS queue_entry ON queue_entry.id = consultation.queue_entry_id
    LEFT JOIN public.services AS service ON service.id = item.service_id
    LEFT JOIN public.inventory_items AS inventory ON inventory.id = item.item_id
    LEFT JOIN public.packages AS package ON package.id = item.package_id
    LEFT JOIN public.doctors AS doctor ON doctor.id = consultation.doctor_id
    LEFT JOIN public.profiles AS profile ON profile.id = doctor.user_id
    LEFT JOIN public.patients AS patient ON patient.id = consultation.patient_id
    WHERE public._insight_is_procedure_item(item.service_id, item.item_id, item.package_id, item.item_name)
      AND item.deleted_at IS NULL AND consultation.deleted_at IS NULL
      AND consultation.status = 'completed' AND queue_entry.clinic_status = 'completed'
      AND queue_entry.deleted_at IS NULL AND queue_entry.cancelled_at IS NULL
      AND timezone('Asia/Kuala_Lumpur', queue_entry.created_at)::date BETWEEN _start_date AND _end_date
    UNION ALL
    SELECT document.id, lower(document.type), timezone('Asia/Kuala_Lumpur', document.created_at)::date,
      coalesce(nullif(btrim(document.template_name), ''), CASE lower(document.type)
        WHEN 'mc' THEN 'Medical certificate' WHEN 'quarantine' THEN 'Quarantine letter'
        WHEN 'referral' THEN 'Referral letter' END), consultation.id, queue_entry.id,
      queue_entry.created_at, queue_entry.queue_sequence, consultation.doctor_id,
      CASE WHEN consultation.doctor_id IS NULL THEN 'Unassigned' ELSE
        coalesce(nullif(btrim(profile.full_name), ''), nullif(btrim(doctor.name), ''), 'Unknown doctor') END,
      coalesce(nullif(btrim(patient.name), ''), 'Unknown patient'), document_item.price::numeric,
      document_item.quantity::numeric, (document_item.price * document_item.quantity)::numeric
    FROM public.consultation_documents AS document
    JOIN public.consultations AS consultation ON consultation.id = document.consultation_id
    JOIN public.queue_entries AS queue_entry ON queue_entry.id = consultation.queue_entry_id
    LEFT JOIN public.consultation_items AS document_item ON document_item.source_document_id = document.id
      AND document_item.deleted_at IS NULL
    LEFT JOIN public.doctors AS doctor ON doctor.id = consultation.doctor_id
    LEFT JOIN public.profiles AS profile ON profile.id = doctor.user_id
    LEFT JOIN public.patients AS patient ON patient.id = consultation.patient_id
    WHERE lower(coalesce(document.type, '')) IN ('mc', 'quarantine', 'referral')
      AND consultation.deleted_at IS NULL AND consultation.status = 'completed'
      AND queue_entry.clinic_status = 'completed' AND queue_entry.deleted_at IS NULL
      AND queue_entry.cancelled_at IS NULL
      AND timezone('Asia/Kuala_Lumpur', document.created_at)::date BETWEEN _start_date AND _end_date
  ) AS activity(activity_id, activity_kind, activity_date, activity_name, consultation_id,
    queue_entry_id, queue_created_at, queue_sequence, doctor_id, doctor_name, patient_name,
    unit_price, quantity, total_price)
  ORDER BY activity.activity_date, activity.activity_kind, activity.activity_id;
END;
$function$;

ALTER FUNCTION public.get_doctor_clinical_activity(date, date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_doctor_clinical_activity(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_doctor_clinical_activity(date, date) TO authenticated;

-- Recompute the filter-sensitive fields that the first additive implementation
-- inherited from the unfiltered report. The underlying report remains the
-- authoritative contract for invariant metrics and comparison metadata.
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
      CASE WHEN lower(coalesce(queue_entry.payment_method, '')) = 'panel'
        OR EXISTS (SELECT 1 FROM public.payments AS payment
          WHERE payment.queue_entry_id = queue_entry.id AND payment.deleted_at IS NULL
            AND (lower(coalesce(payment.payment_type, '')) = 'panel'
              OR lower(btrim(coalesce(payment.payment_method, ''))) = 'panel'))
        THEN 'panel' ELSE 'self_pay' END AS payment_type
    FROM public.consultations AS consultation
    JOIN public.queue_entries AS queue_entry ON queue_entry.id = consultation.queue_entry_id
    WHERE consultation.status = 'completed' AND consultation.deleted_at IS NULL
      AND queue_entry.clinic_status = 'completed' AND queue_entry.deleted_at IS NULL
      AND queue_entry.cancelled_at IS NULL AND queue_entry.visit_type <> 'payment_only'
      AND timezone('Asia/Kuala_Lumpur', queue_entry.created_at)::date BETWEEN _start_date AND _end_date
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
    SELECT coalesce(sum((doctor_row->>'rostered_hours')::numeric), 0) AS hours
    FROM jsonb_array_elements(v_result->'doctors') AS doctor_row
    WHERE doctor_row->>'doctor_id' IS NOT NULL
      AND (_doctor_id IS NULL OR doctor_row->>'doctor_id' = _doctor_id::text)
      AND (v_role <> 'resident_doctor' OR doctor_row->>'doctor_id' = v_resident_doctor::text)
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
      CASE WHEN lower(coalesce(queue_entry.payment_method, '')) = 'panel'
        OR EXISTS (SELECT 1 FROM public.payments AS payment WHERE payment.queue_entry_id = queue_entry.id
          AND payment.deleted_at IS NULL AND (lower(coalesce(payment.payment_type, '')) = 'panel'
            OR lower(btrim(coalesce(payment.payment_method, ''))) = 'panel')) THEN 'panel' ELSE 'self_pay' END AS payment_type
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
      'patients_per_hour', CASE WHEN (base.doctor_row->>'rostered_hours')::numeric > 0
        THEN round(grouped.visits / (base.doctor_row->>'rostered_hours')::numeric, 2) END,
      'revenue_per_hour', CASE WHEN (base.doctor_row->>'rostered_hours')::numeric > 0
        THEN round(grouped.revenue / (base.doctor_row->>'rostered_hours')::numeric, 2) END,
      'procedures', grouped.procedures, 'documents', grouped.documents) AS doctor_row
    FROM grouped JOIN LATERAL (SELECT source_row AS doctor_row FROM jsonb_array_elements(v_result->'doctors') AS source_row
      WHERE source_row->>'doctor_id' = grouped.doctor_id::text LIMIT 1) AS base ON true
  )
  SELECT CASE
    WHEN v_role IN ('ops_staff', 'operations') THEN '[]'::jsonb
    WHEN v_role IN ('special_admin', 'doctor_admin', 'resident_doctor')
      THEN coalesce((SELECT jsonb_agg(doctor_row ORDER BY doctor_row->>'doctor_name') FROM named_rows), '[]'::jsonb)
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
        CASE WHEN lower(coalesce(queue_entry.payment_method, '')) = 'panel'
          OR EXISTS (SELECT 1 FROM public.payments AS payment WHERE payment.queue_entry_id = queue_entry.id
            AND payment.deleted_at IS NULL AND lower(coalesce(payment.payment_type, '')) = 'panel') THEN 'panel' ELSE 'self_pay' END AS payment_type
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

  RETURN v_result || jsonb_build_object(
    'clinic', v_clinic, 'doctors', v_doctors, 'services', v_services,
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
        CASE WHEN lower(coalesce(queue_entry.payment_method, '')) = 'panel'
          OR EXISTS (SELECT 1 FROM public.payments AS payment WHERE payment.queue_entry_id = queue_entry.id
            AND payment.deleted_at IS NULL AND (lower(coalesce(payment.payment_type, '')) = 'panel'
              OR lower(btrim(coalesce(payment.payment_method, ''))) = 'panel'))
          THEN 'panel' ELSE 'self_pay' END AS payment_type
      FROM public.consultations AS consultation
      JOIN public.queue_entries AS queue_entry ON queue_entry.id = consultation.queue_entry_id
      WHERE consultation.doctor_id = v_detail_doctor AND consultation.status = 'completed'
        AND consultation.deleted_at IS NULL AND queue_entry.clinic_status = 'completed'
        AND queue_entry.deleted_at IS NULL AND queue_entry.cancelled_at IS NULL
        AND queue_entry.visit_type <> 'payment_only'
        AND timezone('Asia/Kuala_Lumpur', queue_entry.created_at)::date BETWEEN _start_date AND _end_date
        AND (coalesce(_payment_type, 'all') = 'all' OR CASE WHEN lower(coalesce(queue_entry.payment_method, '')) = 'panel'
          OR EXISTS (SELECT 1 FROM public.payments AS payment WHERE payment.queue_entry_id = queue_entry.id
            AND payment.deleted_at IS NULL AND lower(coalesce(payment.payment_type, '')) = 'panel')
          THEN 'panel' ELSE 'self_pay' END = _payment_type)
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
        CASE WHEN lower(coalesce(queue_entry.payment_method, '')) = 'panel'
          OR EXISTS (SELECT 1 FROM public.payments AS payment WHERE payment.queue_entry_id = queue_entry.id
            AND payment.deleted_at IS NULL AND lower(coalesce(payment.payment_type, '')) = 'panel')
          THEN 'panel' ELSE 'self_pay' END AS payment_type,
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
        AND (coalesce(_payment_type, 'all') = 'all' OR CASE WHEN lower(coalesce(queue_entry.payment_method, '')) = 'panel'
          OR EXISTS (SELECT 1 FROM public.payments AS payment WHERE payment.queue_entry_id = queue_entry.id
            AND payment.deleted_at IS NULL AND lower(coalesce(payment.payment_type, '')) = 'panel')
          THEN 'panel' ELSE 'self_pay' END = _payment_type)
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

ALTER FUNCTION public.get_insight_performance_filtered(date, date, uuid, text, text, boolean) OWNER TO postgres;
ALTER FUNCTION public.get_insight_performance_detail_filtered(date, date, text, text, uuid, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_insight_performance_filtered(date, date, uuid, text, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_insight_performance_detail_filtered(date, date, text, text, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_insight_performance_filtered(date, date, uuid, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_insight_performance_detail_filtered(date, date, text, text, uuid, text, text) TO authenticated;

-- The original detail endpoint cannot be used to bypass global filters.
REVOKE ALL ON FUNCTION public.get_insight_performance_detail(date, date, text, text) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
