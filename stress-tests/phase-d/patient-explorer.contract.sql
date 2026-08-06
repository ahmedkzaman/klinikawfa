-- Patient Explorer PostgreSQL integration contract.
-- Run with psql against a non-production database. The migrations are loaded
-- before the rollback-only fixture transaction so this tests the deployed RPC.
\set ON_ERROR_STOP on

\ir ../../supabase/migrations/20260806100000_add_patient_explorer_rpc.sql
\ir ../../supabase/migrations/20260806110000_fix_patient_explorer_postcode_and_validation.sql

BEGIN;

DO $contract$
DECLARE
  internal_user_id uuid;
  patient_id constant uuid := 'ae100001-0000-4000-8000-000000000001';
  queue_entry_one_id constant uuid := 'ae100002-0000-4000-8000-000000000001';
  queue_entry_two_id constant uuid := 'ae100003-0000-4000-8000-000000000001';
  consultation_one_id constant uuid := 'ae100004-0000-4000-8000-000000000001';
  consultation_two_id constant uuid := 'ae100005-0000-4000-8000-000000000001';
  request_date text := to_char(current_date, 'YYYY-MM-DD');
  all_time_response jsonb;
  custom_response jsonb;
  age_response jsonb;
  row_value jsonb;
BEGIN
  SELECT user_id
    INTO internal_user_id
    FROM public.user_roles
   WHERE public.is_staff_or_clinical(user_id)
   LIMIT 1;

  IF internal_user_id IS NULL THEN
    RAISE EXCEPTION 'patient explorer contract requires an internal fixture user';
  END IF;

  INSERT INTO public.patients (id, name, date_of_birth, postcode)
  VALUES (
    patient_id,
    'Patient Explorer Contract Fixture',
    (current_date - interval '35 years')::date,
    '68000'
  );

  INSERT INTO public.queue_entries (id, patient_id, created_at)
  VALUES
    (queue_entry_one_id, patient_id, current_timestamp),
    (queue_entry_two_id, patient_id, current_timestamp);

  INSERT INTO public.consultations (id, queue_entry_id, patient_id)
  VALUES
    (consultation_one_id, queue_entry_one_id, patient_id),
    (consultation_two_id, queue_entry_two_id, patient_id);

  PERFORM set_config('request.jwt.claim.sub', internal_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', internal_user_id, 'role', 'authenticated')::text,
    true
  );

  all_time_response := public.search_patient_explorer(
    jsonb_build_object('dateMode', 'all_time', 'postcode', '68000'),
    1,
    25
  );
  row_value := all_time_response -> 'rows' -> 0;
  IF jsonb_array_length(all_time_response -> 'rows') <> 1
     OR (all_time_response ->> 'total_count')::integer <> 1
     OR row_value ->> 'patient_id' <> patient_id::text
     OR row_value ->> 'postcode' <> '68000'
     OR (row_value ->> 'visit_count')::integer <> 2 THEN
    RAISE EXCEPTION 'all_time request did not return one patient row with the stored postcode';
  END IF;

  custom_response := public.search_patient_explorer(
    jsonb_build_object(
      'dateMode', 'custom',
      'startDate', request_date,
      'endDate', request_date,
      'postcode', '68000'
    ),
    1,
    25
  );
  IF jsonb_array_length(custom_response -> 'rows') <> 1
     OR custom_response -> 'rows' -> 0 ->> 'patient_id' <> patient_id::text THEN
    RAISE EXCEPTION 'valid custom date request did not return the fixture patient';
  END IF;

  age_response := public.search_patient_explorer(
    jsonb_build_object(
      'dateMode', 'all_time',
      'ageMin', '34',
      'ageMax', '36',
      'postcode', '68000'
    ),
    1,
    25
  );
  IF jsonb_array_length(age_response -> 'rows') <> 1
     OR age_response -> 'rows' -> 0 ->> 'patient_id' <> patient_id::text THEN
    RAISE EXCEPTION 'valid age filter did not return the fixture patient';
  END IF;

  BEGIN
    PERFORM public.search_patient_explorer('{}'::jsonb, 1, 25);
    RAISE EXCEPTION 'missing dateMode request was accepted';
  EXCEPTION
    WHEN SQLSTATE '22023' THEN
      IF SQLERRM <> 'date mode must be all_time or custom' THEN
        RAISE;
      END IF;
  END;

  BEGIN
    PERFORM public.search_patient_explorer(
      jsonb_build_object(
        'dateMode', 'custom',
        'startDate', request_date,
        'endDate', to_char(current_date - 1, 'YYYY-MM-DD')
      ),
      1,
      25
    );
    RAISE EXCEPTION 'invalid date range request was accepted';
  EXCEPTION
    WHEN SQLSTATE '22023' THEN
      IF SQLERRM <> 'end date must not be before start date' THEN
        RAISE;
      END IF;
  END;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', 'anon', true);
  PERFORM set_config('request.jwt.claims', '{}'::jsonb::text, true);
  BEGIN
    PERFORM public.search_patient_explorer(
      jsonb_build_object('dateMode', 'all_time'),
      1,
      25
    );
    RAISE EXCEPTION 'anonymous request was accepted';
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      IF SQLERRM <> 'NOT_AUTHORIZED' THEN
        RAISE;
      END IF;
  END;
END
$contract$;

ROLLBACK;
