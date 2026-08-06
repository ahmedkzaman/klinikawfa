-- Rollback-only integration verification for the guarded Yezza RPC pathway.
-- Run only after the Yezza identity and guarded-import migrations in a
-- non-production Supabase database. This script never commits fixture data.

BEGIN;

DO $collision_check$
BEGIN
  IF EXISTS (
    SELECT 1 FROM auth.users
    WHERE id::text LIKE '76000000-0000-4000-8000-0000000000%'
  ) OR to_regprocedure('public.yezza_import_test_force_payment_failure()') IS NOT NULL THEN
    RAISE EXCEPTION 'YEZZA_IMPORT_RPC_TEST_OBJECT_COLLISION';
  END IF;
END;
$collision_check$;

INSERT INTO auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) VALUES
  ('76000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'yezza-rpc-admin@example.invalid',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"TEST ONLY YEZZA RPC ADMIN"}'::jsonb, now(), now()),
  ('76000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'yezza-rpc-doctor-admin@example.invalid',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"TEST ONLY YEZZA RPC DOCTOR ADMIN"}'::jsonb, now(), now()),
  ('76000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
   'yezza-rpc-staff@example.invalid',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"TEST ONLY YEZZA RPC STAFF"}'::jsonb, now(), now());

INSERT INTO public.user_roles (user_id, role) VALUES
  ('76000000-0000-4000-8000-000000000001', 'admin'::public.app_role),
  ('76000000-0000-4000-8000-000000000002', 'doctor_admin'::public.app_role),
  ('76000000-0000-4000-8000-000000000003', 'staff'::public.app_role);

DO $grants_and_rls$
DECLARE
  v_table text;
