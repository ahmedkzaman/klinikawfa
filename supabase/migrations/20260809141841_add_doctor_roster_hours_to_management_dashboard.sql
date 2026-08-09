-- One guarded aggregate endpoint for the management command centre.
-- Individual payroll rows never leave this function.

CREATE INDEX IF NOT EXISTS management_dashboard_queue_called_idx
  ON public.queue_entries(created_at)
  WHERE called_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS management_dashboard_attendance_date_idx
  ON public.attendance_payroll_records(date);
CREATE INDEX IF NOT EXISTS management_dashboard_batch_expiry_idx
  ON public.inventory_item_batches(expiry_date)
  WHERE quantity_remaining > 0;

CREATE OR REPLACE FUNCTION public.get_management_dashboard(_month_start date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $function$
DECLARE
  v_month_start date := date_trunc('month', _month_start)::date;
  v_month_end date := (date_trunc('month', _month_start) + interval '1 month - 1 day')::date;
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_as_of date;
  v_previous_start date;
  v_previous_end date;
  v_result jsonb;
BEGIN
  IF NOT public.can_view_management_dashboard((SELECT auth.uid())) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  v_as_of := LEAST(v_month_end, GREATEST(v_month_start, v_today));
  v_previous_start := (v_month_start - interval '1 month')::date;
  v_previous_end := (v_month_start - interval '1 day')::date;

  WITH facts AS MATERIALIZED (
    SELECT *
    FROM private.financial_control_visit_facts(v_month_start, v_as_of, v_as_of)
  ),
  previous_facts AS MATERIALIZED (
    SELECT *
    FROM private.financial_control_visit_facts(
      v_previous_start,
      v_previous_end,
      v_previous_end
    )
  ),
  queue_daily AS MATERIALIZED (
    SELECT
      (q.created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date AS day,
      count(*)::integer AS pax,
      round(avg(extract(epoch FROM (q.called_at - q.created_at)) / 60.0)
        FILTER (WHERE q.called_at IS NOT NULL AND q.called_at >= q.created_at), 1)
        AS average_wait_minutes,
      count(*) FILTER (WHERE q.called_at IS NOT NULL AND q.called_at >= q.created_at)::integer
        AS measured_visits
    FROM public.queue_entries q
    WHERE (q.created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date
      BETWEEN v_month_start AND v_as_of
    GROUP BY 1
  ),
  queue_totals AS (
    SELECT
      coalesce(sum(pax), 0)::integer AS total_pax,
      round(
        sum(coalesce(average_wait_minutes, 0) * measured_visits)
          / nullif(sum(measured_visits), 0),
        1
      ) AS average_wait_minutes,
      coalesce(sum(measured_visits), 0)::integer AS measured_visits,
      coalesce(jsonb_agg(jsonb_build_object(
        'date', day,
        'pax', pax,
        'averageWaitMinutes', average_wait_minutes,
        'measuredVisits', measured_visits
      ) ORDER BY day), '[]'::jsonb) AS daily
    FROM queue_daily
  ),
  doctor_roster_shift_entries AS MATERIALIZED (
    SELECT
      sr.id AS roster_id,
      roster_day.day_key,
      shift_entry.key AS shift_key,
      shift_entry.value AS shift_value
    FROM public.saved_rosters sr
    CROSS JOIN LATERAL jsonb_each(COALESCE(sr.roster_data, '{}'::jsonb))
      AS roster_day(day_key, day_value)
    CROSS JOIN LATERAL jsonb_each(COALESCE(roster_day.day_value, '{}'::jsonb))
      AS shift_entry(key, value)
    WHERE sr.roster_type = 'doctor'
      AND sr.month = EXTRACT(month FROM v_month_start)::integer
      AND sr.year = EXTRACT(year FROM v_month_start)::integer
      AND roster_day.day_key::date BETWEEN v_month_start AND v_as_of
      AND shift_entry.key IN ('DOC_S1', 'shift1', 'DOC_S2', 'shift2', 'DOC_S3', 'shift3')
  ),
  doctor_roster_shift_cells AS MATERIALIZED (
    SELECT
      NULLIF(cell.value->>'staffId', '') AS doctor_id,
      COALESCE(NULLIF(cell.value->>'staffName', ''), 'Unknown doctor') AS doctor_name,
      CASE
        WHEN shift_key IN ('DOC_S1', 'shift1') THEN 5
        WHEN shift_key IN ('DOC_S2', 'shift2') THEN 5
        WHEN shift_key IN ('DOC_S3', 'shift3') THEN 4
        ELSE 0
      END::numeric AS hours
    FROM doctor_roster_shift_entries
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE jsonb_typeof(shift_value)
        WHEN 'array' THEN shift_value
        WHEN 'object' THEN jsonb_build_array(shift_value)
        ELSE '[]'::jsonb
      END
    ) AS cell(value)
    WHERE NULLIF(cell.value->>'staffId', '') IS NOT NULL
  ),
  doctor_roster_hours AS (
    SELECT
      COALESCE(sum(hours), 0)::numeric AS total_hours,
      count(DISTINCT doctor_id)::integer AS doctor_count,
      count(*)::integer AS shift_count,
      COALESCE(jsonb_agg(jsonb_build_object(
        'doctorId', doctor_id,
        'doctorName', doctor_name,
        'totalHours', total_hours,
        'shiftCount', shift_count
      ) ORDER BY total_hours DESC, doctor_name) FILTER (WHERE doctor_id IS NOT NULL), '[]'::jsonb) AS rows
    FROM (
      SELECT
        doctor_id,
        max(doctor_name) AS doctor_name,
        sum(hours)::numeric AS total_hours,
        count(*)::integer AS shift_count
      FROM doctor_roster_shift_cells
      GROUP BY doctor_id
    ) grouped
  ),
  financial_totals AS (
    SELECT
      round(coalesce(sum(billed), 0), 2) AS gross_revenue,
      round(coalesce(sum(paid_in_period), 0), 2) AS collections,
      count(*) FILTER (
        WHERE billed IS NULL OR paid_in_period IS NULL OR doctor_name IS NULL
      )::integer AS incomplete_count
    FROM facts
  ),
  collection_split AS (
    SELECT
      round(coalesce((
        SELECT sum(e.amount_delta)
        FROM private.financial_payment_events e
        WHERE e.attribution_complete
          AND e.event_kind NOT IN ('reassignment_out', 'reassignment_in', 'synthetic_backfill')
          AND (e.occurred_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date
            BETWEEN v_month_start AND v_as_of
      ), 0), 2) AS patient_collections,
      round(coalesce((
        SELECT sum(e.receipt_delta)
        FROM private.financial_panel_claim_events e
        WHERE e.attribution_complete
          AND e.event_kind IN ('receipt', 'receipt_reversal')
          AND (e.occurred_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date
            BETWEEN v_month_start AND v_as_of
      ), 0), 2) AS panel_collections
  ),
  doctor_revenue AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'doctorId', doctor_id,
      'doctorName', coalesce(nullif(doctor_name, ''), 'Unassigned'),
      'grossRevenue', gross_revenue
    ) ORDER BY gross_revenue DESC), '[]'::jsonb) AS rows
    FROM (
      SELECT doctor_id, doctor_name, round(coalesce(sum(billed), 0), 2) AS gross_revenue
      FROM facts
      GROUP BY doctor_id, doctor_name
    ) grouped
  ),
  overtime AS (
    SELECT
      round(coalesce(sum(coalesce(a.approved_overtime_hours, 0)), 0), 2)
        AS approved_overtime_hours,
      round(coalesce(sum(
        coalesce(a.approved_overtime_hours, 0) * coalesce(p.overtime_rate, 0)
      ), 0), 2) AS approved_overtime_pay
    FROM public.attendance_payroll_records a
    LEFT JOIN public.staff_payroll_profiles p ON p.user_id = a.user_id
    WHERE a.date BETWEEN v_month_start AND v_as_of
  ),
  appointment_totals AS (
    SELECT
      count(*) FILTER (WHERE status NOT IN ('cancelled', 'no_show'))::integer AS denominator,
      count(*) FILTER (
        WHERE status NOT IN ('cancelled', 'no_show')
          AND (checked_in_at IS NOT NULL OR queue_entry_id IS NOT NULL)
      )::integer AS attended,
      count(*) FILTER (
        WHERE status NOT IN ('cancelled', 'no_show')
          AND (checked_in_at IS NOT NULL OR queue_entry_id IS NOT NULL)
      )::integer AS measured
    FROM public.clinic_appointments
    WHERE appointment_date BETWEEN v_month_start AND v_as_of
  ),
  purchase_totals AS (
    SELECT round(coalesce(sum(i.received_qty * i.unit_cost), 0), 2) AS amount,
      count(*)::integer AS received_lines
    FROM public.purchase_orders po
    JOIN public.purchase_order_items i ON i.po_id = po.id
    WHERE po.status = 'Received'
      AND (po.received_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date
        BETWEEN v_month_start AND v_as_of
  ),
  manual_purchase AS (
    SELECT actual_numeric AS amount
    FROM public.management_dashboard_monthly_metrics
    WHERE month_start = v_month_start AND metric_key = 'stock_purchase_manual'
  ),
  previous_revenue AS (
    SELECT round(coalesce(sum(billed), 0), 2) AS amount FROM previous_facts
  ),
  batch_coverage AS (
    SELECT count(*)::integer AS batch_count FROM public.inventory_item_batches
  ),
  expiry AS (
    SELECT
      CASE WHEN bc.batch_count > 0 THEN (
        SELECT count(*)::integer
        FROM public.inventory_item_batches b
        WHERE b.quantity_remaining > 0 AND b.expiry_date <= v_as_of
      ) ELSE (
        SELECT count(*)::integer
        FROM public.inventory_items i
        WHERE i.status = 'active' AND i.stock > 0
          AND coalesce(i.nearest_expiry_date, i.latest_expiry_date) <= v_as_of
      ) END AS expired_count,
      CASE WHEN bc.batch_count > 0 THEN 'batch' ELSE 'catalogue' END AS source
    FROM batch_coverage bc
  ),
  stock_sales AS (
    SELECT
      round(coalesce(sum(ci.price * ci.quantity), 0), 2) AS revenue,
      round(coalesce(sum(ci.unit_cost * coalesce(ci.dispensed_qty, ci.quantity)), 0), 2) AS cogs
    FROM facts f
    JOIN public.consultation_items ci ON ci.consultation_id = f.consultation_id
    WHERE ci.item_id IS NOT NULL AND ci.deleted_at IS NULL
  )
  SELECT jsonb_build_object(
    'period', jsonb_build_object(
      'monthStart', v_month_start,
      'asOfDate', v_as_of,
      'timezone', 'Asia/Kuala_Lumpur'
    ),
    'operations', jsonb_build_object(
      'totalPax', qt.total_pax,
      'averageWaitMinutes', qt.average_wait_minutes,
      'waitMeasuredVisits', qt.measured_visits,
      'daily', qt.daily,
      'doctorRosterHours', jsonb_build_object(
        'totalHours', drh.total_hours,
        'doctorCount', drh.doctor_count,
        'shiftCount', drh.shift_count,
        'rows', drh.rows
      )
    ),
    'financial', jsonb_build_object(
      'grossRevenue', ft.gross_revenue,
      'patientCollections', cs.patient_collections,
      'panelCollections', cs.panel_collections,
      'collections', ft.collections,
      'revenueByDoctor', dr.rows,
      'approvedOtHours', ot.approved_overtime_hours,
      'approvedOtPay', ot.approved_overtime_pay,
      'incompleteAttributionCount', ft.incomplete_count
    ),
    'stock', jsonb_build_object(
      'purchaseAmount', CASE WHEN pt.received_lines > 0 THEN pt.amount ELSE mp.amount END,
      'purchaseSource', CASE
        WHEN pt.received_lines > 0 THEN 'received'
        WHEN mp.amount IS NOT NULL THEN 'manual'
        ELSE 'unavailable'
      END,
      'purchasePercent', CASE
        WHEN pr.amount > 0 THEN round(
          (CASE WHEN pt.received_lines > 0 THEN pt.amount ELSE mp.amount END) * 100 / pr.amount,
          1
        )
      END,
      'expiredCount', ex.expired_count,
      'expirySource', ex.source,
      'stockRevenue', ss.revenue,
      'stockCogs', ss.cogs,
      'stockMarginPercent', CASE WHEN ss.revenue > 0
        THEN round((ss.revenue - ss.cogs) * 100 / ss.revenue, 1) END
    ),
    'appointments', jsonb_build_object(
      'scheduled', ap.denominator,
      'attended', ap.attended,
      'denominator', ap.denominator,
      'measured', ap.measured,
      'conversionPercent', CASE WHEN ap.measured > 0 AND ap.denominator > 0
        THEN round(ap.attended * 100.0 / ap.denominator, 1) END,
      'coverage', CASE WHEN ap.measured > 0 THEN 'partial' ELSE 'insufficient' END
    ),
    'coverage', jsonb_build_object(
      'financial', CASE WHEN ft.incomplete_count = 0 THEN 'complete' ELSE 'partial' END,
      'waiting', CASE WHEN qt.measured_visits > 0 THEN 'partial' ELSE 'insufficient' END,
      'inventory', ex.source,
      'appointments', CASE WHEN ap.measured > 0 THEN 'partial' ELSE 'insufficient' END
    )
  ) INTO v_result
  FROM queue_totals qt
  CROSS JOIN doctor_roster_hours drh
  CROSS JOIN financial_totals ft
  CROSS JOIN collection_split cs
  CROSS JOIN doctor_revenue dr
  CROSS JOIN overtime ot
  CROSS JOIN appointment_totals ap
  CROSS JOIN purchase_totals pt
  LEFT JOIN manual_purchase mp ON true
  CROSS JOIN previous_revenue pr
  CROSS JOIN expiry ex
  CROSS JOIN stock_sales ss;

  RETURN v_result;
END;
$function$;

ALTER FUNCTION public.get_management_dashboard(date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_management_dashboard(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_management_dashboard(date) TO authenticated;
