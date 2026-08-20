-- Fix roster staffId identity resolution across Insight roster consumers.
--
-- Bug: the roster UI (src/pages/staff/admin/Roster.tsx) saves shift
-- assignments with staffId = profiles.id (the auth user id), but the Insight
-- roster consumers joined that value against doctors.id. The two id spaces do
-- not overlap, so every real roster assignment was dropped:
--   * attendance heatmap cells all reported coverage 'uncovered'
--     (operating_occurrences = 0), and
--   * rostered hours were zero for the clinic and every doctor.
--
-- Fix: resolve a roster staffId to a doctors row through EITHER id space —
-- an exact doctors.id match is preferred, then a doctors.user_id match
-- (profiles.id). Unresolvable references (e.g. a staffId for a deleted
-- profile with no doctors row) are still dropped, preserving the guard that
-- a roster string only becomes an identity once it maps to a doctors row.
-- Signatures, ownership, and grants are unchanged.
--
-- v2: the first version of this patch (commit 9bc38c0) aborted with
-- PERFORMANCE_ROSTER_JOIN_POINT_NOT_FOUND because its exact-text needles
-- depended on the live function body's line endings/indentation matching the
-- repo migration files byte-for-byte. This version uses whitespace-tolerant
-- anchored regexes (regexp_replace with \s+) so the patch applies regardless
-- of how the live functions were formatted when originally applied.
--
-- Rollback: re-apply the definitions from
--   20260817140000_harden_insight_refresh_and_filtered_semantics.sql
--   20260817150000_enforce_insight_doctor_visibility_and_cohorts.sql
--   20260817160000_complete_insight_document_rows_and_attendance_roster.sql

BEGIN;

-- 1) _insight_rostered_hours: full rewrite with the dual-space resolver.
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
      roster_doctor.doctor_id
    FROM current_rosters AS roster
    CROSS JOIN LATERAL jsonb_each(coalesce(roster.roster_data, '{}'::jsonb)) AS day(key, value)
    CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(day.value) = 'object'
      THEN day.value ELSE '{}'::jsonb END) AS shift(key, value)
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(shift.value)
      WHEN 'array' THEN shift.value WHEN 'object' THEN jsonb_build_array(shift.value)
      ELSE '[]'::jsonb END) AS assignment(value)
    CROSS JOIN LATERAL (
      SELECT mapped_doctor.id AS doctor_id
      FROM public.doctors AS mapped_doctor
      WHERE (mapped_doctor.id::text = btrim(coalesce(assignment.value->>'staffId', ''))
            OR mapped_doctor.user_id::text = btrim(coalesce(assignment.value->>'staffId', '')))
      ORDER BY (mapped_doctor.id::text = btrim(coalesce(assignment.value->>'staffId', ''))) DESC,
        mapped_doctor.updated_at DESC NULLS LAST,
        mapped_doctor.id
      LIMIT 1
    ) AS roster_doctor(doctor_id)
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

-- 2) _get_insight_performance_round3: patch the roster_assignments CTE so
--    doctor_id_text carries the RESOLVED doctors.id instead of the raw
--    staffId, by injecting a dual-space lateral resolver after the
--    assignment(value) lateral and rewriting the column it selects.
DO $migration$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public._get_insight_performance_round3(date,date)'::regprocedure
  ) INTO v_definition;

  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'PERFORMANCE_ROUND3_NOT_FOUND';
  END IF;

  IF v_definition NOT LIKE '%staffId'' AS doctor_id_text%' THEN
    RAISE EXCEPTION 'PERFORMANCE_ROSTER_COLUMN_NOT_FOUND';
  END IF;

  -- 2a) Column: raw staffId -> resolved doctors.id
  v_definition := regexp_replace(
    v_definition,
    $p1$assignment\.value->>'staffId'\s+AS\s+doctor_id_text$p1$,
    $r1$roster_doctor.doctor_id::text AS doctor_id_text$r1$,
    'g'
  );

  -- 2b) Inject the dual-space resolver between the assignment lateral and
  --     the CTE's WHERE clause. \1 reproduces the original whitespace run.
  v_definition := regexp_replace(
    v_definition,
    $p2$AS assignment\(value\)(\s+)WHERE roster_day\.key$p2$,
    $r2$AS assignment(value)\1CROSS JOIN LATERAL (
      SELECT mapped_doctor.id AS doctor_id
      FROM public.doctors AS mapped_doctor
      WHERE (mapped_doctor.id::text = coalesce(assignment.value->>'staffId', '')
            OR mapped_doctor.user_id::text = coalesce(assignment.value->>'staffId', ''))
      ORDER BY (mapped_doctor.id::text = coalesce(assignment.value->>'staffId', '')) DESC,
        mapped_doctor.updated_at DESC NULLS LAST,
        mapped_doctor.id
      LIMIT 1
    ) AS roster_doctor(doctor_id)\1WHERE roster_day.key$r2$,
    'g'
  );

  IF v_definition NOT LIKE '%AS roster_doctor(doctor_id)%'
     OR v_definition NOT LIKE '%mapped_doctor.user_id%'
     OR v_definition LIKE '%assignment.value->>''staffId'' AS doctor_id_text%' THEN
    RAISE EXCEPTION 'PERFORMANCE_ROSTER_GUARD_NOT_INSTALLED';
  END IF;

  EXECUTE v_definition;