BEGIN
  IF has_function_privilege(
    'authenticated',
    'public.approve_yezza_import(uuid,text,text,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ) OR has_function_privilege(
    'authenticated',
    'public.apply_yezza_import(uuid,uuid,text,jsonb)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'AUTHENTICATED_RPC_EXECUTE_WAS_GRANTED';
  END IF;
  IF NOT has_function_privilege(
    'service_role',
    'public.approve_yezza_import(uuid,text,text,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role',
    'public.apply_yezza_import(uuid,uuid,text,jsonb)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'SERVICE_ROLE_RPC_EXECUTE_MISSING';
  END IF;

  FOREACH v_table IN ARRAY ARRAY[
    'import_batches', 'patient_external_ids',
    'visit_external_ids', 'transaction_external_ids'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_class AS relation
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname = v_table
        AND relation.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'RLS_NOT_ENABLED:%', v_table;
    END IF;
  END LOOP;
END;
$grants_and_rls$;

-- A ledger row with matching summary evidence but no approval must still fail
-- at the status gate.
INSERT INTO public.import_batches (
  id, source_system, source_batch_id, status, source_counts, review_counts,
  review_artifacts, payload_hash, created_by
) VALUES (
  '76000000-0000-4000-8000-000000000201',
  'yezza', 'sql-unapproved', 'running',
  '{"patients":0,"visits":0,"consultations":0,"consultationItems":0,"transactions":0,"payments":0}'::jsonb,
  '{"patientReview":0,"unresolvedDoctors":0,"orphanFinancialVisits":0}'::jsonb,
  '["patient_matches.csv","summary.json"]'::jsonb,
  repeat('0', 64),
  '76000000-0000-4000-8000-000000000001'
);

DO $unapproved_apply$
BEGIN
  BEGIN
    PERFORM public.apply_yezza_import(
      '76000000-0000-4000-8000-000000000201',
      '76000000-0000-4000-8000-000000000001',
      repeat('0', 64),
      '{"sourceBatchId":"sql-unapproved","reviewCounts":{"patientReview":0,"unresolvedDoctors":0,"orphanFinancialVisits":0},"patients":[],"visits":[]}'::jsonb
    );
    RAISE EXCEPTION 'UNAPPROVED_APPLY_SUCCEEDED';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    IF SQLERRM <> 'YEZZA_IMPORT_BATCH_NOT_APPROVED' THEN RAISE; END IF;
  END;
END;
$unapproved_apply$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', '76000000-0000-4000-8000-000000000001', true);

DO $direct_write_denied$
BEGIN
  BEGIN
    INSERT INTO public.import_batches (
      source_system, source_batch_id, status, source_counts, created_by
    ) VALUES (
      'yezza', 'sql-direct-bypass', 'running', '{}'::jsonb,
      '76000000-0000-4000-8000-000000000001'
    );
    RAISE EXCEPTION 'AUTHENTICATED_DIRECT_IMPORT_WRITE_SUCCEEDED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$direct_write_denied$;

SELECT set_config('request.jwt.claim.sub', '76000000-0000-4000-8000-000000000003', true);
DO $staff_rls_denied$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.import_batches;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'STAFF_IMPORT_LEDGER_READ_SUCCEEDED';
  END IF;
END;
$staff_rls_denied$;

RESET ROLE;

-- Apply a real clinical visit. The duplicate bill rows deliberately bypass the
-- Edge normalizer and prove the database source identity still prevents a
-- second payment or transaction identity.
DO $apply_and_retry$
DECLARE
  v_payload jsonb := '{
    "sourceBatchId":"sql-success-1",
    "reviewCounts":{"patientReview":0,"unresolvedDoctors":0,"orphanFinancialVisits":0},
    "patients":[{"sourcePatientId":"sql-patient-1","patient":{"name":"SQL Yezza Patient","nationalId":"SQL-YEZZA-1","dateOfBirth":"1990-01-01"}}],
    "visits":[{
      "sourceVisitId":"sql-visit-1",
      "sourcePatientId":"sql-patient-1",
      "queueEntry":{"clinicStatus":"registered","visitPurpose":"consultation","visitRemarks":"source_system=yezza; source_visit_id=sql-visit-1","isUrgent":false,"createdAt":"2025-01-02T03:04:05Z"},
      "consultation":{"doctorId":null,"caseNote":"SQL historical note","diagnosisText":"","originalConsultedAt":"2025-01-02T03:04:05Z"},
      "items":[{"sourceLine":1,"itemName":"SQL Consultation","quantity":1,"price":35}],
      "transactions":[
        {"sourceBillId":"sql-bill-1","amount":35,"paidAmount":35,"paymentMethod":"cash","paymentType":"self_pay","notes":"SQL Yezza payment"},
        {"sourceBillId":"sql-bill-1","amount":35,"paidAmount":35,"paymentMethod":"cash","paymentType":"self_pay","notes":"SQL Yezza payment"}
      ]
    }]
  }'::jsonb;
  v_approval jsonb;
  v_result jsonb;
  v_batch_id uuid;
  v_queue_id uuid;
  v_count integer;
BEGIN
  v_approval := public.approve_yezza_import(
    '76000000-0000-4000-8000-000000000001',
    'sql-success-1', repeat('a', 64),
    '{"patients":1,"visits":1,"consultations":1,"consultationItems":1,"transactions":2,"payments":2}'::jsonb,
    v_payload->'reviewCounts', '["patient_matches.csv","summary.json"]'::jsonb
  );
  v_batch_id := (v_approval->>'importBatchId')::uuid;
  v_result := public.apply_yezza_import(
    v_batch_id, '76000000-0000-4000-8000-000000000001', repeat('a', 64), v_payload
  );
  IF v_result->>'status' <> 'completed'
     OR (v_result->'importedCounts'->>'paymentsCreated')::integer <> 1
     OR (v_result->'importedCounts'->>'transactionIdentitiesCreated')::integer <> 1
     OR (v_result->'importedCounts'->>'transactionsReused')::integer <> 1 THEN
    RAISE EXCEPTION 'FIRST_APPLY_COUNTS_WRONG:%', v_result;
  END IF;

  SELECT queue_entry_id INTO v_queue_id
  FROM public.visit_external_ids
  WHERE source_system = 'yezza' AND source_visit_id = 'sql-visit-1';
  SELECT count(*) INTO v_count FROM public.payments WHERE queue_entry_id = v_queue_id;
  IF v_count <> 1 THEN RAISE EXCEPTION 'PAYMENT_DEDUPLICATION_FAILED:%', v_count; END IF;
  SELECT count(*) INTO v_count
  FROM public.transaction_external_ids
  WHERE source_system = 'yezza' AND source_bill_id = 'sql-bill-1';
  IF v_count <> 1 THEN RAISE EXCEPTION 'TRANSACTION_IDENTITY_DEDUPLICATION_FAILED:%', v_count; END IF;
  SELECT count(*) INTO v_count
  FROM public.consultation_items AS item
  JOIN public.consultations AS consultation ON consultation.id = item.consultation_id
  WHERE consultation.queue_entry_id = v_queue_id AND item.deleted_at IS NULL;
  IF v_count <> 1 THEN RAISE EXCEPTION 'CONSULTATION_ITEM_COUNT_WRONG:%', v_count; END IF;

  v_result := public.apply_yezza_import(
    v_batch_id, '76000000-0000-4000-8000-000000000002', repeat('a', 64), v_payload
  );
  IF v_result->>'status' <> 'completed' OR (v_result->>'idempotent')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'RETRY_WAS_NOT_IDEMPOTENT:%', v_result;
  END IF;
  SELECT count(*) INTO v_count FROM public.payments WHERE queue_entry_id = v_queue_id;
  IF v_count <> 1 THEN RAISE EXCEPTION 'RETRY_DUPLICATED_PAYMENT:%', v_count; END IF;
END;
$apply_and_retry$;

-- A second batch reuses the existing patient_external_ids binding and creates
-- no duplicate patient row.
DO $patient_reuse$
DECLARE
  v_payload jsonb := '{
    "sourceBatchId":"sql-reuse-1",
    "reviewCounts":{"patientReview":0,"unresolvedDoctors":0,"orphanFinancialVisits":1},
    "patients":[{"sourcePatientId":"sql-patient-1","patient":{"name":"IGNORED DUPLICATE PROFILE"}}],
    "visits":[{
      "sourceVisitId":"sql-visit-2","sourcePatientId":"sql-patient-1",
      "queueEntry":{"clinicStatus":"registered","visitPurpose":"legacy-financial-only","visitRemarks":"legacy_financial_only=true","isUrgent":false},
      "consultation":null,"items":[],
      "transactions":[{"sourceBillId":"sql-bill-2","amount":5,"paidAmount":0,"paymentMethod":"cash","paymentType":"self_pay","notes":"SQL unpaid Yezza bill"}]
    }]
  }'::jsonb;
  v_approval jsonb;
  v_result jsonb;
  v_count integer;
BEGIN
  v_approval := public.approve_yezza_import(
    '76000000-0000-4000-8000-000000000002',
    'sql-reuse-1', repeat('b', 64),
    '{"patients":1,"visits":1,"consultations":0,"consultationItems":0,"transactions":1,"payments":0}'::jsonb,
    v_payload->'reviewCounts',
    '["patient_matches.csv","orphan_financial_visits.csv","summary.json"]'::jsonb
  );
  v_result := public.apply_yezza_import(
    (v_approval->>'importBatchId')::uuid,
    '76000000-0000-4000-8000-000000000002', repeat('b', 64), v_payload
  );
  IF v_result->>'status' <> 'completed'
     OR (v_result->'importedCounts'->>'patientsCreated')::integer <> 0
     OR (v_result->'importedCounts'->>'patientsReused')::integer <> 1 THEN
    RAISE EXCEPTION 'PATIENT_REUSE_FAILED:%', v_result;
  END IF;
  SELECT count(*) INTO v_count FROM public.patients WHERE name = 'SQL Yezza Patient';
  IF v_count <> 1 THEN RAISE EXCEPTION 'PATIENT_REUSE_CREATED_DUPLICATE:%', v_count; END IF;
END;
$patient_reuse$;

-- Prepare a second canonical patient source identity for cross-patient visit
-- reuse rejection.
DO $second_patient_identity$
DECLARE
  v_patient_id uuid;
  v_batch_id uuid;
BEGIN
  INSERT INTO public.patients (name, notes)
  VALUES ('SQL Yezza Other Patient', 'TEST ONLY') RETURNING id INTO v_patient_id;
  SELECT id INTO v_batch_id FROM public.import_batches
  WHERE source_system = 'yezza' AND source_batch_id = 'sql-success-1';
  INSERT INTO public.patient_external_ids (
    source_system, source_patient_id, patient_id, import_batch_id
  ) VALUES ('yezza', 'sql-patient-2', v_patient_id, v_batch_id);
END;
$second_patient_identity$;

-- An existing source identity is immutable. A later payload must not silently
-- redirect it to another otherwise-valid canonical patient.
DO $patient_mapping_remap_rejected$
DECLARE
  v_original_patient_id uuid;
  v_other_patient_id uuid;
  v_payload jsonb;
  v_approval jsonb;
  v_result jsonb;
BEGIN
  SELECT patient_id INTO v_original_patient_id
  FROM public.patient_external_ids
  WHERE source_system = 'yezza' AND source_patient_id = 'sql-patient-1';
  SELECT patient_id INTO v_other_patient_id
  FROM public.patient_external_ids
  WHERE source_system = 'yezza' AND source_patient_id = 'sql-patient-2';
  v_payload := jsonb_build_object(
    'sourceBatchId', 'sql-patient-remap',
    'reviewCounts', '{"patientReview":0,"unresolvedDoctors":0,"orphanFinancialVisits":0}'::jsonb,
    'patients', jsonb_build_array(jsonb_build_object(
      'sourcePatientId', 'sql-patient-1', 'existingPatientId', v_other_patient_id
    )),
    'visits', '[]'::jsonb
  );
  v_approval := public.approve_yezza_import(
    '76000000-0000-4000-8000-000000000001',
    'sql-patient-remap', repeat('9', 64),
    '{"patients":1,"visits":0,"consultations":0,"consultationItems":0,"transactions":0,"payments":0}'::jsonb,
    v_payload->'reviewCounts', '["patient_matches.csv","summary.json"]'::jsonb
  );
  v_result := public.apply_yezza_import(
    (v_approval->>'importBatchId')::uuid,
    '76000000-0000-4000-8000-000000000001', repeat('9', 64), v_payload
  );
  IF v_result->>'status' <> 'failed' THEN
    RAISE EXCEPTION 'PATIENT_MAPPING_REMAP_SUCCEEDED:%', v_result;
  END IF;
  IF (SELECT patient_id FROM public.patient_external_ids
      WHERE source_system = 'yezza' AND source_patient_id = 'sql-patient-1')
     IS DISTINCT FROM v_original_patient_id THEN
    RAISE EXCEPTION 'PATIENT_MAPPING_CHANGED_AFTER_REJECTED_REMAP';
  END IF;
END;
$patient_mapping_remap_rejected$;

DO $mismatched_visit_patient$
DECLARE
  v_other_patient_id uuid;
  v_payload jsonb;
  v_approval jsonb;
  v_result jsonb;
  v_batch_id uuid;
  v_count integer;
BEGIN
  SELECT patient_id INTO v_other_patient_id FROM public.patient_external_ids
  WHERE source_system = 'yezza' AND source_patient_id = 'sql-patient-2';
  v_payload := jsonb_build_object(
    'sourceBatchId', 'sql-mismatch-patient',
    'reviewCounts', '{"patientReview":0,"unresolvedDoctors":0,"orphanFinancialVisits":0}'::jsonb,
    'patients', jsonb_build_array(jsonb_build_object(
      'sourcePatientId', 'sql-patient-2', 'existingPatientId', v_other_patient_id
    )),
    'visits', jsonb_build_array('{
      "sourceVisitId":"sql-visit-1","sourcePatientId":"sql-patient-2",
      "queueEntry":{"clinicStatus":"registered","visitPurpose":"consultation","visitRemarks":"mismatch","isUrgent":false},
      "consultation":{"doctorId":null,"caseNote":"SQL historical note","diagnosisText":"","originalConsultedAt":"2025-01-02T03:04:05Z"},
      "items":[{"sourceLine":1,"itemName":"SQL Consultation","quantity":1,"price":35}],
      "transactions":[{"sourceBillId":"sql-bill-mismatch","amount":35,"paidAmount":35,"paymentMethod":"cash","paymentType":"self_pay","notes":"MUST NOT PERSIST"}]
    }'::jsonb)
  );
  v_approval := public.approve_yezza_import(
    '76000000-0000-4000-8000-000000000001',
    'sql-mismatch-patient', repeat('c', 64),
    '{"patients":1,"visits":1,"consultations":1,"consultationItems":1,"transactions":1,"payments":1}'::jsonb,
    v_payload->'reviewCounts', '["patient_matches.csv","summary.json"]'::jsonb
  );
  v_batch_id := (v_approval->>'importBatchId')::uuid;
  v_result := public.apply_yezza_import(
    v_batch_id, '76000000-0000-4000-8000-000000000001', repeat('c', 64), v_payload
  );
  IF v_result->>'status' <> 'failed' THEN RAISE EXCEPTION 'VISIT_PATIENT_MISMATCH_SUCCEEDED:%', v_result; END IF;
  SELECT count(*) INTO v_count FROM public.transaction_external_ids
  WHERE source_system = 'yezza' AND source_bill_id = 'sql-bill-mismatch';
  IF v_count <> 0 THEN RAISE EXCEPTION 'MISMATCH_PAYMENT_DEPENDENCY_PERSISTED'; END IF;
  IF (SELECT status FROM public.import_batches WHERE id = v_batch_id) <> 'failed' THEN
    RAISE EXCEPTION 'MISMATCH_FAILED_LEDGER_STATUS_MISSING';
  END IF;
END;
$mismatched_visit_patient$;

DO $mismatched_item_shape$
DECLARE
  v_payload jsonb := '{
    "sourceBatchId":"sql-mismatch-items",
    "reviewCounts":{"patientReview":0,"unresolvedDoctors":0,"orphanFinancialVisits":0},
    "patients":[{"sourcePatientId":"sql-patient-1","patient":{"name":"IGNORED"}}],
    "visits":[{
      "sourceVisitId":"sql-visit-1","sourcePatientId":"sql-patient-1",
      "queueEntry":{"clinicStatus":"registered","visitPurpose":"consultation","visitRemarks":"shape mismatch","isUrgent":false},
      "consultation":{"doctorId":null,"caseNote":"SQL historical note","diagnosisText":"","originalConsultedAt":"2025-01-02T03:04:05Z"},
      "items":[{"sourceLine":1,"itemName":"CHANGED ITEM","quantity":1,"price":99}],
      "transactions":[{"sourceBillId":"sql-bill-shape-mismatch","amount":99,"paidAmount":99,"paymentMethod":"cash","paymentType":"self_pay","notes":"MUST NOT PERSIST"}]
    }]
  }'::jsonb;
  v_approval jsonb;
  v_result jsonb;
  v_batch_id uuid;
  v_count integer;
