-- Aggregate-only clinical attendance report for the management dashboard.
-- A non-null native queue number is the current imported/synthetic-arrival boundary:
-- rows without one are not a native clinic arrival and are excluded.

CREATE INDEX IF NOT EXISTS clinical_attendance_heatmap_queue_created_idx
  ON public.queue_entries (created_at)
  WHERE deleted_at IS NULL
    AND cancelled_at IS NULL
    AND queue_number IS NOT NULL
    AND visit_type::text <> 'payment_only';

CREATE INDEX IF NOT EXISTS clinical_attendance_heatmap_consultation_queue_doctor_idx
  ON public.consultations (queue_entry_id, doctor_id)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.get_clinical_attendance_heatmap(
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
  IF NOT public.can_view_management_dashboard((SELECT auth.uid())) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  IF _start_date IS NULL
     OR _end_date IS NULL
     OR _start_date > _end_date
     OR (_end_date - _start_date) > 365 THEN
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
      ON sr.month = extract(month FROM pd.day)::integer - 1
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
      bool_or(true) AS any_doctor,
      bool_or(ra.doctor_id = _doctor_id::text) AS selected_doctor,
      bool_or(ra.doctor_id IS DISTINCT FROM _doctor_id::text) AS another_doctor
    FROM roster_assignments AS ra
    CROSS JOIN LATERAL generate_series(ra.start_hour, ra.end_hour - 1) AS hour(hour)
    GROUP BY ra.period, ra.day, hour.hour
  ),
  qualifying_consultations AS MATERIALIZED (
    SELECT DISTINCT ON (c.queue_entry_id)
      c.queue_entry_id,
      c.doctor_id
    FROM public.consultations AS c
    WHERE c.deleted_at IS NULL
    ORDER BY c.queue_entry_id, c.created_at, c.id
  ),
  attendance_facts AS MATERIALIZED (
    SELECT
      pd.period,
      local_time.local_created_at::date AS day,
      extract(isodow FROM local_time.local_created_at)::integer AS weekday,
      extract(hour FROM local_time.local_created_at)::integer AS hour,
      c.doctor_id::text AS doctor_id,
      coalesce(nullif(btrim(d.name), ''), 'Unknown doctor') AS doctor_name,
      CASE
        WHEN qe.called_at >= qe.created_at
          THEN extract(epoch FROM (qe.called_at - qe.created_at)) / 60.0
      END AS wait_minutes
    FROM public.queue_entries AS qe
    JOIN qualifying_consultations AS c ON c.queue_entry_id = qe.id
    LEFT JOIN public.doctors AS d ON d.id = c.doctor_id
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
      AND (_doctor_id IS NULL OR c.doctor_id = _doctor_id)
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
      CASE WHEN _doctor_id IS NULL THEN false
        ELSE coalesce(rs.another_doctor, false) AND NOT coalesce(rs.selected_doctor, false)
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
      coalesce(sum(cd.visits), 0)::integer AS total_visits,
      count(cd.day) FILTER (WHERE cd.operating)::integer AS operating_occurrences,
      percentile_disc(0.5) WITHIN GROUP (ORDER BY cd.visits)
        FILTER (WHERE cd.operating)::integer AS median_visits,
      max(cd.visits) FILTER (WHERE cd.operating)::integer AS peak_visits,
      coalesce(sum(cd.wait_total_minutes), 0)::numeric AS wait_total_minutes,
      coalesce(sum(cd.wait_measured_visits), 0)::integer AS wait_measured_visits,
      count(cd.day) FILTER (WHERE cd.other_doctor_covered)::integer AS other_doctor_covered_occurrences,
      coalesce(jsonb_agg(jsonb_build_object(
        'date', cd.day,
        'visits', cd.visits,
        'averageWaitMinutes', CASE WHEN cd.wait_measured_visits > 0
          THEN round(cd.wait_total_minutes / cd.wait_measured_visits, 1)
        END
      ) ORDER BY cd.day) FILTER (WHERE cd.visits > 0), '[]'::jsonb) AS dates
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
      selected.total_visits,
      selected.operating_occurrences,
      CASE WHEN selected.operating_occurrences > 0
        THEN round(selected.total_visits::numeric / selected.operating_occurrences, 2)
      END AS average_visits,
      selected.median_visits,
      selected.peak_visits,
      CASE WHEN selected.wait_measured_visits > 0
        THEN round(selected.wait_total_minutes / selected.wait_measured_visits, 1)
      END AS average_wait_minutes,
      selected.wait_measured_visits,
      CASE WHEN comparison.operating_occurrences > 0
        THEN round(comparison.total_visits::numeric / comparison.operating_occurrences, 2)
      END AS comparison_average_visits,
      selected.other_doctor_covered_occurrences,
      selected.dates,
      CASE
        WHEN selected.operating_occurrences = 0 THEN 'uncovered'
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
      ) THEN 'Some roster-backed cells have fewer than eight operating occurrences.' END,
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

ALTER FUNCTION public.get_clinical_attendance_heatmap(date, date, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_clinical_attendance_heatmap(date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_clinical_attendance_heatmap(date, date, uuid) TO authenticated;
