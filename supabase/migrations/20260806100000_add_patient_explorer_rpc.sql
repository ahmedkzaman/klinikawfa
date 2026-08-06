BEGIN;

DO $preflight$
DECLARE
  rls_table_count integer;
BEGIN
  IF to_regprocedure('public.is_staff_or_clinical(uuid)') IS NULL THEN
    RAISE EXCEPTION 'patient explorer preflight failed: clinic access helper is missing';
  END IF;

  SELECT count(*)
    INTO rls_table_count
    FROM pg_catalog.pg_class relation
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
   WHERE namespace.nspname = 'public'
     AND relation.relname IN (
       'patients',
       'queue_entries',
       'consultations',
       'consultation_items',
       'services',
       'diagnoses',
       'vital_signs',
       'doctors',
       'profiles'
     )
     AND relation.relrowsecurity;

  IF rls_table_count <> 9 THEN
    RAISE EXCEPTION 'patient explorer preflight failed: source-table RLS is not enabled';
  END IF;
END
$preflight$;

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
  IF date_mode NOT IN ('all_time', 'custom') THEN
    RAISE EXCEPTION 'date mode must be all_time or custom' USING ERRCODE = '22023';
  END IF;

  IF date_mode = 'custom' THEN
    start_date_text := btrim(COALESCE(filters ->> 'startDate', ''));
    end_date_text := btrim(COALESCE(filters ->> 'endDate', ''));

    IF start_date_text !~ '^\\d{4}-\\d{2}-\\d{2}$'
       OR end_date_text !~ '^\\d{4}-\\d{2}-\\d{2}$' THEN
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
     AND (filters ->> 'ageMin' !~ '^\\d+$') THEN
    RAISE EXCEPTION 'minimum age must be an integer' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(filters ->> 'ageMax', '') IS NOT NULL
     AND (filters ->> 'ageMax' !~ '^\\d+$') THEN
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
    WITH matching_visits AS (
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
    filtered_patients AS (
      SELECT
        p.id,
        p.name,
        p.national_id,
        p.phone,
        p.address,
        p.gender,
        p.date_of_birth
      FROM public.patients p
      WHERE (v_patient_name = '' OR p.name ILIKE '%' || v_patient_name || '%')
        AND (v_ic_number = '' OR COALESCE(p.national_id, '') ILIKE '%' || v_ic_number || '%')
        AND (v_phone = '' OR COALESCE(p.phone, '') ILIKE '%' || v_phone || '%')
        AND (v_address = '' OR COALESCE(p.address, '') ILIKE '%' || v_address || '%')
        AND (v_postcode = '' OR COALESCE(p.address, '') ILIKE '%' || v_postcode || '%')
        AND (v_gender = '' OR COALESCE(p.gender, '') ILIKE v_gender)
        AND (
          date_mode = 'all_time'
          OR EXISTS (SELECT 1 FROM matching_visits visit WHERE visit.patient_id = p.id)
        )
        AND (
          (v_age_min IS NULL AND v_age_max IS NULL)
          OR EXISTS (
            SELECT 1
            FROM matching_visits visit
            WHERE visit.patient_id = p.id
              AND p.date_of_birth IS NOT NULL
              AND (v_age_min IS NULL OR extract(year FROM age(visit.visit_date, p.date_of_birth)) >= v_age_min)
              AND (v_age_max IS NULL OR extract(year FROM age(visit.visit_date, p.date_of_birth)) <= v_age_max)
          )
        )
        AND (
          cardinality(v_diagnoses) = 0
          OR EXISTS (
            SELECT 1
            FROM matching_visits visit
            LEFT JOIN public.diagnoses diagnosis ON diagnosis.id = visit.diagnosis_id
            WHERE visit.patient_id = p.id
              AND lower(COALESCE(NULLIF(btrim(visit.diagnosis_text), ''), diagnosis.name, '')) = ANY (v_diagnoses)
          )
        )
        AND (
          cardinality(v_blood_investigations) = 0
          OR EXISTS (
            SELECT 1
            FROM matching_visits visit
            JOIN public.consultation_items item
              ON item.consultation_id = visit.consultation_id
             AND item.deleted_at IS NULL
            LEFT JOIN public.services s ON s.id = item.service_id
            WHERE visit.patient_id = p.id
              AND s.category = 'Laboratory Investigation'
              AND lower(COALESCE(NULLIF(btrim(item.item_name), ''), s.name, '')) = ANY (v_blood_investigations)
            UNION ALL
            SELECT 1
            FROM matching_visits visit
            JOIN public.vital_signs vital_sign
              ON vital_sign.queue_entry_id = visit.queue_entry_id
             AND vital_sign.patient_id = visit.patient_id
            WHERE visit.patient_id = p.id
              AND vital_sign.blood_glucose IS NOT NULL
              AND 'blood glucose' = ANY (v_blood_investigations)
          )
        )
        AND (
          cardinality(v_procedures) = 0
          OR EXISTS (
            SELECT 1
            FROM matching_visits visit
            JOIN public.consultation_items item
              ON item.consultation_id = visit.consultation_id
             AND item.deleted_at IS NULL
            JOIN public.services s ON s.id = item.service_id
            WHERE visit.patient_id = p.id
              AND s.category IN ('Procedure', 'General Service', 'Other')
              AND lower(COALESCE(NULLIF(btrim(item.item_name), ''), s.name, '')) = ANY (v_procedures)
          )
        )
        AND (
          cardinality(v_medicines) = 0
          OR EXISTS (
            SELECT 1
            FROM matching_visits visit
            JOIN public.consultation_items item
              ON item.consultation_id = visit.consultation_id
             AND item.deleted_at IS NULL
            WHERE visit.patient_id = p.id
              AND item.service_id IS NULL
              AND item.item_id IS NOT NULL
              AND lower(btrim(item.item_name)) = ANY (v_medicines)
          )
        )
        AND (
          cardinality(v_consultation_statuses) = 0
          OR EXISTS (
            SELECT 1
            FROM matching_visits visit
            WHERE visit.patient_id = p.id
              AND lower(visit.consultation_status) = ANY (v_consultation_statuses)
          )
        )
        AND (
          cardinality(v_attending_doctors) = 0
          OR EXISTS (
            SELECT 1
            FROM matching_visits visit
            LEFT JOIN public.doctors doctor ON doctor.id = visit.doctor_id
            LEFT JOIN public.profiles profile ON profile.id = doctor.user_id
            WHERE visit.patient_id = p.id
              AND lower(COALESCE(NULLIF(btrim(doctor.name), ''), profile.full_name, '')) = ANY (v_attending_doctors)
          )
        )
      GROUP BY p.id
    ),
    page_rows AS (
      SELECT
        p.*,
        count(*) OVER () AS total_count
      FROM filtered_patients p
      ORDER BY p.name, p.id
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
            'postcode', (regexp_match(p.address, '\\m[0-9]{5}\\M'))[1],
            'gender', p.gender,
            'date_of_birth', p.date_of_birth,
            'current_age', CASE
              WHEN p.date_of_birth IS NULL THEN NULL
              ELSE extract(year FROM age(current_date, p.date_of_birth))::integer
            END,
            'matching_visit_dates', COALESCE((
              SELECT jsonb_agg(value ORDER BY value)
              FROM (
                SELECT DISTINCT to_char(visit.visit_date, 'YYYY-MM-DD') AS value
                FROM matching_visits visit
                WHERE visit.patient_id = p.id
              ) visit_dates
            ), '[]'::jsonb),
            'visit_count', (
              SELECT count(DISTINCT visit.queue_entry_id)
              FROM matching_visits visit
              WHERE visit.patient_id = p.id
            ),
            'diagnoses', COALESCE((
              SELECT jsonb_agg(value ORDER BY value)
              FROM (
                SELECT DISTINCT COALESCE(NULLIF(btrim(visit.diagnosis_text), ''), diagnosis.name) AS value
                FROM matching_visits visit
                LEFT JOIN public.diagnoses diagnosis ON diagnosis.id = visit.diagnosis_id
                WHERE visit.patient_id = p.id
              ) diagnosis_values
              WHERE value IS NOT NULL
            ), '[]'::jsonb),
            'blood_investigations', COALESCE((
              SELECT jsonb_agg(value ORDER BY value)
              FROM (
                SELECT DISTINCT COALESCE(NULLIF(btrim(item.item_name), ''), s.name) AS value
                FROM matching_visits visit
                JOIN public.consultation_items item
                  ON item.consultation_id = visit.consultation_id
                 AND item.deleted_at IS NULL
                JOIN public.services s ON s.id = item.service_id
                WHERE visit.patient_id = p.id
                  AND s.category = 'Laboratory Investigation'
                UNION
                SELECT 'Blood glucose' AS value
                FROM matching_visits visit
                JOIN public.vital_signs vital_sign
                  ON vital_sign.queue_entry_id = visit.queue_entry_id
                 AND vital_sign.patient_id = visit.patient_id
                WHERE visit.patient_id = p.id
                  AND vital_sign.blood_glucose IS NOT NULL
              ) blood_values
              WHERE value IS NOT NULL
            ), '[]'::jsonb),
            'procedures', COALESCE((
              SELECT jsonb_agg(value ORDER BY value)
              FROM (
                SELECT DISTINCT COALESCE(NULLIF(btrim(item.item_name), ''), s.name) AS value
                FROM matching_visits visit
                JOIN public.consultation_items item
                  ON item.consultation_id = visit.consultation_id
                 AND item.deleted_at IS NULL
                JOIN public.services s ON s.id = item.service_id
                WHERE visit.patient_id = p.id
                  AND s.category IN ('Procedure', 'General Service', 'Other')
              ) procedure_values
              WHERE value IS NOT NULL
            ), '[]'::jsonb),
            'medicines', COALESCE((
              SELECT jsonb_agg(value ORDER BY value)
              FROM (
                SELECT DISTINCT NULLIF(btrim(item.item_name), '') AS value
                FROM matching_visits visit
                JOIN public.consultation_items item
                  ON item.consultation_id = visit.consultation_id
                 AND item.deleted_at IS NULL
                WHERE visit.patient_id = p.id
                  AND item.service_id IS NULL
                  AND item.item_id IS NOT NULL
              ) medicine_values
              WHERE value IS NOT NULL
            ), '[]'::jsonb),
            'consultation_statuses', COALESCE((
              SELECT jsonb_agg(value ORDER BY value)
              FROM (
                SELECT DISTINCT visit.consultation_status AS value
                FROM matching_visits visit
                WHERE visit.patient_id = p.id
              ) status_values
            ), '[]'::jsonb),
            'attending_doctors', COALESCE((
              SELECT jsonb_agg(value ORDER BY value)
              FROM (
                SELECT DISTINCT COALESCE(NULLIF(btrim(doctor.name), ''), profile.full_name) AS value
                FROM matching_visits visit
                LEFT JOIN public.doctors doctor ON doctor.id = visit.doctor_id
                LEFT JOIN public.profiles profile ON profile.id = doctor.user_id
                WHERE visit.patient_id = p.id
              ) doctor_values
              WHERE value IS NOT NULL
            ), '[]'::jsonb)
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

COMMIT;