BEGIN
  v_approval := public.approve_yezza_import(
    '76000000-0000-4000-8000-000000000001',
    'sql-mismatch-items', repeat('d', 64),
    '{"patients":1,"visits":1,"consultations":1,"consultationItems":1,"transactions":1,"payments":1}'::jsonb,
    v_payload->'reviewCounts', '["patient_matches.csv","summary.json"]'::jsonb
  );
  v_batch_id := (v_approval->>'importBatchId')::uuid;
  v_result := public.apply_yezza_import(
    v_batch_id, '76000000-0000-4000-8000-000000000001', repeat('d', 64), v_payload
  );
  IF v_result->>'status' <> 'failed' THEN RAISE EXCEPTION 'VISIT_ITEM_SHAPE_MISMATCH_SUCCEEDED:%', v_result; END IF;
  SELECT count(*) INTO v_count FROM public.transaction_external_ids
  WHERE source_system = 'yezza' AND source_bill_id = 'sql-bill-shape-mismatch';
  IF v_count <> 0 THEN RAISE EXCEPTION 'SHAPE_MISMATCH_PAYMENT_DEPENDENCY_PERSISTED'; END IF;
END;
$mismatched_item_shape$;

CREATE FUNCTION public.yezza_import_test_force_payment_failure()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NEW.notes = 'YEZZA_TEST_FORCE_ROLLBACK' THEN
    RAISE EXCEPTION 'YEZZA_TEST_FORCED_PAYMENT_FAILURE' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER yezza_import_test_force_payment_failure
  BEFORE INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.yezza_import_test_force_payment_failure();

