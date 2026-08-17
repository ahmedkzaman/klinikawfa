-- Role-safe aggregate for the Clinic Insight Performance workspace.
-- The report is read-only and keeps all doctor identity decisions server-side.

INSERT INTO public.clinic_role_permissions (role, permission_key, allowed)
SELECT supported.role_name::public.app_role, 'reports.view', true
FROM unnest(ARRAY[
  'special_admin', 'admin', 'doctor_admin', 'resident_doctor',
  'ops_staff', 'operations'
]) AS supported(role_name)
ON CONFLICT (role, permission_key) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_consultation_documents_insight_performance_issued
  ON public.consultation_documents (
    (timezone('Asia/Kuala_Lumpur', created_at)::date), consultation_id
  )
  WHERE lower(coalesce(type, '')) IN ('mc', 'quarantine', 'referral');

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
      CASE
        WHEN lower(coalesce(queue_entry.payment_method, '')) = 'panel'
          OR EXISTS (
            SELECT 1
            FROM public.payments AS classified_payment
            WHERE classified_payment.queue_entry_id = queue_entry.id
              AND classified_payment.deleted_at IS NULL
              AND (
                lower(coalesce(classified_payment.payment_type, '')) = 'panel'
                OR lower(btrim(classified_payment.payment_method)) = 'panel'
              )
          ) THEN 'panel'
        ELSE 'self_pay'
      END AS payment_type
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
    ) AS legacy_service ON item.service_id IS NULL
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
    ) AS legacy_service ON item.service_id IS NULL
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
        WHERE item.service_id IS NOT NULL
          OR item.package_id IS NOT NULL
          OR lower(coalesce(item.inventory_category, '')) = 'procedure'
          OR lower(coalesce(item.service_category, '')) = 'procedure'
          OR item.legacy_service_id IS NOT NULL
          OR lower(trim(item.item_name)) IN (
            'excision biopsy', 'excision biopsy (procedure)'
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
    WHERE item.service_id IS NOT NULL
       OR item.package_id IS NOT NULL
       OR lower(coalesce(item.inventory_category, '')) = 'procedure'
       OR lower(coalesce(item.service_category, '')) = 'procedure'
       OR item.legacy_service_id IS NOT NULL
       OR lower(trim(item.item_name)) IN (
         'excision biopsy', 'excision biopsy (procedure)'
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
    WHERE item.service_id IS NOT NULL
       OR item.package_id IS NOT NULL
       OR lower(coalesce(item.inventory_category, '')) = 'procedure'
       OR lower(coalesce(item.service_category, '')) = 'procedure'
       OR item.legacy_service_id IS NOT NULL
       OR lower(trim(item.item_name)) IN (
         'excision biopsy', 'excision biopsy (procedure)'
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

ALTER FUNCTION public.get_insight_performance(date, date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_insight_performance(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_insight_performance(date, date) TO authenticated;

COMMENT ON FUNCTION public.get_insight_performance(date, date) IS
  'Returns bounded Clinic Insight performance aggregates with server-side role redaction.';

NOTIFY pgrst, 'reload schema';