END;
$migration$;

-- 3) _get_insight_clinical_attendance_heatmap_round3: replace the
--    doctors.id-only join injected by 20260817160000 with the dual-space
--    resolver, and select the resolved doctor id in the CTE column.
DO $migration$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public._get_insight_clinical_attendance_heatmap_round3(date,date,uuid)'::regprocedure
  ) INTO v_definition;

  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'ATTENDANCE_ROUND3_NOT_FOUND';
  END IF;

  IF v_definition NOT LIKE '%NULLIF(btrim(assignment.value->>''staffId''), '''') AS doctor_id%'
     OR v_definition NOT LIKE '%JOIN public.doctors AS mapped_roster_doctor%' THEN
    RAISE EXCEPTION 'ATTENDANCE_ROSTER_NEEDLES_NOT_FOUND';
  END IF;

  -- 3a) Column: raw staffId -> resolved doctors.id
  v_definition := regexp_replace(
    v_definition,
    $p3$NULLIF\(btrim\(assignment\.value->>'staffId'\), ''\)\s+AS\s+doctor_id$p3$,
    $r3$roster_doctor.doctor_id::text AS doctor_id$r3$,
    'g'
  );

  -- 3b) Join: doctors.id-only inner join -> dual-space lateral resolver
  --     (still restricted to active doctors).
  v_definition := regexp_replace(
    v_definition,
    $p4$JOIN public\.doctors AS mapped_roster_doctor\s+ON mapped_roster_doctor\.id::text = NULLIF\(btrim\(assignment\.value->>'staffId'\), ''\)\s+AND mapped_roster_doctor\.status = 'active'$p4$,
    $r4$CROSS JOIN LATERAL (
      SELECT mapped_roster_doctor.id AS doctor_id
      FROM public.doctors AS mapped_roster_doctor
      WHERE (mapped_roster_doctor.id::text = NULLIF(btrim(assignment.value->>'staffId'), '')
            OR mapped_roster_doctor.user_id::text = NULLIF(btrim(assignment.value->>'staffId'), ''))
        AND mapped_roster_doctor.status = 'active'
      ORDER BY (mapped_roster_doctor.id::text = NULLIF(btrim(assignment.value->>'staffId'), '')) DESC,
        mapped_roster_doctor.updated_at DESC NULLS LAST,
        mapped_roster_doctor.id
      LIMIT 1
    ) AS roster_doctor(doctor_id)$r4$,
    'g'
  );

  IF v_definition NOT LIKE '%AS roster_doctor(doctor_id)%'
     OR v_definition NOT LIKE '%mapped_roster_doctor.user_id%'
     OR v_definition LIKE '%JOIN public.doctors AS mapped_roster_doctor%'
     OR v_definition NOT LIKE '%mapped_roster_doctor.status = ''active''%' THEN
    RAISE EXCEPTION 'ATTENDANCE_ROSTER_GUARD_NOT_INSTALLED';
  END IF;

  EXECUTE v_definition;
END;
$migration$;

NOTIFY pgrst, 'reload schema';

COMMIT;