DO $forced_constraint_rollback$
DECLARE
  v_payload jsonb := '{
    "sourceBatchId":"sql-forced-rollback",
    "reviewCounts":{"patientReview":0,"unresolvedDoctors":0,"orphanFinancialVisits":0},
    "patients":[{"sourcePatientId":"sql-patient-rollback","patient":{"name":"SQL MUST ROLLBACK"}}],
    "visits":[{
      "sourceVisitId":"sql-visit-rollback","sourcePatientId":"sql-patient-rollback",
      "queueEntry":{"clinicStatus":"registered","visitPurpose":"consultation","visitRemarks":"rollback fixture","isUrgent":false},
      "consultation":{"doctorId":null,"caseNote":"ROLLBACK","diagnosisText":"","originalConsultedAt":"2025-02-03T04:05:06Z"},
      "items":[{"sourceLine":1,"itemName":"ROLLBACK ITEM","quantity":1,"price":10}],
      "transactions":[{"sourceBillId":"sql-bill-rollback","amount":10,"paidAmount":10,"paymentMethod":"cash","paymentType":"self_pay","notes":"YEZZA_TEST_FORCE_ROLLBACK"}]
    }]
  }'::jsonb;
  v_approval jsonb;
  v_result jsonb;
  v_batch_id uuid;
  v_count integer;
