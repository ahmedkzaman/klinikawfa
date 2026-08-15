-- Rollback-only acceptance fixture for get_clinical_attendance_heatmap.
-- Run after the attendance heatmap migration is applied.

BEGIN;

DO $setup$
BEGIN
  IF EXISTS (
    SELECT 1 FROM auth.users
    WHERE id::text LIKE '72000000-0000-4000-8000-0000000000%'
  ) THEN
    RAISE EXCEPTION 'TEST_UUID_COLLISION';
  END IF;

  INSERT INTO auth.users (
    id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    '72000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'attendance-heatmap-test@example.invalid',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"TEST ONLY ATTENDANCE REPORTER"}'::jsonb,
    now(), now()
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES ('72000000-0000-4000-8000-000000000001', 'staff'::public.app_role);

  INSERT INTO public.doctors (id, name) VALUES
    ('72000000-0000-4000-8000-000000000011', 'TEST ONLY HEATMAP DOCTOR A'),
    ('72000000-0000-4000-8000-000000000012', 'TEST ONLY HEATMAP DOCTOR B');

  INSERT INTO public.patients (id, name, national_id, notes) VALUES
    ('72000000-0000-4000-8000-000000000101', 'TEST ONLY PRIVATE PATIENT', 'TEST-IC-DO-NOT-LEAK', 'TEST-PRIVATE-NOTE-DO-NOT-LEAK');

  INSERT INTO public.saved_rosters (
    id, roster_type, month, year, roster_data, staff_list, warnings, created_by
  ) VALUES
    (
      '72000000-0000-4000-8000-000000000401', 'doctor', 7, 2026,
      '{"2026-07-27":{"DOC_S1":{"staffId":"72000000-0000-4000-8000-000000000011","staffName":"TEST ONLY HEATMAP DOCTOR A"}}}'::jsonb,
      '[]'::jsonb, '[]'::jsonb, '72000000-0000-4000-8000-000000000001'
    ),
    (
      '72000000-0000-4000-8000-000000000402', 'doctor', 8, 2026,
      '{"2026-08-02":{"shift1":{"staffId":"72000000-0000-4000-8000-000000000011","staffName":"TEST ONLY HEATMAP DOCTOR A"},"shift2":{"staffId":"72000000-0000-4000-8000-000000000012","staffName":"TEST ONLY HEATMAP DOCTOR B"}},"2026-08-03":{"DOC_S1":[{"staffId":"72000000-0000-4000-8000-000000000011","staffName":"TEST ONLY HEATMAP DOCTOR A"},{"staffId":"72000000-0000-4000-8000-000000000012","staffName":"TEST ONLY HEATMAP DOCTOR B"}],"DOC_S2":{"staffId":"72000000-0000-4000-8000-000000000012","staffName":"TEST ONLY HEATMAP DOCTOR B"},"DOC_S3":{"staffId":"72000000-0000-4000-8000-000000000012","staffName":"TEST ONLY HEATMAP DOCTOR B"}}}'::jsonb,
      '[]'::jsonb, '[]'::jsonb, '72000000-0000-4000-8000-000000000001'
    );

  INSERT INTO public.queue_entries (
    id, patient_id, assigned_doctor_id, queue_number, visit_type, payment_method,
    created_at, called_at, clinic_status
  ) VALUES
    ('72000000-0000-4000-8000-000000000201', '72000000-0000-4000-8000-000000000101', '72000000-0000-4000-8000-000000000011', 7201, 'consultation', 'cash',    '2026-08-03 00:00:00+00', '2026-08-03 00:10:00+00', 'completed'),
    ('72000000-0000-4000-8000-000000000202', '72000000-0000-4000-8000-000000000101', '72000000-0000-4000-8000-000000000011', 7202, 'consultation', 'card',    '2026-08-03 00:05:00+00', '2026-08-03 00:25:00+00', 'completed'),
    ('72000000-0000-4000-8000-000000000203', '72000000-0000-4000-8000-000000000101', '72000000-0000-4000-8000-000000000011', 7203, 'consultation', 'ewallet', '2026-08-03 00:10:00+00', NULL,                    'completed'),
    ('72000000-0000-4000-8000-000000000204', '72000000-0000-4000-8000-000000000101', '72000000-0000-4000-8000-000000000011', 7204, 'consultation', 'panel',   '2026-08-03 00:15:00+00', NULL,                    'completed'),
    ('72000000-0000-4000-8000-000000000215', '72000000-0000-4000-8000-000000000101', '72000000-0000-4000-8000-000000000011', 7215, 'consultation', 'other',   '2026-08-03 00:18:00+00', NULL,                    'completed'),
    ('72000000-0000-4000-8000-000000000216', '72000000-0000-4000-8000-000000000101', '72000000-0000-4000-8000-000000000011', 7216, 'consultation', 'cash',    '2026-08-10 00:00:00+00', '2026-08-10 00:30:00+00', 'completed'),
    ('72000000-0000-4000-8000-000000000205', '72000000-0000-4000-8000-000000000101', '72000000-0000-4000-8000-000000000011', 7205, 'consultation', 'cash',    '2026-08-03 01:00:00+00', '2026-08-03 00:55:00+00', 'completed'),
    ('72000000-0000-4000-8000-000000000206', '72000000-0000-4000-8000-000000000101', '72000000-0000-4000-8000-000000000011', 7206, 'consultation', 'cash',    '2026-08-02 16:30:00+00', NULL,                    'completed'),
    ('72000000-0000-4000-8000-000000000207', '72000000-0000-4000-8000-000000000101', '72000000-0000-4000-8000-000000000011', 7207, 'payment_only', 'cash',   '2026-08-03 00:20:00+00', NULL,                    'completed'),
    ('72000000-0000-4000-8000-000000000208', '72000000-0000-4000-8000-000000000101', '72000000-0000-4000-8000-000000000011', 7208, 'consultation', 'cash',    '2026-08-03 00:25:00+00', NULL,                    'completed'),
    ('72000000-0000-4000-8000-000000000209', '72000000-0000-4000-8000-000000000101', '72000000-0000-4000-8000-000000000011', 7209, 'consultation', 'cash',    '2026-08-03 00:30:00+00', NULL,                    'completed'),
    ('72000000-0000-4000-8000-000000000210', '72000000-0000-4000-8000-000000000101', '72000000-0000-4000-8000-000000000011', 7210, 'consultation', 'cash',    '2026-08-03 00:35:00+00', NULL,                    'cancelled'),
    ('72000000-0000-4000-8000-000000000211', '72000000-0000-4000-8000-000000000101', '72000000-0000-4000-8000-000000000011', NULL, 'consultation', 'cash',    '2026-08-03 00:40:00+00', NULL,                    'completed'),
    ('72000000-0000-4000-8000-000000000212', '72000000-0000-4000-8000-000000000101', '72000000-0000-4000-8000-000000000011', 7212, 'consultation', 'cash',    '2026-08-03 00:45:00+00', NULL,                    'completed'),
    ('72000000-0000-4000-8000-000000000213', '72000000-0000-4000-8000-000000000101', '72000000-0000-4000-8000-000000000011', 7213, 'consultation', 'cash',    '2026-07-27 00:00:00+00', NULL,                    'completed'),
    ('72000000-0000-4000-8000-000000000214', '72000000-0000-4000-8000-000000000101', '72000000-0000-4000-8000-000000000011', 7214, 'consultation', 'card',    '2026-07-27 00:15:00+00', NULL,                    'completed');

  INSERT INTO public.consultations (
    id, queue_entry_id, patient_id, doctor_id, case_note, diagnosis_text, dispense_note, deleted_at
  ) VALUES
    ('72000000-0000-4000-8000-000000000301', '72000000-0000-4000-8000-000000000201', '72000000-0000-4000-8000-000000000101', '72000000-0000-4000-8000-000000000011', 'TEST-PRIVATE-CASE-NOTE', '', '', NULL),
    ('72000000-0000-4000-8000-000000000302', '72000000-0000-4000-8000-000000000202', '72000000-0000-4000-8000-000000000101', '72000000-0000-4000-8000-000000000011', '', '', '', NULL),
    ('72000000-0000-4000-8000-000000000303', '72000000-0000-4000-8000-000000000203', '72000000-0000-4000-8000-000000000101', '72000000-0000-4000-8000-000000000011', '', '', '', NULL),
    ('72000000-0000-4000-8000-000000000304', '72000000-0000-4000-8000-000000000204', '72000000-0000-4000-8000-000000000101', '72000000-0000-4000-8000-000000000011', '', '', '', NULL),
    ('72000000-0000-4000-8000-000000000315', '72000000-0000-4000-8000-000000000215', '72000000-0000-4000-8000-000000000101', '72000000-0000-4000-8000-000000000011', '', '', '', NULL),
    ('72000000-0000-4000-8000-000000000316', '72000000-0000-4000-8000-000000000216', '72000000-0000-4000-8000-000000000101', '72000000-0000-4000-8000-000000000011', '', '', '', NULL),
    ('72000000-0000-4000-8000-000000000305', '72000000-0000-4000-8000-000000000205', '72000000-0000-4000-8000-000000000101', '72000000-0000-4000-8000-000000000011', '', '', '', NULL),
    ('72000000-0000-4000-8000-000000000306', '72000000-0000-4000-8000-000000000206', '72000000-0000-4000-8000-000000000101', '72000000-0000-4000-8000-000000000011', '', '', '', NULL),
    ('72000000-0000-4000-8000-000000000307', '72000000-0000-4000-8000-000000000207', '72000000-0000-4000-8000-000000000101', '72000000-0000-4000-8000-000000000011', '', '', '', NULL),
    ('72000000-0000-4000-8000-000000000308', '72000000-0000-4000-8000-000000000208', '72000000-0000-4000-8000-000000000101', '72000000-0000-4000-8000-000000000011', '', '', '', now()),
    ('72000000-0000-4000-8000-000000000309', '72000000-0000-4000-8000-000000000209', '72000000-0000-4000-8000-000000000101', '72000000-0000-4000-8000-000000000011', '', '', '', NULL),
    ('72000000-0000-4000-8000-000000000310', '72000000-0000-4000-8000-000000000210', '72000000-0000-4000-8000-000000000101', '72000000-0000-4000-8000-000000000011', '', '', '', NULL),
    ('72000000-0000-4000-8000-000000000311', '72000000-0000-4000-8000-000000000211', '72000000-0000-4000-8000-000000000101', '72000000-0000-4000-8000-000000000011', '', '', '', NULL),
    ('72000000-0000-4000-8000-000000000313', '72000000-0000-4000-8000-000000000213', '72000000-0000-4000-8000-000000000101', '72000000-0000-4000-8000-000000000011', '', '', '', NULL),
    ('72000000-0000-4000-8000-000000000314', '72000000-0000-4000-8000-000000000214', '72000000-0000-4000-8000-000000000101', '72000000-0000-4000-8000-000000000011', '', '', '', NULL);

  UPDATE public.queue_entries
  SET deleted_at = now()
  WHERE id = '72000000-0000-4000-8000-000000000209';
END
$setup$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $verify$
DECLARE
  v_report jsonb;
  v_all_doctors jsonb;
  v_mixed_coverage jsonb;
  v_cell jsonb;
  v_observation jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '72000000-0000-4000-8000-000000000099', true);
  BEGIN
    PERFORM public.get_clinical_attendance_heatmap('2026-08-03', '2026-08-09');
    RAISE EXCEPTION 'UNAUTHORIZED_ATTENDANCE_REPORT_SUCCEEDED';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    IF SQLERRM <> 'NOT_AUTHORIZED' THEN RAISE; END IF;
  END;

  PERFORM set_config('request.jwt.claim.sub', '72000000-0000-4000-8000-000000000001', true);
  BEGIN
    PERFORM public.get_clinical_attendance_heatmap('2026-08-10', '2026-08-09');
    RAISE EXCEPTION 'REVERSED_DATE_RANGE_SUCCEEDED';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM <> 'INVALID_DATE_RANGE' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.get_clinical_attendance_heatmap('2025-01-01', '2026-01-02');
    RAISE EXCEPTION 'OVER_366_DAY_RANGE_SUCCEEDED';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM <> 'INVALID_DATE_RANGE' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.get_clinical_attendance_heatmap('2025-08-16', '2026-08-15');
  EXCEPTION WHEN SQLSTATE '22023' THEN
    RAISE EXCEPTION 'MAXIMUM_INCLUSIVE_RANGE_REJECTED';
  END;
  BEGIN
    PERFORM public.get_clinical_attendance_heatmap('2025-08-15', '2026-08-15');
    RAISE EXCEPTION 'OVER_MAXIMUM_INCLUSIVE_RANGE_SUCCEEDED';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM <> 'INVALID_DATE_RANGE' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.get_clinical_attendance_heatmap(NULL, '2026-08-09');
    RAISE EXCEPTION 'NULL_START_DATE_SUCCEEDED';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM <> 'INVALID_DATE_RANGE' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.get_clinical_attendance_heatmap('2026-08-03', NULL);
    RAISE EXCEPTION 'NULL_END_DATE_SUCCEEDED';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM <> 'INVALID_DATE_RANGE' THEN RAISE; END IF;
  END;

  v_report := public.get_clinical_attendance_heatmap(
    '2026-08-03', '2026-08-09', '72000000-0000-4000-8000-000000000011'
  );
  v_all_doctors := public.get_clinical_attendance_heatmap('2026-08-03', '2026-08-09');
  v_mixed_coverage := public.get_clinical_attendance_heatmap(
    '2026-08-03', '2026-08-16', '72000000-0000-4000-8000-000000000011'
  );

  IF v_report->'period' IS DISTINCT FROM jsonb_build_object(
    'startDate', '2026-08-03'::date,
    'endDate', '2026-08-09'::date,
    'comparisonStartDate', '2026-07-27'::date,
    'comparisonEndDate', '2026-08-02'::date,
    'timezone', 'Asia/Kuala_Lumpur'
  ) THEN RAISE EXCEPTION 'PERIOD_BOUNDARIES_MISMATCH'; END IF;

  IF jsonb_array_length(v_report->'cells') IS DISTINCT FROM 112 THEN
    RAISE EXCEPTION 'WEEKDAY_HOUR_GRID_MISSING';
  END IF;

  SELECT value INTO STRICT v_cell
  FROM jsonb_array_elements(v_report->'cells')
  WHERE value->>'weekday' = '1' AND value->>'hour' = '8';
  IF (v_cell->>'totalVisits')::integer IS DISTINCT FROM 5
     OR (v_cell->>'rawTotalVisits')::integer IS DISTINCT FROM 5
     OR (v_cell->>'operatingOccurrences')::integer IS DISTINCT FROM 1
     OR (v_cell->>'averageVisits')::numeric IS DISTINCT FROM 5
     OR (v_cell->>'medianVisits')::numeric IS DISTINCT FROM 5
     OR (v_cell->>'peakVisits')::integer IS DISTINCT FROM 5
     OR (v_cell->>'waitMeasuredVisits')::integer IS DISTINCT FROM 2
     OR (v_cell->>'averageWaitMinutes')::numeric IS DISTINCT FROM 15
     OR (v_cell->>'comparisonAverageVisits')::numeric IS DISTINCT FROM 2
     OR (v_cell->>'otherDoctorCoveredOccurrences')::integer IS DISTINCT FROM 1
     OR v_cell->>'coverage' IS DISTINCT FROM 'insufficient' THEN
    RAISE EXCEPTION 'QUALIFYING_PAYMENT_OR_COMPARISON_AGGREGATE_MISMATCH';
  END IF;

  SELECT value INTO STRICT v_cell
  FROM jsonb_array_elements(v_report->'cells')
  WHERE value->>'weekday' = '1' AND value->>'hour' = '9';
  IF (v_cell->>'totalVisits')::integer IS DISTINCT FROM 1
     OR (v_cell->>'waitMeasuredVisits')::integer IS DISTINCT FROM 0
     OR v_cell->>'averageWaitMinutes' IS NOT NULL THEN
    RAISE EXCEPTION 'INVALID_WAIT_WAS_MEASURED';
  END IF;

  SELECT value INTO STRICT v_cell
  FROM jsonb_array_elements(v_all_doctors->'cells')
  WHERE value->>'weekday' = '7' AND value->>'hour' = '16';
  IF (v_cell->>'comparisonAverageVisits')::numeric IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'MALAYSIA_MIDNIGHT_USED_UTC_DATE_OR_HOUR';
  END IF;

  SELECT value INTO STRICT v_cell
  FROM jsonb_array_elements(v_report->'cells')
  WHERE value->>'weekday' = '1' AND value->>'hour' = '14';
  IF (v_cell->>'operatingOccurrences')::integer IS DISTINCT FROM 0
     OR (v_cell->>'otherDoctorCoveredOccurrences')::integer IS DISTINCT FROM 0
     OR v_cell->>'coverage' IS DISTINCT FROM 'uncovered' THEN
    RAISE EXCEPTION 'SELECTED_DOCTOR_ROSTER_DENOMINATOR_MISMATCH';
  END IF;

  SELECT value INTO STRICT v_cell
  FROM jsonb_array_elements(v_all_doctors->'cells')
  WHERE value->>'weekday' = '1' AND value->>'hour' = '14';
  IF (v_cell->>'operatingOccurrences')::integer IS DISTINCT FROM 1
     OR (v_cell->>'otherDoctorCoveredOccurrences')::integer IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'ALL_DOCTOR_ROSTER_DENOMINATOR_MISMATCH';
  END IF;

  SELECT value INTO STRICT v_cell
  FROM jsonb_array_elements(v_all_doctors->'cells')
  WHERE value->>'weekday' = '1' AND value->>'hour' = '23';
  IF (v_cell->>'operatingOccurrences')::integer IS DISTINCT FROM 1
     OR v_cell->>'coverage' IS DISTINCT FROM 'insufficient' THEN
    RAISE EXCEPTION 'S3_ROSTER_COVERAGE_MISMATCH';
  END IF;

  SELECT value INTO STRICT v_cell
  FROM jsonb_array_elements(v_mixed_coverage->'cells')
  WHERE value->>'weekday' = '1' AND value->>'hour' = '8';
  IF (v_cell->>'totalVisits')::integer IS DISTINCT FROM 5
     OR (v_cell->>'rawTotalVisits')::integer IS DISTINCT FROM 6
     OR (v_cell->>'operatingOccurrences')::integer IS DISTINCT FROM 1
     OR (v_cell->>'averageVisits')::numeric IS DISTINCT FROM 5
     OR (v_cell->>'medianVisits')::numeric IS DISTINCT FROM 5
     OR (v_cell->>'peakVisits')::integer IS DISTINCT FROM 5
     OR (v_cell->>'waitMeasuredVisits')::integer IS DISTINCT FROM 2
     OR (v_cell->>'averageWaitMinutes')::numeric IS DISTINCT FROM 15
     OR jsonb_array_length(v_cell->'dates') IS DISTINCT FROM 1
     OR v_cell->'dates'->0->>'date' IS DISTINCT FROM '2026-08-03'
     OR v_cell->>'coverage' IS DISTINCT FROM 'insufficient' THEN
    RAISE EXCEPTION 'OUTSIDE_OPERATING_COVERAGE_MISMATCH';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_report->'observations')
    WHERE value->>'date' = '2026-08-03' AND value->>'hour' = '14'
  ) THEN
    RAISE EXCEPTION 'CLOSED_OR_UNCOVERED_OBSERVATION_PRESENT';
  END IF;

  SELECT value INTO STRICT v_observation
  FROM jsonb_array_elements(v_report->'observations')
  WHERE value->>'date' = '2026-08-03' AND value->>'hour' = '10';
  IF (v_observation->>'visits')::integer IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'OPERATING_ZERO_VISIT_OBSERVATION_MISSING';
  END IF;

  SELECT value INTO STRICT v_observation
  FROM jsonb_array_elements(v_all_doctors->'observations')
  WHERE value->>'date' = '2026-08-03' AND value->>'hour' = '8';
  IF (v_observation->>'doctorsRostered')::integer IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'S1_DOCTORS_ROSTERED_MISMATCH';
  END IF;

  SELECT value INTO STRICT v_observation
  FROM jsonb_array_elements(v_all_doctors->'observations')
  WHERE value->>'date' = '2026-08-03' AND value->>'hour' = '14';
  IF (v_observation->>'doctorsRostered')::integer IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'S2_DOCTORS_ROSTERED_MISMATCH';
  END IF;

  SELECT value INTO STRICT v_observation
  FROM jsonb_array_elements(v_all_doctors->'observations')
  WHERE value->>'date' = '2026-08-03' AND value->>'hour' = '20';
  IF (v_observation->>'doctorsRostered')::integer IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'S3_DOCTORS_ROSTERED_MISMATCH';
  END IF;

  SELECT value INTO STRICT v_observation
  FROM jsonb_array_elements(v_report->'observations')
  WHERE value->>'date' = '2026-08-03' AND value->>'hour' = '8';
  IF (v_observation->>'doctorsRostered')::integer IS DISTINCT FROM 2
     OR (v_observation->>'selectedDoctorScheduled')::boolean IS DISTINCT FROM true
     OR (v_observation->>'backupDoctorCovered')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'DOCTOR_FILTERED_OBSERVATION_COVERAGE_MISMATCH';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_report->'observations') AS observation(value)
    WHERE observation.value ?| ARRAY[
      'queueEntryId', 'queue_entry_id', 'patientId', 'patient_id',
      'patientName', 'patient_name', 'icNo', 'nationalId',
      'consultationNotes', 'consultation_notes'
    ]
  ) THEN
    RAISE EXCEPTION 'OBSERVATION_PRIVACY_LEAK';
  END IF;

  IF v_report::text LIKE '%TEST ONLY PRIVATE PATIENT%'
     OR v_report::text LIKE '%TEST-IC-DO-NOT-LEAK%'
     OR v_report::text LIKE '%TEST-PRIVATE-NOTE-DO-NOT-LEAK%'
     OR v_report::text LIKE '%TEST-PRIVATE-CASE-NOTE%'
     OR v_report::text LIKE '%72000000-0000-4000-8000-000000000201%' THEN
    RAISE EXCEPTION 'ROW_LEVEL_PRIVACY_LEAK';
  END IF;

  IF NOT (v_report ? 'warnings') OR jsonb_typeof(v_report->'warnings') <> 'array' THEN
    RAISE EXCEPTION 'WARNINGS_MISSING';
  END IF;
END
$verify$;

RESET ROLE;
ROLLBACK;

SELECT jsonb_build_object(
  'status', 'pass',
  'database_role', 'authenticated',
  'payment_methods_and_repeat_visits', 'pass',
  'exclusions', 'pass',
  'malaysia_midnight', 'pass',
  'waiting_validity', 'pass',
  'roster_denominators', 'pass',
  'model_observations', 'pass',
  'comparison', 'pass',
  'aggregate_privacy', 'pass',
  'transaction_end', 'ROLLBACK'
) AS attendance_heatmap_verification;
