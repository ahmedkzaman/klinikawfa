-- Patient Explorer: performance fix for statement timeout.
--
-- The 20260828100000 version ran a separate EXISTS + ILIKE scan over
-- consultation_items for EACH clinical filter. Stacking filters
-- (e.g. blood investigations + procedures) multiplied those scans and
-- exceeded Supabase's statement timeout.
--
-- This version:
--   1. Resolves candidate patients from cheap demographic filters first
--      (including the original age-AT-VISIT semantics).
--   2. Pre-aggregates each candidate's clinical values in single grouped
--      passes (no correlated subqueries).
--   3. Matches filter terms against those small arrays per element.
--
-- Semantics preserved from 20260828100000 / the original RPC:
--   - Partial case-insensitive matching for diagnoses, blood investigations,
--     procedures, medicines, and attending doctors.
--   - Consultation statuses: case-insensitive exact match.
--   - Blood-glucose vital-sign shortcut: exact 'blood glucose' term.
--   - Patients with no consultations still appear in all_time mode when no
--     clinical filters are set.
--   - Age range matches the age the patient WAS AT A VISIT, not today.

CREATE OR REPLACE FUNCTION public.search_patient_explorer(
  p_filters jsonb,
  p_page integer,
  p_page_size integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  filters jsonb := COALESCE(p_filters, '{}'::jsonb);
  date_mode text;
  start_date_text text;
  end_date_text text;
  v_start_date date;
  v_end_date date;
  v_patient_name text;
  v_ic_number text;
  v_phone text;
  v_address text;
  v_postcode text;
  v_gender text;
  v_age_min integer;
  v_age_max integer;
  v_diagnoses text[] := ARRAY[]::text[];
  v_blood_investigations text[] := ARRAY[]::text[];
  v_procedures text[] := ARRAY[]::text[];
  v_medicines text[] := ARRAY[]::text[];
  v_consultation_statuses text[] := ARRAY[]::text[];
  v_attending_doctors text[] := ARRAY[]::text[];
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_or_clinical(auth.uid()) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(filters) <> 'object' THEN
    RAISE EXCEPTION 'filters must be a JSON object' USING ERRCODE = '22023';
  END IF;

  IF p_page IS NULL OR p_page < 1 THEN
    RAISE EXCEPTION 'page must be at least 1' USING ERRCODE = '22023';
  END IF;

  IF p_page_size IS NULL OR p_page_size < 1 OR p_page_size > 100 THEN
    RAISE EXCEPTION 'page size must be between 1 and 100' USING ERRCODE = '22023';
  END IF;

  date_mode := filters ->> 'dateMode';
  IF date_mode IS NULL OR date_mode NOT IN ('all_time', 'custom') THEN
    RAISE EXCEPTION 'date mode must be all_time or custom' USING ERRCODE = '22023';
  END IF;

  IF date_mode = 'custom' THEN
    start_date_text := btrim(COALESCE(filters ->> 'startDate', ''));
    end_date_text := btrim(COALESCE(filters ->> 'endDate', ''));

    IF start_date_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       OR end_date_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
      RAISE EXCEPTION 'custom range requires valid dates' USING ERRCODE = '22023';
    END IF;

    v_start_date := to_date(start_date_text, 'FXYYYY-MM-DD');
    v_end_date := to_date(end_date_text, 'FXYYYY-MM-DD');
    IF to_char(v_start_date, 'YYYY-MM-DD') <> start_date_text
       OR to_char(v_end_date, 'YYYY-MM-DD') <> end_date_text THEN
      RAISE EXCEPTION 'custom range requires valid dates' USING ERRCODE = '22023';
    END IF;

    IF v_end_date < v_start_date THEN
      RAISE EXCEPTION 'end date must not be before start date' USING ERRCODE = '22023';
    END IF;

    IF (v_end_date - v_start_date + 1) > 365 THEN
      RAISE EXCEPTION 'custom range cannot exceed 365 calendar days' USING ERRCODE = '22023';
    END IF;
  ELSIF NULLIF(btrim(COALESCE(filters ->> 'startDate', '')), '') IS NOT NULL
     OR NULLIF(btrim(COALESCE(filters ->> 'endDate', '')), '') IS NOT NULL THEN
    RAISE EXCEPTION 'all_time does not accept date boundaries' USING ERRCODE = '22023';
  END IF;

  IF NULLIF(filters ->> 'ageMin', '') IS NOT NULL
     AND (filters ->> 'ageMin' !~ '^[0-9]+$') THEN
    RAISE EXCEPTION 'minimum age must be an integer' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(filters ->> 'ageMax', '') IS NOT NULL
     AND (filters ->> 'ageMax' !~ '^[0-9]+$') THEN
    RAISE EXCEPTION 'maximum age must be an integer' USING ERRCODE = '22023';
  END IF;

  v_age_min := NULLIF(filters ->> 'ageMin', '')::integer;
  v_age_max := NULLIF(filters ->> 'ageMax', '')::integer;
  IF (v_age_min IS NOT NULL AND (v_age_min < 0 OR v_age_min > 150))
     OR (v_age_max IS NOT NULL AND (v_age_max < 0 OR v_age_max > 150))
     OR (v_age_min IS NOT NULL AND v_age_max IS NOT NULL AND v_age_min > v_age_max) THEN
    RAISE EXCEPTION 'age must be between 0 and 150 with a valid range' USING ERRCODE = '22023';
  END IF;

  v_patient_name := btrim(COALESCE(filters ->> 'patientName', ''));
  v_ic_number := btrim(COALESCE(filters ->> 'icNumber', ''));
  v_phone := btrim(COALESCE(filters ->> 'phone', ''));
  v_address := btrim(COALESCE(filters ->> 'address', ''));
  v_postcode := btrim(COALESCE(filters ->> 'postcode', ''));
  v_gender := btrim(COALESCE(filters ->> 'gender', ''));

  IF jsonb_typeof(COALESCE(filters -> 'diagnoses', '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(COALESCE(filters -> 'bloodInvestigations', '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(COALESCE(filters -> 'procedures', '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(COALESCE(filters -> 'medicines', '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(COALESCE(filters -> 'consultationStatuses', '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(COALESCE(filters -> 'attendingDoctors', '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'clinical filters must be arrays' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT lower(btrim(value)) ORDER BY lower(btrim(value))), ARRAY[]::text[])
    INTO v_diagnoses
    FROM jsonb_array_elements_text(COALESCE(filters -> 'diagnoses', '[]'::jsonb)) AS filter_value(value)
   WHERE btrim(value) <> '';
  SELECT COALESCE(array_agg(DISTINCT lower(btrim(value)) ORDER BY lower(btrim(value))), ARRAY[]::text[])
    INTO v_blood_investigations
    FROM jsonb_array_elements_text(COALESCE(filters -> 'bloodInvestigations', '[]'::jsonb)) AS filter_value(value)
   WHERE btrim(value) <> '';
  SELECT COALESCE(array_agg(DISTINCT lower(btrim(value)) ORDER BY lower(btrim(value))), ARRAY[]::text[])
    INTO v_procedures
    FROM jsonb_array_elements_text(COALESCE(filters -> 'procedures', '[]'::jsonb)) AS filter_value(value)
   WHERE btrim(value) <> '';
  SELECT COALESCE(array_agg(DISTINCT lower(btrim(value)) ORDER BY lower(btrim(value))), ARRAY[]::text[])
    INTO v_medicines
    FROM jsonb_array_elements_text(COALESCE(filters -> 'medicines', '[]'::jsonb)) AS filter_value(value)
   WHERE btrim(value) <> '';
  SELECT COALESCE(array_agg(DISTINCT lower(btrim(value)) ORDER BY lower(btrim(value))), ARRAY[]::text[])
    INTO v_consultation_statuses
    FROM jsonb_array_elements_text(COALESCE(filters -> 'consultationStatuses', '[]'::jsonb)) AS filter_value(value)
   WHERE btrim(value) <> '';
  SELECT COALESCE(array_agg(DISTINCT lower(btrim(value)) ORDER BY lower(btrim(value))), ARRAY[]::text[])
    INTO v_attending_doctors
    FROM jsonb_array_elements_text(COALESCE(filters -> 'attendingDoctors', '[]'::jsonb)) AS filter_value(value)
   WHERE btrim(value) <> '';

  RETURN (
    WITH
    -- 1) Visits in scope (date-filtered)
    matching_visits AS (
      SELECT
        consultation.id AS consultation_id,
        consultation.patient_id,
        consultation.doctor_id,
        consultation.diagnosis_id,
        consultation.diagnosis_text,
        consultation.status AS consultation_status,
        queue_entry.id AS queue_entry_id,
        timezone('Asia/Kuala_Lumpur', queue_entry.created_at)::date AS visit_date
      FROM public.queue_entries queue_entry
      JOIN public.consultations consultation
        ON consultation.queue_entry_id = queue_entry.id
       AND consultation.patient_id = queue_entry.patient_id
       AND consultation.deleted_at IS NULL
      WHERE queue_entry.deleted_at IS NULL
        AND (
          date_mode = 'all_time'
          OR timezone('Asia/Kuala_Lumpur', queue_entry.created_at)::date BETWEEN v_start_date AND v_end_date
        )
    ),

    -- 2) Cheap demographic pass first (name/IC/phone/address/postcode/gender),
    --    plus visit existence and age-AT-VISIT range checks.
    candidate_patients AS (
      SELECT
        p.id,
        p.name,
        p.national_id,
        p.phone,
        p.address,
        p.postcode,
        p.gender,
        p.date_of_birth
      FROM public.patients p
      WHERE (v_patient_name = '' OR p.name ILIKE '%' || v_patient_name || '%')
        AND (v_ic_number = '' OR COALESCE(p.national_id, '') ILIKE '%' || v_ic_number || '%')
        AND (v_phone = '' OR COALESCE(p.phone, '') ILIKE '%' || v_phone || '%')
        AND (v_address = '' OR COALESCE(p.address, '') ILIKE '%' || v_address || '%')
        AND (v_postcode = '' OR COALESCE(p.postcode, '') ILIKE '%' || v_postcode || '%')
        AND (v_gender = '' OR COALESCE(p.gender, '') ILIKE v_gender)
        AND (
          date_mode = 'all_time'
          OR EXISTS (SELECT 1 FROM matching_visits mv WHERE mv.patient_id = p.id)
        )
        AND (
          (v_age_min IS NULL AND v_age_max IS NULL)
          OR EXISTS (
            SELECT 1
            FROM matching_visits mv
            WHERE mv.patient_id = p.id
              AND p.date_of_birth IS NOT NULL
              AND (v_age_min IS NULL OR extract(year FROM age(mv.visit_date, p.date_of_birth)) >= v_age_min)
              AND (v_age_max IS NULL OR extract(year FROM age(mv.visit_date, p.date_of_birth)) <= v_age_max)
          )
        )
    ),

    -- 3) Single grouped passes for per-patient clinical values (original case
    --    kept for display; per-element ILIKE handles case-insensitivity).
    visit_stats AS (
      SELECT
        mv.patient_id,
        array_agg(DISTINCT to_char(mv.visit_date, 'YYYY-MM-DD') ORDER BY to_char(mv.visit_date, 'YYYY-MM-DD')) AS visit_dates,
        count(DISTINCT mv.queue_entry_id)::integer AS visit_count
      FROM matching_visits mv
      JOIN candidate_patients cp ON cp.id = mv.patient_id
      GROUP BY mv.patient_id
    ),
    diagnosis_stats AS (
      SELECT
        mv.patient_id,
        array_agg(DISTINCT val) AS diag_vals
      FROM (
        SELECT mv.patient_id, COALESCE(NULLIF(btrim(mv.diagnosis_text), ''), d.name) AS val
        FROM matching_visits mv
        JOIN candidate_patients cp ON cp.id = mv.patient_id
        LEFT JOIN public.diagnoses d ON d.id = mv.diagnosis_id
      ) values_by_patient
      WHERE val IS NOT NULL
      GROUP BY patient_id
    ),
    status_stats AS (
      SELECT
        mv.patient_id,
        array_agg(DISTINCT mv.consultation_status) AS status_vals
      FROM matching_visits mv
      JOIN candidate_patients cp ON cp.id = mv.patient_id
      GROUP BY mv.patient_id
    ),
    doctor_stats AS (
      SELECT
        mv.patient_id,
        array_agg(DISTINCT val) AS doctor_vals
      FROM (
        SELECT mv.patient_id, COALESCE(NULLIF(btrim(doc.name), ''), prof.full_name) AS val
        FROM matching_visits mv
        JOIN candidate_patients cp ON cp.id = mv.patient_id
        LEFT JOIN public.doctors doc ON doc.id = mv.doctor_id
        LEFT JOIN public.profiles prof ON prof.id = doc.user_id
      ) values_by_patient
      WHERE val IS NOT NULL
      GROUP BY patient_id
    ),
    blood_stats AS (
      SELECT
        mv.patient_id,
        array_agg(DISTINCT COALESCE(NULLIF(btrim(item.item_name), ''), s.name)) AS blood_vals
      FROM matching_visits mv
      JOIN candidate_patients cp ON cp.id = mv.patient_id
      JOIN public.consultation_items item
        ON item.consultation_id = mv.consultation_id
       AND item.deleted_at IS NULL
      JOIN public.services s ON s.id = item.service_id
      WHERE s.category = 'Laboratory Investigation'
        AND COALESCE(NULLIF(btrim(item.item_name), ''), s.name) IS NOT NULL
      GROUP BY mv.patient_id
    ),
    glucose_stats AS (
      SELECT DISTINCT mv.patient_id
      FROM matching_visits mv
      JOIN candidate_patients cp ON cp.id = mv.patient_id
      JOIN public.vital_signs vs
        ON vs.queue_entry_id = mv.queue_entry_id
       AND vs.patient_id = mv.patient_id
      WHERE vs.blood_glucose IS NOT NULL
    ),
    procedure_stats AS (
      SELECT
        mv.patient_id,
        array_agg(DISTINCT COALESCE(NULLIF(btrim(item.item_name), ''), s.name)) AS proc_vals
      FROM matching_visits mv
      JOIN candidate_patients cp ON cp.id = mv.patient_id
      JOIN public.consultation_items item
        ON item.consultation_id = mv.consultation_id
       AND item.deleted_at IS NULL
      JOIN public.services s ON s.id = item.service_id
      WHERE s.category IN ('Procedure', 'General Service', 'Other')
        AND COALESCE(NULLIF(btrim(item.item_name), ''), s.name) IS NOT NULL
      GROUP BY mv.patient_id
    ),
    medicine_stats AS (
      SELECT
        mv.patient_id,
        array_agg(DISTINCT btrim(item.item_name)) AS med_vals
      FROM matching_visits mv
      JOIN candidate_patients cp ON cp.id = mv.patient_id
      JOIN public.consultation_items item
        ON item.consultation_id = mv.consultation_id
       AND item.deleted_at IS NULL
      WHERE item.service_id IS NULL
        AND item.item_id IS NOT NULL
        AND btrim(item.item_name) <> ''
      GROUP BY mv.patient_id
    ),

    -- 4) Join the pre-aggregated values and apply clinical term matching
    --    against the small arrays (per element, case-insensitive).
    filtered_patients AS (
      SELECT
        cp.id,
        cp.name,
        cp.national_id,
        cp.phone,
        cp.address,
        cp.postcode,
        cp.gender,
        cp.date_of_birth,
        vs.visit_dates,
        vs.visit_count,
        ds.diag_vals,
        ss.status_vals,
        docstats.doctor_vals,
        COALESCE(bs.blood_vals, ARRAY[]::text[])
          || CASE WHEN gs.patient_id IS NOT NULL THEN ARRAY['Blood glucose']::text[] ELSE ARRAY[]::text[] END
          AS blood_display,
        gs.patient_id IS NOT NULL AS has_blood_glucose,
        ps.proc_vals,
        ms.med_vals
      FROM candidate_patients cp
      LEFT JOIN visit_stats vs ON vs.patient_id = cp.id
      LEFT JOIN diagnosis_stats ds ON ds.patient_id = cp.id
      LEFT JOIN status_stats ss ON ss.patient_id = cp.id
      LEFT JOIN doctor_stats docstats ON docstats.patient_id = cp.id
      LEFT JOIN blood_stats bs ON bs.patient_id = cp.id
      LEFT JOIN glucose_stats gs ON gs.patient_id = cp.id
      LEFT JOIN procedure_stats ps ON ps.patient_id = cp.id
      LEFT JOIN medicine_stats ms ON ms.patient_id = cp.id
      WHERE (
          cardinality(v_diagnoses) = 0
          OR (
            ds.diag_vals IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM unnest(ds.diag_vals) AS value
              WHERE EXISTS (
                SELECT 1 FROM unnest(v_diagnoses) AS term
                WHERE value ILIKE '%' || term || '%'
              )
            )
          )
        )
        AND (
          cardinality(v_blood_investigations) = 0
          OR (
            (
              bs.blood_vals IS NOT NULL
              AND EXISTS (
                SELECT 1
                FROM unnest(bs.blood_vals) AS value
                WHERE EXISTS (
                  SELECT 1 FROM unnest(v_blood_investigations) AS term
                  WHERE value ILIKE '%' || term || '%'
                )
              )
            )
            OR (gs.patient_id IS NOT NULL AND 'blood glucose' = ANY (v_blood_investigations))
          )
        )
        AND (
          cardinality(v_procedures) = 0
          OR (
            ps.proc_vals IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM unnest(ps.proc_vals) AS value
              WHERE EXISTS (
                SELECT 1 FROM unnest(v_procedures) AS term
                WHERE value ILIKE '%' || term || '%'
              )
            )
          )
        )
        AND (
          cardinality(v_medicines) = 0
          OR (
            ms.med_vals IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM unnest(ms.med_vals) AS value
              WHERE EXISTS (
                SELECT 1 FROM unnest(v_medicines) AS term
                WHERE value ILIKE '%' || term || '%'
              )
            )
          )
        )
        AND (
          cardinality(v_consultation_statuses) = 0
          OR (
            ss.status_vals IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM unnest(ss.status_vals) AS value
              WHERE EXISTS (
                SELECT 1 FROM unnest(v_consultation_statuses) AS term
                WHERE value ILIKE term
              )
            )
          )
        )
        AND (
          cardinality(v_attending_doctors) = 0
          OR (
            docstats.doctor_vals IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM unnest(docstats.doctor_vals) AS value
              WHERE EXISTS (
                SELECT 1 FROM unnest(v_attending_doctors) AS term
                WHERE value ILIKE '%' || term || '%'
              )
            )
          )
        )
    ),

    page_rows AS (
      SELECT
        fp.*,
        count(*) OVER () AS total_count
      FROM filtered_patients fp
      ORDER BY fp.name, fp.id
      LIMIT p_page_size
      OFFSET ((p_page::bigint - 1) * p_page_size)
    )

    SELECT jsonb_build_object(
      'rows',
      COALESCE(
        (
          SELECT jsonb_agg(jsonb_build_object(
            'patient_id', p.id,
            'patient_name', p.name,
            'ic_number', p.national_id,
            'phone', p.phone,
            'address', p.address,
            'postcode', p.postcode,
            'gender', p.gender,
            'date_of_birth', p.date_of_birth,
            'current_age', CASE
              WHEN p.date_of_birth IS NULL THEN NULL
              ELSE extract(year FROM age(current_date, p.date_of_birth))::integer
            END,
            'matching_visit_dates', COALESCE(to_jsonb(p.visit_dates), '[]'::jsonb),
            'visit_count', COALESCE(p.visit_count, 0),
            'diagnoses', COALESCE(to_jsonb(p.diag_vals), '[]'::jsonb),
            'blood_investigations', COALESCE(to_jsonb(p.blood_display), '[]'::jsonb),
            'procedures', COALESCE(to_jsonb(p.proc_vals), '[]'::jsonb),
            'medicines', COALESCE(to_jsonb(p.med_vals), '[]'::jsonb),
            'consultation_statuses', COALESCE(to_jsonb(p.status_vals), '[]'::jsonb),
            'attending_doctors', COALESCE(to_jsonb(p.doctor_vals), '[]'::jsonb)
          ) ORDER BY p.name, p.id)
          FROM page_rows p
        ),
        '[]'::jsonb
      ),
      'total_count', COALESCE((SELECT max(total_count) FROM page_rows), 0),
      'page', p_page,
      'page_size', p_page_size
    )
  );
END
$function$;

REVOKE ALL ON FUNCTION public.search_patient_explorer(jsonb, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_patient_explorer(jsonb, integer, integer) TO authenticated;

COMMENT ON FUNCTION public.search_patient_explorer(jsonb, integer, integer) IS
  'Patient Explorer (perf): candidates resolved by demographics first, clinical values pre-aggregated per patient in grouped passes, terms matched per element with ILIKE. Age filters use age at visit. Statuses case-insensitive exact. SECURITY INVOKER preserves RLS.';