BEGIN
  v_approval := public.approve_yezza_import(
    '76000000-0000-4000-8000-000000000002',
    'sql-forced-rollback', repeat('e', 64),
    '{"patients":1,"visits":1,"consultations":1,"consultationItems":1,"transactions":1,"payments":1}'::jsonb,
    v_payload->'reviewCounts', '["patient_matches.csv","summary.json"]'::jsonb
  );
  v_batch_id := (v_approval->>'importBatchId')::uuid;
  v_result := public.apply_yezza_import(
    v_batch_id, '76000000-0000-4000-8000-000000000002', repeat('e', 64), v_payload
  );
  IF v_result->>'status' <> 'failed' THEN RAISE EXCEPTION 'FORCED_ROLLBACK_SUCCEEDED:%', v_result; END IF;

  SELECT count(*) INTO v_count FROM public.patient_external_ids
  WHERE source_system = 'yezza' AND source_patient_id = 'sql-patient-rollback';
  IF v_count <> 0 THEN RAISE EXCEPTION 'ROLLBACK_LEFT_PATIENT_IDENTITY'; END IF;
  SELECT count(*) INTO v_count FROM public.patients WHERE name = 'SQL MUST ROLLBACK';
  IF v_count <> 0 THEN RAISE EXCEPTION 'ROLLBACK_LEFT_PATIENT'; END IF;
  SELECT count(*) INTO v_count FROM public.visit_external_ids
  WHERE source_system = 'yezza' AND source_visit_id = 'sql-visit-rollback';
  IF v_count <> 0 THEN RAISE EXCEPTION 'ROLLBACK_LEFT_VISIT_IDENTITY'; END IF;
  SELECT count(*) INTO v_count FROM public.transaction_external_ids
  WHERE source_system = 'yezza' AND source_bill_id = 'sql-bill-rollback';
  IF v_count <> 0 THEN RAISE EXCEPTION 'ROLLBACK_LEFT_TRANSACTION_IDENTITY'; END IF;
  SELECT count(*) INTO v_count FROM public.payments WHERE notes = 'YEZZA_TEST_FORCE_ROLLBACK';
  IF v_count <> 0 THEN RAISE EXCEPTION 'ROLLBACK_LEFT_PAYMENT'; END IF;

  IF (SELECT status FROM public.import_batches WHERE id = v_batch_id) <> 'failed'
     OR (SELECT error_summary->>'code' FROM public.import_batches WHERE id = v_batch_id) <> 'YEZZA_IMPORT_FAILED'
     OR (SELECT error_summary->>'sqlstate' FROM public.import_batches WHERE id = v_batch_id) <> '23514' THEN
    RAISE EXCEPTION 'ROLLBACK_FAILED_LEDGER_AUDIT_MISSING';
  END IF;
END;
$forced_constraint_rollback$;

DROP TRIGGER yezza_import_test_force_payment_failure ON public.payments;
DROP FUNCTION public.yezza_import_test_force_payment_failure();

ROLLBACK;

SELECT jsonb_build_object(
  'status', 'pass',
  'transaction_end', 'ROLLBACK',
  'role_grants_and_rls', 'pass',
  'unapproved_apply', 'rejected',
  'apply_retry', 'idempotent',
  'patient_external_id_reuse', 'pass',
  'transaction_deduplication', 'pass',
  'visit_patient_and_item_shape', 'guarded',
  'forced_constraint_rollback', 'pass',
  'failed_ledger_status', 'recorded'
) AS yezza_import_rpc_verification;
