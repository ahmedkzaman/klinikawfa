-- Rollback-only acceptance fixture for public.get_insight_performance.
-- Run only after the performance migration is present on an approved
-- non-production database.

BEGIN;

DO $setup$
BEGIN
  IF EXISTS (
    SELECT 1 FROM auth.users
    WHERE id::text LIKE '73000000-0000-4000-8000-0000000000%'
  ) THEN
    RAISE EXCEPTION 'TEST_UUID_COLLISION';
  END IF;

  INSERT INTO auth.users (
    id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
    ('73000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'performance-doctor-admin@example.invalid', '{}', '{}', now(), now()),
    ('73000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'performance-resident@example.invalid', '{}', '{}', now(), now()),
    ('73000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'performance-operations@example.invalid', '{}', '{}', now(), now()),
    ('73000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'performance-locum@example.invalid', '{}', '{}', now(), now()),
    ('73000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'performance-guest@example.invalid', '{}', '{}', now(), now()),
    ('73000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'performance-admin@example.invalid', '{}', '{}', now(), now()),
    ('73000000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 'performance-denied-operations@example.invalid', '{}', '{}', now(), now()),
    ('73000000-0000-4000-8000-000000000008', 'authenticated', 'authenticated', 'performance-management-only@example.invalid', '{}', '{}', now(), now());

  INSERT INTO public.profiles (id, email, full_name) VALUES
    ('73000000-0000-4000-8000-000000000001', 'performance-doctor-admin@example.invalid', 'TEST ONLY PERFORMANCE ADMIN'),
    ('73000000-0000-4000-8000-000000000002', 'performance-resident@example.invalid', 'TEST ONLY RESIDENT DOCTOR'),
    ('73000000-0000-4000-8000-000000000003', 'performance-operations@example.invalid', 'TEST ONLY OPERATIONS'),
    ('73000000-0000-4000-8000-000000000004', 'performance-locum@example.invalid', 'TEST ONLY OTHER DOCTOR'),
    ('73000000-0000-4000-8000-000000000005', 'performance-guest@example.invalid', 'TEST ONLY GUEST'),
    ('73000000-0000-4000-8000-000000000006', 'performance-admin@example.invalid', 'TEST ONLY PLAIN ADMIN'),
    ('73000000-0000-4000-8000-000000000007', 'performance-denied-operations@example.invalid', 'TEST ONLY DENIED OPERATIONS'),
    ('73000000-0000-4000-8000-000000000008', 'performance-management-only@example.invalid', 'TEST ONLY MANAGEMENT ONLY');

  INSERT INTO public.user_roles (user_id, role) VALUES
    ('73000000-0000-4000-8000-000000000001', 'doctor_admin'),
    ('73000000-0000-4000-8000-000000000002', 'resident_doctor'),
    ('73000000-0000-4000-8000-000000000003', 'operations'),
    ('73000000-0000-4000-8000-000000000004', 'locum'),
    ('73000000-0000-4000-8000-000000000005', 'guest'),
    ('73000000-0000-4000-8000-000000000006', 'admin'),
    ('73000000-0000-4000-8000-000000000007', 'operations'),
    ('73000000-0000-4000-8000-000000000008', 'admin');

  INSERT INTO public.clinic_user_permission_overrides (
    user_id, permission_key, allowed, updated_by
  ) VALUES
    ('73000000-0000-4000-8000-000000000001', 'reports.view', true, '73000000-0000-4000-8000-000000000001'),
    ('73000000-0000-4000-8000-000000000002', 'reports.view', true, '73000000-0000-4000-8000-000000000001'),
    ('73000000-0000-4000-8000-000000000003', 'reports.view', true, '73000000-0000-4000-8000-000000000001'),
    ('73000000-0000-4000-8000-000000000004', 'reports.view', true, '73000000-0000-4000-8000-000000000001'),
    ('73000000-0000-4000-8000-000000000005', 'reports.view', true, '73000000-0000-4000-8000-000000000001'),
    ('73000000-0000-4000-8000-000000000006', 'reports.view', true, '73000000-0000-4000-8000-000000000001'),
    ('73000000-0000-4000-8000-000000000007', 'reports.view', false, '73000000-0000-4000-8000-000000000001'),
    ('73000000-0000-4000-8000-000000000008', 'reports.view', false, '73000000-0000-4000-8000-000000000001');

  INSERT INTO public.doctors (id, user_id, name, status) VALUES
    ('73000000-0000-4000-8000-000000000011', '73000000-0000-4000-8000-000000000002', 'TEST ONLY RESIDENT DOCTOR', 'active'),
    ('73000000-0000-4000-8000-000000000012', '73000000-0000-4000-8000-000000000004', 'TEST ONLY OTHER DOCTOR', 'active'),
    ('73000000-0000-4000-8000-000000000013', NULL, 'TEST ONLY DOCUMENT ONLY DOCTOR', 'active');

  INSERT INTO public.patients (id, name) VALUES
    ('73000000-0000-4000-8000-000000000101', 'TEST ONLY PERFORMANCE PATIENT A'),
    ('73000000-0000-4000-8000-000000000102', 'TEST ONLY PERFORMANCE PATIENT B');

  INSERT INTO public.services (id, name, category, cost, price_to_patient, status) VALUES
    ('73000000-0000-4000-8000-000000000701', 'TEST ONLY COSTED PROCEDURE', 'procedure', 10, 50, 'active'),
    ('73000000-0000-4000-8000-000000000702', 'TEST ONLY ZERO COST PROCEDURE', 'procedure', 0, 40, 'active'),
    ('73000000-0000-4000-8000-000000000703', 'TEST ONLY MATCHED LEGACY PROCEDURE', 'procedure', 0, 12, 'active');

  INSERT INTO public.inventory_items (id, name, category) VALUES
    ('73000000-0000-4000-8000-000000000711', 'TEST ONLY PARTIAL MEDICINE', 'medicine'),
    ('73000000-0000-4000-8000-000000000712', 'TEST ONLY ZERO DISPENSED MEDICINE', 'medicine'),
    ('73000000-0000-4000-8000-000000000713', 'TEST ONLY MISSING COST PROCEDURE', 'procedure'),
    ('73000000-0000-4000-8000-000000000714', 'TEST ONLY MATCHED LEGACY PROCEDURE', 'medicine');

  INSERT INTO public.saved_rosters (
    id, roster_type, month, year, roster_data, staff_list, warnings, created_by
  ) VALUES (
    '73000000-0000-4000-8000-000000000401',
    'doctor', 8, 2096,
    '{"2096-08-03":{"DOC_S1":[{"staffId":"73000000-0000-4000-8000-000000000011","staffName":"TEST ONLY RESIDENT DOCTOR"},{"staffId":"73000000-0000-4000-8000-000000000011","staffName":"TEST ONLY DUPLICATE RESIDENT"}],"DOC_S2":{"staffId":"73000000-0000-4000-8000-000000000012","staffName":"TEST ONLY OTHER DOCTOR"},"DOC_S3":[{"staffId":"not-a-uuid","staffName":"TEST ONLY MALFORMED"},{"staffId":"73000000-0000-4000-8000-000000000099","staffName":"TEST ONLY UNMAPPED"}]}}'::jsonb,
    '[]'::jsonb, '[]'::jsonb,
    '73000000-0000-4000-8000-000000000001'
  );

  INSERT INTO public.queue_entries (
    id, patient_id, assigned_doctor_id, clinic_status, queue_number,
    visit_type, payment_method, created_at
  ) VALUES
    ('73000000-0000-4000-8000-000000000201', '73000000-0000-4000-8000-000000000101', '73000000-0000-4000-8000-000000000011', 'completed', 7301, 'consultation', 'cash', '2096-08-02 16:30:00+00'),
    ('73000000-0000-4000-8000-000000000202', '73000000-0000-4000-8000-000000000102', '73000000-0000-4000-8000-000000000012', 'completed', 7302, 'consultation', 'cash', '2096-08-03 02:00:00+00'),
    ('73000000-0000-4000-8000-000000000203', '73000000-0000-4000-8000-000000000101', '73000000-0000-4000-8000-000000000011', 'waiting', 7303, 'consultation', 'cash', '2096-08-03 03:00:00+00'),
    ('73000000-0000-4000-8000-000000000204', '73000000-0000-4000-8000-000000000101', '73000000-0000-4000-8000-000000000011', 'completed', 7304, 'consultation', 'cash', '2096-08-02 02:00:00+00'),
    ('73000000-0000-4000-8000-000000000205', '73000000-0000-4000-8000-000000000101', '73000000-0000-4000-8000-000000000011', 'completed', 7305, 'consultation', 'cash', '2096-08-03 16:30:00+00'),
    ('73000000-0000-4000-8000-000000000206', '73000000-0000-4000-8000-000000000102', NULL, 'completed', 7306, 'consultation', 'cash', '2096-07-15 02:00:00+00'),
    ('73000000-0000-4000-8000-000000000207', '73000000-0000-4000-8000-000000000101', NULL, 'completed', 7307, 'consultation', 'cash', '2096-08-06 02:00:00+00'),
    ('73000000-0000-4000-8000-000000000208', '73000000-0000-4000-8000-000000000102', '73000000-0000-4000-8000-000000000012', 'completed', 7308, 'consultation', 'cash', '2096-07-14 02:00:00+00'),
    ('73000000-0000-4000-8000-000000000209', '73000000-0000-4000-8000-000000000101', '73000000-0000-4000-8000-000000000013', 'completed', 7309, 'consultation', 'cash', '2096-07-13 02:00:00+00'),
    ('73000000-0000-4000-8000-000000000210', '73000000-0000-4000-8000-000000000101', '73000000-0000-4000-8000-000000000013', 'completed', 7310, 'payment_only', 'cash', '2096-07-12 02:00:00+00');

  INSERT INTO public.consultations (
    id, queue_entry_id, patient_id, doctor_id, status, case_note, diagnosis_text, dispense_note
  ) VALUES
    ('73000000-0000-4000-8000-000000000301', '73000000-0000-4000-8000-000000000201', '73000000-0000-4000-8000-000000000101', '73000000-0000-4000-8000-000000000011', 'completed', 'complete', 'diagnosis', 'dispensed'),
    ('73000000-0000-4000-8000-000000000302', '73000000-0000-4000-8000-000000000202', '73000000-0000-4000-8000-000000000102', '73000000-0000-4000-8000-000000000012', 'completed', 'complete', 'diagnosis', 'dispensed'),
    ('73000000-0000-4000-8000-000000000303', '73000000-0000-4000-8000-000000000203', '73000000-0000-4000-8000-000000000101', '73000000-0000-4000-8000-000000000011', 'completed', 'queue incomplete', 'diagnosis', 'dispensed'),
    ('73000000-0000-4000-8000-000000000304', '73000000-0000-4000-8000-000000000204', '73000000-0000-4000-8000-000000000101', '73000000-0000-4000-8000-000000000011', 'completed', 'previous period', 'diagnosis', 'dispensed'),
    ('73000000-0000-4000-8000-000000000305', '73000000-0000-4000-8000-000000000205', '73000000-0000-4000-8000-000000000101', '73000000-0000-4000-8000-000000000011', 'completed', 'positive missing cost', 'diagnosis', 'dispensed'),
    ('73000000-0000-4000-8000-000000000306', '73000000-0000-4000-8000-000000000206', '73000000-0000-4000-8000-000000000102', NULL, 'completed', 'older unattributed visit', 'diagnosis', 'dispensed'),
    ('73000000-0000-4000-8000-000000000307', '73000000-0000-4000-8000-000000000207', '73000000-0000-4000-8000-000000000101', NULL, 'completed', 'current unattributed visit', 'diagnosis', 'dispensed'),
    ('73000000-0000-4000-8000-000000000308', '73000000-0000-4000-8000-000000000208', '73000000-0000-4000-8000-000000000102', '73000000-0000-4000-8000-000000000012', 'completed', 'older benchmark visit', 'diagnosis', 'dispensed'),
    ('73000000-0000-4000-8000-000000000309', '73000000-0000-4000-8000-000000000209', '73000000-0000-4000-8000-000000000101', '73000000-0000-4000-8000-000000000013', 'completed', 'older document only doctor visit', 'diagnosis', 'dispensed'),
    ('73000000-0000-4000-8000-000000000310', '73000000-0000-4000-8000-000000000210', '73000000-0000-4000-8000-000000000101', '73000000-0000-4000-8000-000000000013', 'completed', 'payment only document visit', 'diagnosis', 'dispensed');

  INSERT INTO public.consultation_items (
    id, consultation_id, service_id, item_id, item_name, quantity, dispensed_qty,
    price, unit_cost, deleted_at
  ) VALUES
    ('73000000-0000-4000-8000-000000000501', '73000000-0000-4000-8000-000000000301', '73000000-0000-4000-8000-000000000701', NULL, 'TEST ONLY COSTED PROCEDURE', 2, NULL, 50, 10, NULL),
    ('73000000-0000-4000-8000-000000000502', '73000000-0000-4000-8000-000000000302', '73000000-0000-4000-8000-000000000702', NULL, 'TEST ONLY ZERO COST PROCEDURE', 1, NULL, 40, 0, NULL),
    ('73000000-0000-4000-8000-000000000503', '73000000-0000-4000-8000-000000000301', '73000000-0000-4000-8000-000000000701', NULL, 'TEST ONLY DELETED PROCEDURE', 99, NULL, 999, 999, now()),
    ('73000000-0000-4000-8000-000000000504', '73000000-0000-4000-8000-000000000301', NULL, '73000000-0000-4000-8000-000000000711', 'TEST ONLY PARTIAL MEDICINE', 3, 1, 10, 5, NULL),
    ('73000000-0000-4000-8000-000000000505', '73000000-0000-4000-8000-000000000301', NULL, '73000000-0000-4000-8000-000000000712', 'TEST ONLY ZERO DISPENSED MEDICINE', 2, 0, 8, 0, NULL),
    ('73000000-0000-4000-8000-000000000506', '73000000-0000-4000-8000-000000000301', NULL, NULL, 'Official Documentation Fees', 1, NULL, 15, 0, NULL),
    ('73000000-0000-4000-8000-000000000507', '73000000-0000-4000-8000-000000000301', NULL, NULL, 'Excision Biopsy (Procedure)', 2, NULL, 25, 0, NULL),
    ('73000000-0000-4000-8000-000000000508', '73000000-0000-4000-8000-000000000302', NULL, NULL, 'TEST ONLY MATCHED LEGACY PROCEDURE', 1, NULL, 12, 0, NULL),
    ('73000000-0000-4000-8000-000000000509', '73000000-0000-4000-8000-000000000303', '73000000-0000-4000-8000-000000000701', NULL, 'TEST ONLY INCOMPLETE QUEUE PROCEDURE', 9, NULL, 999, 99, NULL),
    ('73000000-0000-4000-8000-000000000510', '73000000-0000-4000-8000-000000000304', NULL, NULL, 'Excision Biopsy (Procedure)', 1, NULL, 25, 0, NULL),
    ('73000000-0000-4000-8000-000000000511', '73000000-0000-4000-8000-000000000305', NULL, '73000000-0000-4000-8000-000000000712', 'TEST ONLY DISPENSED MISSING COST', 2, 1, 8, 0, NULL),
    ('73000000-0000-4000-8000-000000000512', '73000000-0000-4000-8000-000000000305', NULL, '73000000-0000-4000-8000-000000000713', 'TEST ONLY MISSING COST PROCEDURE', 3, 1, 30, 0, NULL),
    ('73000000-0000-4000-8000-000000000513', '73000000-0000-4000-8000-000000000301', NULL, '73000000-0000-4000-8000-000000000714', 'TEST ONLY MATCHED LEGACY PROCEDURE', 1, 0, 0, 0, NULL);

  INSERT INTO public.payments (
    id, queue_entry_id, consultation_id, payment_type, payment_method, amount, deleted_at
  ) VALUES
    ('73000000-0000-4000-8000-000000000601', '73000000-0000-4000-8000-000000000201', '73000000-0000-4000-8000-000000000301', 'self_pay', 'cash', 20, NULL),
    ('73000000-0000-4000-8000-000000000602', '73000000-0000-4000-8000-000000000201', '73000000-0000-4000-8000-000000000301', 'self_pay', 'panel', 0, NULL),
    ('73000000-0000-4000-8000-000000000603', '73000000-0000-4000-8000-000000000202', '73000000-0000-4000-8000-000000000302', 'self_pay', 'cash', 40, NULL),
    ('73000000-0000-4000-8000-000000000604', '73000000-0000-4000-8000-000000000202', '73000000-0000-4000-8000-000000000302', 'self_pay', 'cash', 999, now()),
    ('73000000-0000-4000-8000-000000000605', '73000000-0000-4000-8000-000000000202', '73000000-0000-4000-8000-000000000302', 'panel', 'cash', 70, NULL),
    ('73000000-0000-4000-8000-000000000606', '73000000-0000-4000-8000-000000000202', '73000000-0000-4000-8000-000000000302', 'self_pay', NULL, 5, NULL);

  INSERT INTO public.consultation_documents (
    id, consultation_id, patient_id, template_name, type, content, created_at
  ) VALUES
    ('73000000-0000-4000-8000-000000000801', '73000000-0000-4000-8000-000000000301', '73000000-0000-4000-8000-000000000101', 'TEST ONLY MC', 'mc', 'TEST ONLY CONTENT', '2096-08-03 01:00:00+00'),
    ('73000000-0000-4000-8000-000000000802', '73000000-0000-4000-8000-000000000302', '73000000-0000-4000-8000-000000000102', 'TEST ONLY OUT OF RANGE REFERRAL', 'referral', 'TEST ONLY CONTENT', '2096-08-03 16:30:00+00'),
    ('73000000-0000-4000-8000-000000000803', '73000000-0000-4000-8000-000000000304', '73000000-0000-4000-8000-000000000101', 'TEST ONLY ISSUED AFTER VISIT', 'referral', 'TEST ONLY CONTENT', '2096-08-03 02:00:00+00'),
    ('73000000-0000-4000-8000-000000000804', '73000000-0000-4000-8000-000000000306', '73000000-0000-4000-8000-000000000102', 'TEST ONLY UNATTRIBUTED ISSUED AFTER VISIT', 'mc', 'TEST ONLY CONTENT', '2096-08-03 03:00:00+00'),
    ('73000000-0000-4000-8000-000000000805', '73000000-0000-4000-8000-000000000308', '73000000-0000-4000-8000-000000000102', 'TEST ONLY BENCHMARK ISSUED AFTER VISIT', 'referral', 'TEST ONLY CONTENT', '2096-08-03 04:00:00+00'),
    ('73000000-0000-4000-8000-000000000806', '73000000-0000-4000-8000-000000000307', '73000000-0000-4000-8000-000000000101', 'TEST ONLY UNATTRIBUTED SAME VISIT A', 'mc', 'TEST ONLY CONTENT', '2096-08-06 03:00:00+00'),
    ('73000000-0000-4000-8000-000000000807', '73000000-0000-4000-8000-000000000307', '73000000-0000-4000-8000-000000000101', 'TEST ONLY UNATTRIBUTED SAME VISIT B', 'referral', 'TEST ONLY CONTENT', '2096-08-06 04:00:00+00'),
    ('73000000-0000-4000-8000-000000000808', '73000000-0000-4000-8000-000000000309', '73000000-0000-4000-8000-000000000101', 'TEST ONLY DOCUMENT ONLY DOCTOR', 'referral', 'TEST ONLY CONTENT', '2096-08-07 02:00:00+00'),
    ('73000000-0000-4000-8000-000000000809', '73000000-0000-4000-8000-000000000304', '73000000-0000-4000-8000-000000000101', 'TEST ONLY RESIDENT DOCUMENT ONLY PERIOD', 'mc', 'TEST ONLY CONTENT', '2096-08-07 03:00:00+00'),
    ('73000000-0000-4000-8000-000000000810', '73000000-0000-4000-8000-000000000310', '73000000-0000-4000-8000-000000000101', 'TEST ONLY PAYMENT ONLY DOCUMENT', 'mc', 'TEST ONLY CONTENT', '2096-08-07 04:00:00+00');

  UPDATE public.consultation_items
  SET source_document_id = '73000000-0000-4000-8000-000000000801'
  WHERE id = '73000000-0000-4000-8000-000000000506';

  CREATE TEMP TABLE insight_performance_plan_noise (
    queue_entry_id uuid PRIMARY KEY,
    consultation_id uuid NOT NULL
  ) ON COMMIT DROP;
  INSERT INTO insight_performance_plan_noise
  SELECT gen_random_uuid(), gen_random_uuid() FROM generate_series(1, 5000);
  INSERT INTO public.queue_entries (
    id, patient_id, clinic_status, queue_number, visit_type, payment_method, created_at
  )
  SELECT queue_entry_id, '73000000-0000-4000-8000-000000000101', 'completed',
    8000 + row_number() OVER (), 'consultation', 'cash', '2096-07-01 00:00:00+00'
  FROM insight_performance_plan_noise;
  INSERT INTO public.consultations (
    id, queue_entry_id, patient_id, status, case_note, diagnosis_text, dispense_note
  )
  SELECT consultation_id, queue_entry_id,
    '73000000-0000-4000-8000-000000000101', 'completed', '', '', ''
  FROM insight_performance_plan_noise;
  INSERT INTO public.consultation_items (
    id, consultation_id, item_name, quantity, price, unit_cost
  )
  SELECT gen_random_uuid(), consultation_id, 'PLAN NOISE', 1, 1, 0
  FROM insight_performance_plan_noise;
  INSERT INTO public.consultation_documents (
    id, consultation_id, patient_id, template_name, type, content, created_at
  )
  SELECT gen_random_uuid(), consultation_id,
    '73000000-0000-4000-8000-000000000101', 'PLAN NOISE', 'mc', '',
    '2096-07-01 00:00:00+00'
  FROM insight_performance_plan_noise;
END
$setup$;

ANALYZE public.queue_entries;
ANALYZE public.consultations;
ANALYZE public.consultation_items;
ANALYZE public.consultation_documents;

DO $classifier_contract$
BEGIN
  IF public._insight_is_procedure_item(
       NULL, '73000000-0000-4000-8000-000000000714', NULL,
       'TEST ONLY MATCHED LEGACY PROCEDURE'
     ) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'TYPED_MEDICINE_NAME_COLLISION_CLASSIFIED_AS_PROCEDURE';
  END IF;
  IF public._insight_rostered_hours('2096-08-03', '2096-08-03', NULL) IS DISTINCT FROM 10
     OR public._insight_rostered_hours(
       '2096-08-03', '2096-08-03', '73000000-0000-4000-8000-000000000011'
     ) IS DISTINCT FROM 5 THEN
    RAISE EXCEPTION 'ROSTER_DUPLICATE_OR_INVALID_ASSIGNMENT_COUNTED';
  END IF;
END
$classifier_contract$;

DO $scope_version_contract$
DECLARE
  v_before text;
  v_scope jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '73000000-0000-4000-8000-000000000001', true);
  v_before := public.get_insight_viewer_scope()->>'permission_version';
  UPDATE public.user_roles SET role = 'operations'
  WHERE user_id = '73000000-0000-4000-8000-000000000001';
  v_scope := public.get_insight_viewer_scope();
  IF v_scope->>'role' IS DISTINCT FROM 'operations'
     OR v_scope->>'permission_version' IS NOT DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'LIVE_ROLE_SCOPE_VERSION_MISMATCH: %', v_scope;
  END IF;
  UPDATE public.user_roles SET role = 'doctor_admin'
  WHERE user_id = '73000000-0000-4000-8000-000000000001';
END
$scope_version_contract$;

DO $index_contract$
DECLARE
  v_duplicate_count integer;
BEGIN
  SELECT count(*)::integer
  INTO v_duplicate_count
  FROM pg_index AS index_row
  WHERE index_row.indrelid = 'public.consultation_items'::regclass
    AND index_row.indisunique = false
    AND index_row.indkey::text = (
      SELECT indkey::text
      FROM pg_index
      WHERE indexrelid = 'public.consultation_items_consultation_id_active_idx'::regclass
    )
    AND pg_get_expr(index_row.indpred, index_row.indrelid)
      IS NOT DISTINCT FROM '(deleted_at IS NULL)';

  IF v_duplicate_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'DUPLICATE_ACTIVE_CONSULTATION_ITEM_INDEX: %', v_duplicate_count;
  END IF;
END
$index_contract$;

DROP INDEX public.idx_consultation_documents_insight_performance_issued;

\echo PERFORMANCE_INTERNAL_PLAN_BEFORE
EXPLAIN (ANALYZE, BUFFERS)
SELECT
  count(DISTINCT consultation.id),
  coalesce(sum(item.price * item.quantity), 0),
  (
    SELECT count(*)
    FROM public.consultation_documents AS issued_document
    JOIN public.consultations AS document_consultation
      ON document_consultation.id = issued_document.consultation_id
    JOIN public.queue_entries AS document_queue
      ON document_queue.id = document_consultation.queue_entry_id
    WHERE lower(coalesce(issued_document.type, '')) IN ('mc', 'quarantine', 'referral')
      AND timezone('Asia/Kuala_Lumpur', issued_document.created_at)::date
        BETWEEN '2096-08-03' AND '2096-08-03'
      AND document_consultation.status = 'completed'
      AND document_consultation.deleted_at IS NULL
      AND document_queue.clinic_status = 'completed'
      AND document_queue.deleted_at IS NULL
      AND document_queue.cancelled_at IS NULL
      AND document_queue.visit_type <> 'payment_only'
  ) AS issued_documents
FROM public.consultations AS consultation
JOIN public.queue_entries AS queue_entry
  ON queue_entry.id = consultation.queue_entry_id
LEFT JOIN public.consultation_items AS item
  ON item.consultation_id = consultation.id AND item.deleted_at IS NULL
WHERE consultation.status = 'completed'
  AND consultation.deleted_at IS NULL
  AND queue_entry.clinic_status = 'completed'
  AND queue_entry.deleted_at IS NULL
  AND queue_entry.cancelled_at IS NULL
  AND queue_entry.visit_type <> 'payment_only'
  AND timezone('Asia/Kuala_Lumpur', queue_entry.created_at)::date
    BETWEEN '2096-08-03' AND '2096-08-03';

CREATE INDEX idx_consultation_documents_insight_performance_issued
  ON public.consultation_documents (
    (timezone('Asia/Kuala_Lumpur', created_at)::date), consultation_id
  )
  WHERE lower(coalesce(type, '')) IN ('mc', 'quarantine', 'referral');

ANALYZE public.consultation_documents;

\echo PERFORMANCE_INTERNAL_PLAN_AFTER
EXPLAIN (ANALYZE, BUFFERS)
SELECT
  count(DISTINCT consultation.id),
  coalesce(sum(item.price * item.quantity), 0),
  (
    SELECT count(*)
    FROM public.consultation_documents AS issued_document
    JOIN public.consultations AS document_consultation
      ON document_consultation.id = issued_document.consultation_id
    JOIN public.queue_entries AS document_queue
      ON document_queue.id = document_consultation.queue_entry_id
    WHERE lower(coalesce(issued_document.type, '')) IN ('mc', 'quarantine', 'referral')
      AND timezone('Asia/Kuala_Lumpur', issued_document.created_at)::date
        BETWEEN '2096-08-03' AND '2096-08-03'
      AND document_consultation.status = 'completed'
      AND document_consultation.deleted_at IS NULL
      AND document_queue.clinic_status = 'completed'
      AND document_queue.deleted_at IS NULL
      AND document_queue.cancelled_at IS NULL
      AND document_queue.visit_type <> 'payment_only'
  ) AS issued_documents
FROM public.consultations AS consultation
JOIN public.queue_entries AS queue_entry
  ON queue_entry.id = consultation.queue_entry_id
LEFT JOIN public.consultation_items AS item
  ON item.consultation_id = consultation.id AND item.deleted_at IS NULL
WHERE consultation.status = 'completed'
  AND consultation.deleted_at IS NULL
  AND queue_entry.clinic_status = 'completed'
  AND queue_entry.deleted_at IS NULL
  AND queue_entry.cancelled_at IS NULL
  AND queue_entry.visit_type <> 'payment_only'
  AND timezone('Asia/Kuala_Lumpur', queue_entry.created_at)::date
    BETWEEN '2096-08-03' AND '2096-08-03';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $verify$
DECLARE
  v_report jsonb;
  v_detail jsonb;
  v_filtered jsonb;
  v_row jsonb;
  v_activity record;
  v_named_documents integer;
BEGIN
  IF has_function_privilege('anon', 'public.get_insight_performance(date,date)', 'execute')
     OR has_function_privilege('public', 'public.get_insight_performance(date,date)', 'execute')
     OR NOT has_function_privilege('authenticated', 'public.get_insight_performance(date,date)', 'execute') THEN
    RAISE EXCEPTION 'INSIGHT_PERFORMANCE_PRIVILEGE_INVALID';
  END IF;
  IF has_function_privilege('authenticated', 'public.can_view_insight_workspace(uuid)', 'execute')
     OR has_function_privilege('anon', 'public.can_view_insight_workspace(uuid)', 'execute')
     OR has_function_privilege('public', 'public.can_view_insight_workspace(uuid)', 'execute') THEN
    RAISE EXCEPTION 'INSIGHT_PERMISSION_ORACLE_EXPOSED';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '73000000-0000-4000-8000-000000000001', true);
  v_report := public.get_insight_viewer_scope();
  IF (v_report->>'allowed')::boolean IS DISTINCT FROM true
     OR v_report->>'role' IS DISTINCT FROM 'doctor_admin'
     OR v_report->'doctor_id' IS DISTINCT FROM 'null'::jsonb
     OR coalesce(v_report->>'permission_version', '') = '' THEN
    RAISE EXCEPTION 'VIEWER_SCOPE_MISMATCH: %', v_report;
  END IF;

  SELECT * INTO STRICT v_activity
  FROM public.get_doctor_clinical_activity('2096-08-03', '2096-08-03')
  WHERE activity_id = '73000000-0000-4000-8000-000000000801';
  IF v_activity.unit_price IS DISTINCT FROM 15
     OR v_activity.quantity IS DISTINCT FROM 1
     OR v_activity.total_price IS DISTINCT FROM 15 THEN
    RAISE EXCEPTION 'DOCUMENT_CHARGE_ATTRIBUTION_MISMATCH: %', row_to_json(v_activity);
  END IF;

  SELECT count(*)::integer INTO v_named_documents
  FROM public.get_doctor_clinical_activity('2096-08-07', '2096-08-07')
  WHERE activity_kind IN ('mc', 'quarantine', 'referral');
  IF v_named_documents IS DISTINCT FROM 2
     OR EXISTS (
       SELECT 1 FROM public.get_doctor_clinical_activity('2096-08-07', '2096-08-07')
       WHERE activity_id = '73000000-0000-4000-8000-000000000810'
     ) THEN
    RAISE EXCEPTION 'PAYMENT_ONLY_DOCUMENT_ENTERED_DOCTOR_ACTIVITY: %', v_named_documents;
  END IF;

  v_report := public.get_insight_performance_filtered(
    '2096-08-03', '2096-08-03', '73000000-0000-4000-8000-000000000011',
    'panel', 'procedure', false
  );
  v_filtered := v_report;
  IF (v_report->'clinic'->>'completed_visits')::integer IS DISTINCT FROM 1
     OR jsonb_array_length(v_report->'doctors') IS DISTINCT FROM 1
     OR (v_report->'clinic'->>'rostered_hours')::numeric IS DISTINCT FROM 5
     OR v_report->'filters'->>'payment_type' IS DISTINCT FROM 'panel'
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_report->'services') AS service
       WHERE service->'trend_pct' IS DISTINCT FROM 'null'::jsonb) THEN
    RAISE EXCEPTION 'FILTERED_PERFORMANCE_MISMATCH: %', v_report;
  END IF;

  v_report := public.get_insight_performance_detail_filtered(
    '2096-08-03', '2096-08-03', 'doctor', '73000000-0000-4000-8000-000000000011',
    '73000000-0000-4000-8000-000000000011', 'panel', 'procedure'
  );
  IF v_report->>'kind' IS DISTINCT FROM 'doctor'
     OR (v_report->'financial'->>'revenue')::numeric IS DISTINCT FROM 211
     OR jsonb_array_length(v_report->'visits_by_shift') IS DISTINCT FROM 1
     OR jsonb_array_length(v_report->'payment_mix') IS DISTINCT FROM 1
     OR jsonb_array_length(v_report->'diagnoses') IS DISTINCT FROM 1
     OR jsonb_array_length(v_report->'medicines') IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'DOCTOR_DETAIL_MISMATCH: %', v_report;
  END IF;
  IF (v_report->'financial'->>'revenue')::numeric
       IS DISTINCT FROM (v_filtered->'clinic'->>'visit_billing')::numeric THEN
    RAISE EXCEPTION 'FILTERED_AGGREGATE_DETAIL_DISAGREEMENT';
  END IF;
  v_detail := public.get_insight_performance_detail_filtered(
    '2096-08-03', '2096-08-03', 'doctor', '73000000-0000-4000-8000-000000000011',
    '73000000-0000-4000-8000-000000000011', 'all', 'all'
  );
  IF (v_detail->>'documents')::integer IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'DOCTOR_DETAIL_ISSUE_DATE_DOCUMENT_MISMATCH: %', v_detail;
  END IF;

  v_detail := public.get_insight_performance_detail_filtered(
    '2096-08-03', '2096-08-03', 'service', '73000000-0000-4000-8000-000000000703',
    NULL, 'all', 'procedure'
  );
  IF v_detail->>'service_name' IS DISTINCT FROM 'TEST ONLY MATCHED LEGACY PROCEDURE'
     OR jsonb_array_length(v_detail->'trend') IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'MATCHED_LEGACY_SERVICE_DETAIL_MISMATCH: %', v_detail;
  END IF;
  BEGIN
    PERFORM public.get_insight_performance_detail_filtered(
      '2096-08-03', '2096-08-03', 'service', '73000000-0000-4000-8000-000000000711',
      NULL, 'all', 'procedure'
    );
    RAISE EXCEPTION 'MEDICINE_UUID_ACCEPTED_AS_PROCEDURE';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  BEGIN
    PERFORM public.get_insight_performance_detail_filtered(
      '2096-08-03', '2096-08-03', 'service', '73000000-0000-4000-8000-000000000714',
      NULL, 'panel', 'procedure'
    );
    RAISE EXCEPTION 'COLLIDING_MEDICINE_UUID_ACCEPTED_AS_PROCEDURE';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  v_detail := public.get_insight_performance_detail_filtered(
    '2096-08-04', '2096-08-04', 'service', '73000000-0000-4000-8000-000000000713',
    NULL, 'all', 'procedure'
  );
  IF v_detail->'visits'->0->'cogs' IS DISTINCT FROM 'null'::jsonb
     OR v_detail->'visits'->0->'gross_profit' IS DISTINCT FROM 'null'::jsonb
     OR v_detail->'margin_history'->0->'average_cogs' IS DISTINCT FROM 'null'::jsonb THEN
    RAISE EXCEPTION 'MISSING_COST_DETAIL_FALSE_PRECISION: %', v_detail;
  END IF;

  v_report := public.get_insight_performance_filtered(
    '2096-08-07', '2096-08-07', NULL, 'all', 'all', false
  );
  IF (v_report->'clinic'->>'completed_visits')::integer IS DISTINCT FROM 0
     OR (v_report->'clinic'->>'documents')::integer IS DISTINCT FROM 2
     OR jsonb_array_length(v_report->'doctors') IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'DOCUMENT_ONLY_DOCTOR_AGGREGATE_MISMATCH: %', v_report;
  END IF;
  SELECT value INTO STRICT v_row FROM jsonb_array_elements(v_report->'doctors')
  WHERE value->>'doctor_id' = '73000000-0000-4000-8000-000000000013';
  IF (v_row->>'documents')::integer IS DISTINCT FROM 1
     OR (v_row->>'completed_visits')::integer IS DISTINCT FROM 0
     OR (v_row->>'unique_patients')::integer IS DISTINCT FROM 0
     OR (v_row->>'visit_billing')::numeric IS DISTINCT FROM 0
     OR (v_row->>'procedures')::numeric IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'DOCUMENT_ONLY_DOCTOR_ZERO_VISIT_ROW_MISMATCH: %', v_row;
  END IF;
  v_detail := public.get_insight_performance_detail_filtered(
    '2096-08-07', '2096-08-07', 'doctor', '73000000-0000-4000-8000-000000000013',
    '73000000-0000-4000-8000-000000000013', 'all', 'all'
  );
  IF (v_detail->>'documents')::integer IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'PAYMENT_ONLY_DOCUMENT_ENTERED_DOCTOR_DETAIL: %', v_detail;
  END IF;

  v_detail := public.get_insight_clinical_attendance_heatmap('2096-08-03', '2096-08-03', NULL);
  IF (v_detail->'doctors')::text LIKE '%not-a-uuid%'
     OR (v_detail->'doctors')::text LIKE '%73000000-0000-4000-8000-000000000099%' THEN
    RAISE EXCEPTION 'INVALID_ROSTER_DOCTOR_ENTERED_ATTENDANCE_DIRECTORY: %', v_detail->'doctors';
  END IF;
  SELECT value INTO STRICT v_row FROM jsonb_array_elements(v_detail->'cells')
  WHERE (value->>'weekday')::integer = extract(isodow FROM date '2096-08-03')::integer
    AND (value->>'hour')::integer = 20;
  IF (v_row->>'operatingOccurrences')::integer IS DISTINCT FROM 0
     OR v_row->>'coverage' IS DISTINCT FROM 'uncovered' THEN
    RAISE EXCEPTION 'INVALID_S3_ROSTER_CREATED_OPERATING_COVERAGE: %', v_row;
  END IF;

  v_report := public.get_insight_performance('2096-08-03', '2096-08-03');
  IF (v_report->'clinic'->>'completed_visits')::integer IS DISTINCT FROM 2
     OR (v_report->'clinic'->>'unique_patients')::integer IS DISTINCT FROM 2
     OR (v_report->'clinic'->>'rostered_hours')::numeric IS DISTINCT FROM 10
     OR (v_report->'clinic'->>'patients_per_hour')::numeric IS DISTINCT FROM 0.2
     OR (v_report->'clinic'->>'visit_billing')::numeric IS DISTINCT FROM 263
     OR (v_report->'clinic'->>'patient_collected')::numeric IS DISTINCT FROM 65
     OR (v_report->'clinic'->>'revenue_per_hour')::numeric IS DISTINCT FROM 26.3
     OR (v_report->'clinic'->>'procedures')::numeric IS DISTINCT FROM 6
     OR (v_report->'clinic'->>'documents')::integer IS DISTINCT FROM 4
     OR (v_report->'clinic'->>'self_pay_visits')::integer IS DISTINCT FROM 0
     OR (v_report->'clinic'->>'panel_visits')::integer IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'CLINIC_PERFORMANCE_MISMATCH: %', v_report->'clinic';
  END IF;
  v_filtered := public.get_insight_performance_filtered(
    '2096-08-03', '2096-08-03', NULL, 'all', 'all', false
  );
  IF (v_filtered->'clinic'->>'documents')::integer IS DISTINCT FROM 4
     OR (v_filtered->'clinic'->>'patient_collected')::numeric IS DISTINCT FROM 65
     OR (v_filtered->'quality'->>'missing_attribution')::integer IS DISTINCT FROM 1
     OR v_filtered->'confidence'->>'state' IS DISTINCT FROM 'partial' THEN
    RAISE EXCEPTION 'FILTERED_ISSUE_DATE_QUALITY_MISMATCH: %', v_filtered;
  END IF;
  v_filtered := public.get_insight_performance_filtered(
    '2096-08-06', '2096-08-06', NULL, 'all', 'all', false
  );
  IF (v_filtered->'clinic'->>'completed_visits')::integer IS DISTINCT FROM 1
     OR (v_filtered->'clinic'->>'documents')::integer IS DISTINCT FROM 2
     OR (v_filtered->'quality'->>'missing_attribution')::integer IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'FILTERED_MISSING_ATTRIBUTION_DEDUP_MISMATCH: %', v_filtered;
  END IF;
  IF (v_report->'clinic'->>'cogs')::numeric IS DISTINCT FROM 25
     OR (v_report->'clinic'->>'gross_profit')::numeric IS DISTINCT FROM 238
     OR v_report->'confidence'->>'state' IS DISTINCT FROM 'partial'
     OR (v_report->'quality'->>'missing_attribution')::integer IS DISTINCT FROM 1
     OR (v_report->'quality'->>'missing_cost_count')::integer IS DISTINCT FROM 0
     OR (v_report->'quality'->>'excluded_voided_payments')::integer IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'QUALITY_OR_MISSING_COST_MISMATCH: %', v_report;
  END IF;
  IF jsonb_array_length(v_report->'doctors') IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'ADMIN_NAMED_DOCTOR_COUNT_MISMATCH';
  END IF;
  SELECT coalesce(sum((doctor_row->>'documents')::integer), 0)
  INTO v_named_documents
  FROM jsonb_array_elements(v_report->'doctors') AS doctor_row;
  IF v_named_documents + (v_report->'quality'->>'missing_attribution')::integer
       IS DISTINCT FROM (v_report->'clinic'->>'documents')::integer
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(v_report->'doctors') AS doctor_row
       WHERE lower(doctor_row->>'doctor_name') = 'unassigned'
     ) THEN
    RAISE EXCEPTION 'DOCUMENT_ATTRIBUTION_DID_NOT_RECONCILE: %', v_report;
  END IF;
  SELECT value INTO STRICT v_row FROM jsonb_array_elements(v_report->'doctors')
  WHERE value->>'doctor_id' = '73000000-0000-4000-8000-000000000011';
  IF v_row->>'doctor_name' IS DISTINCT FROM 'TEST ONLY RESIDENT DOCTOR'
     OR (v_row->>'completed_visits')::integer IS DISTINCT FROM 1
     OR (v_row->>'rostered_hours')::numeric IS DISTINCT FROM 5
     OR (v_row->>'visit_billing')::numeric IS DISTINCT FROM 211
     OR (v_row->>'procedures')::numeric IS DISTINCT FROM 4
     OR (v_row->>'documents')::integer IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'RESIDENT_DOCTOR_ADMIN_ROW_MISMATCH: %', v_row;
  END IF;
  IF jsonb_array_length(v_report->'services') IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION 'SERVICE_COUNT_MISMATCH';
  END IF;
  SELECT value INTO STRICT v_row FROM jsonb_array_elements(v_report->'services')
  WHERE value->>'service_id' = '73000000-0000-4000-8000-000000000701';
  IF (v_row->>'volume')::numeric IS DISTINCT FROM 2
     OR (v_row->>'revenue')::numeric IS DISTINCT FROM 100
     OR (v_row->>'cogs')::numeric IS DISTINCT FROM 20
     OR (v_row->>'profit')::numeric IS DISTINCT FROM 80
     OR (v_row->>'margin_pct')::numeric IS DISTINCT FROM 80
     OR (v_row->>'average_price')::numeric IS DISTINCT FROM 50
     OR (v_row->>'doctor_count')::integer IS DISTINCT FROM 1
     OR (v_row->>'missing_cost_count')::integer IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'COSTED_SERVICE_MISMATCH: %', v_row;
  END IF;
  SELECT value INTO STRICT v_row FROM jsonb_array_elements(v_report->'services')
  WHERE value->>'service_id' = '73000000-0000-4000-8000-000000000702';
  IF (v_row->>'cogs')::numeric IS DISTINCT FROM 0
     OR (v_row->>'profit')::numeric IS DISTINCT FROM 40
     OR (v_row->>'margin_pct')::numeric IS DISTINCT FROM 100
     OR (v_row->>'missing_cost_count')::integer IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'ZERO_COST_SERVICE_MISMATCH: %', v_row;
  END IF;
  SELECT value INTO STRICT v_row FROM jsonb_array_elements(v_report->'services')
  WHERE value->>'service_id' = 'legacy-procedure:excision biopsy (procedure)';
  IF (v_row->>'volume')::numeric IS DISTINCT FROM 2
     OR (v_row->>'revenue')::numeric IS DISTINCT FROM 50
     OR (v_row->>'cogs')::numeric IS DISTINCT FROM 0
     OR (v_row->>'profit')::numeric IS DISTINCT FROM 50
     OR (v_row->>'trend_pct')::numeric IS DISTINCT FROM 100 THEN
    RAISE EXCEPTION 'LEGACY_EXCISION_SERVICE_MISMATCH: %', v_row;
  END IF;
  SELECT value INTO STRICT v_row FROM jsonb_array_elements(v_report->'services')
  WHERE value->>'service_id' = '73000000-0000-4000-8000-000000000703';
  IF (v_row->>'volume')::numeric IS DISTINCT FROM 1
     OR (v_row->>'revenue')::numeric IS DISTINCT FROM 12 THEN
    RAISE EXCEPTION 'MATCHED_LEGACY_SERVICE_MISMATCH: %', v_row;
  END IF;

  v_report := public.get_insight_performance('2096-08-04', '2096-08-04');
  IF (v_report->'clinic'->>'completed_visits')::integer IS DISTINCT FROM 1
     OR (v_report->'quality'->>'missing_cost_count')::integer IS DISTINCT FROM 2
     OR v_report->'clinic'->'cogs' IS DISTINCT FROM 'null'::jsonb
     OR v_report->'clinic'->'gross_profit' IS DISTINCT FROM 'null'::jsonb
     OR v_report->'confidence'->>'state' IS DISTINCT FROM 'partial' THEN
    RAISE EXCEPTION 'DISPENSED_MISSING_COST_MISMATCH: %', v_report;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '73000000-0000-4000-8000-000000000002', true);
  v_report := public.get_insight_performance_filtered('2096-08-03', '2096-08-03',
    '73000000-0000-4000-8000-000000000011', 'panel', 'procedure', false);
  IF jsonb_array_length(v_report->'doctors') IS DISTINCT FROM 2
     OR v_report->'doctors'->0->>'doctor_id' IS DISTINCT FROM '73000000-0000-4000-8000-000000000011'
     OR v_report->'doctors'->1->>'doctor_name' IS DISTINCT FROM 'Clinic benchmark'
     OR v_report::text LIKE '%TEST ONLY OTHER DOCTOR%'
     OR v_report::text LIKE '%73000000-0000-4000-8000-000000000012%'
     OR v_report->'services' IS DISTINCT FROM '[]'::jsonb THEN
    RAISE EXCEPTION 'RESIDENT_DOCTOR_IDENTITY_LEAK: %', v_report->'doctors';
  END IF;
  v_report := public.get_insight_performance_filtered(
    '2096-08-03', '2096-08-03', NULL, 'all', 'all', false
  );
  IF (v_report->'doctors'->0->>'documents')::integer IS DISTINCT FROM 2
     OR (v_report->'doctors'->1->>'documents')::integer IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'RESIDENT_ISSUE_DATE_DOCUMENT_BENCHMARK_MISMATCH: %', v_report->'doctors';
  END IF;
  v_report := public.get_insight_performance_filtered(
    '2096-08-07', '2096-08-07', NULL, 'all', 'all', false
  );
  IF jsonb_array_length(v_report->'doctors') IS DISTINCT FROM 2
     OR v_report->'doctors'->0->>'doctor_id' IS DISTINCT FROM '73000000-0000-4000-8000-000000000011'
     OR (v_report->'doctors'->0->>'documents')::integer IS DISTINCT FROM 1
     OR (v_report->'doctors'->0->>'completed_visits')::integer IS DISTINCT FROM 0
     OR v_report->'doctors'->1->>'doctor_name' IS DISTINCT FROM 'Clinic benchmark'
     OR (v_report->'doctors'->1->>'documents')::integer IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'RESIDENT_DOCUMENT_ONLY_ROWS_MISMATCH: %', v_report->'doctors';
  END IF;
  BEGIN
    PERFORM public.get_insight_performance_filtered(
      '2096-08-03', '2096-08-03', '73000000-0000-4000-8000-000000000012', 'all', 'all', false
    );
    RAISE EXCEPTION 'RESIDENT_ENUMERATED_OTHER_DOCTOR';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  v_detail := public.get_insight_clinical_attendance_heatmap('2096-08-03', '2096-08-03', NULL);
  IF jsonb_array_length(v_detail->'doctors') IS DISTINCT FROM 1
     OR v_detail->'doctors'->0->>'id' IS DISTINCT FROM '73000000-0000-4000-8000-000000000011'
     OR v_detail::text LIKE '%73000000-0000-4000-8000-000000000012%'
     OR v_detail::text LIKE '%TEST ONLY OTHER DOCTOR%' THEN
    RAISE EXCEPTION 'RESIDENT_ATTENDANCE_DOCTOR_LEAK: %', v_detail->'doctors';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '73000000-0000-4000-8000-000000000003', true);
  v_detail := public.get_insight_clinical_attendance_heatmap('2096-08-03', '2096-08-03', NULL);
  IF v_detail->'doctors' IS DISTINCT FROM '[]'::jsonb
     OR v_detail::text LIKE '%73000000-0000-4000-8000-000000000011%'
     OR v_detail::text LIKE '%TEST ONLY RESIDENT DOCTOR%' THEN
    RAISE EXCEPTION 'OPERATIONS_ATTENDANCE_DOCTOR_LEAK: %', v_detail;
  END IF;
  BEGIN
    PERFORM public.get_insight_clinical_attendance_heatmap(
      '2096-08-03', '2096-08-03', '73000000-0000-4000-8000-000000000011'
    );
    RAISE EXCEPTION 'OPERATIONS_ENUMERATED_ATTENDANCE_DOCTOR';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  BEGIN
    PERFORM public.get_insight_performance_filtered(
      '2096-08-03', '2096-08-03', '73000000-0000-4000-8000-000000000011', 'all', 'all', false
    );
    RAISE EXCEPTION 'OPERATIONS_ENUMERATED_PERFORMANCE_DOCTOR';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  BEGIN
    PERFORM public.get_insight_performance_detail_filtered(
      '2096-08-03', '2096-08-03', 'service', '73000000-0000-4000-8000-000000000701',
      '73000000-0000-4000-8000-000000000011', 'all', 'procedure'
    );
    RAISE EXCEPTION 'OPERATIONS_ENUMERATED_SERVICE_DOCTOR';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  BEGIN
    PERFORM public.get_clinical_attendance_heatmap('2096-08-03', '2096-08-03', NULL);
    RAISE EXCEPTION 'REPORTS_ONLY_USER_ENTERED_MANAGEMENT_ATTENDANCE';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  v_report := public.get_insight_performance_filtered(
    '2096-08-03', '2096-08-03', NULL, 'all', 'all', false
  );
  IF v_report->'doctors' IS DISTINCT FROM '[]'::jsonb
     OR (v_report->'clinic'->>'rostered_hours')::numeric IS DISTINCT FROM 10
     OR jsonb_array_length(v_report->'services') IS DISTINCT FROM 4
     OR v_report::text LIKE '%TEST ONLY RESIDENT DOCTOR%'
     OR v_report::text LIKE '%TEST ONLY OTHER DOCTOR%' THEN
    RAISE EXCEPTION 'OPERATIONS_DOCTOR_IDENTITY_LEAK: %', v_report;
  END IF;
  v_report := public.get_insight_performance_filtered(
    '2096-08-07', '2096-08-07', NULL, 'all', 'all', false
  );
  IF v_report->'doctors' IS DISTINCT FROM '[]'::jsonb
     OR (v_report->'clinic'->>'documents')::integer IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'OPERATIONS_DOCUMENT_ONLY_REDACTION_MISMATCH: %', v_report;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '73000000-0000-4000-8000-000000000006', true);
  v_report := public.get_insight_performance('2096-08-03', '2096-08-03');
  IF jsonb_array_length(v_report->'doctors') IS DISTINCT FROM 1
     OR v_report->'doctors'->0->>'doctor_name' IS DISTINCT FROM 'Clinic benchmark'
     OR v_report::text LIKE '%TEST ONLY RESIDENT DOCTOR%'
     OR v_report::text LIKE '%TEST ONLY OTHER DOCTOR%' THEN
    RAISE EXCEPTION 'PLAIN_ADMIN_DOCTOR_IDENTITY_LEAK: %', v_report->'doctors';
  END IF;
  v_report := public.get_insight_performance_filtered(
    '2096-08-07', '2096-08-07', NULL, 'all', 'all', false
  );
  IF jsonb_array_length(v_report->'doctors') IS DISTINCT FROM 1
     OR v_report->'doctors'->0->>'doctor_name' IS DISTINCT FROM 'Clinic benchmark'
     OR (v_report->'doctors'->0->>'documents')::integer IS DISTINCT FROM 2
     OR v_report::text LIKE '%73000000-0000-4000-8000-000000000013%'
     OR v_report::text LIKE '%TEST ONLY DOCUMENT ONLY DOCTOR%' THEN
    RAISE EXCEPTION 'PLAIN_ADMIN_DOCUMENT_ONLY_REDACTION_MISMATCH: %', v_report;
  END IF;
  BEGIN
    PERFORM public.get_insight_performance_filtered(
      '2096-08-03', '2096-08-03', '73000000-0000-4000-8000-000000000011', 'all', 'all', false
    );
    RAISE EXCEPTION 'PLAIN_ADMIN_ENUMERATED_PERFORMANCE_DOCTOR';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  BEGIN
    PERFORM public.get_insight_performance_detail_filtered(
      '2096-08-03', '2096-08-03', 'doctor', '73000000-0000-4000-8000-000000000011',
      NULL, 'all', 'all'
    );
    RAISE EXCEPTION 'PLAIN_ADMIN_ENUMERATED_DOCTOR_DETAIL';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;

  PERFORM set_config('request.jwt.claim.sub', '73000000-0000-4000-8000-000000000007', true);
  IF has_function_privilege('authenticated', 'public.get_clinic_health_metrics(date,date)', 'execute')
     OR has_function_privilege('authenticated', 'public.get_financial_control_summary(date,date,date,date,date)', 'execute')
     OR has_function_privilege('authenticated', 'public.get_financial_control_details(date,date,date,text,text,text,integer,integer)', 'execute')
     OR has_function_privilege('authenticated', 'public.get_insight_performance_detail(date,date,text,text)', 'execute') THEN
    RAISE EXCEPTION 'LEGACY_INSIGHT_RPC_REMAINS_EXPOSED';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.get_clinical_attendance_heatmap(date,date,uuid)', 'execute') THEN
    RAISE EXCEPTION 'MANAGEMENT_ATTENDANCE_DOMAIN_NOT_RESTORED';
  END IF;
  BEGIN
    PERFORM public.get_insight_clinic_health_metrics('2096-08-03', '2096-08-03');
    RAISE EXCEPTION 'DENIED_HEALTH_RPC_BYPASSED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  BEGIN
    PERFORM public.get_insight_financial_control_summary(
      '2096-08-03', '2096-08-03', '2096-08-02', '2096-08-02', '2096-08-03'
    );
    RAISE EXCEPTION 'DENIED_FINANCE_RPC_BYPASSED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  BEGIN
    PERFORM public.get_insight_clinical_attendance_heatmap('2096-08-03', '2096-08-03', NULL);
    RAISE EXCEPTION 'DENIED_ATTENDANCE_RPC_BYPASSED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  BEGIN
    PERFORM public.get_insight_performance('2096-08-03', '2096-08-03');
    RAISE EXCEPTION 'ACCOUNT_PERMISSION_DENIAL_BYPASSED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;

  PERFORM set_config('request.jwt.claim.sub', '73000000-0000-4000-8000-000000000004', true);
  BEGIN
    PERFORM public.get_insight_performance('2096-08-03', '2096-08-03');
    RAISE EXCEPTION 'LOCUM_OVERRIDE_GRANTED_INSIGHT';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  PERFORM set_config('request.jwt.claim.sub', '73000000-0000-4000-8000-000000000008', true);
  PERFORM public.get_clinical_attendance_heatmap('2096-08-03', '2096-08-03', NULL);
  BEGIN
    PERFORM public.get_insight_clinical_attendance_heatmap('2096-08-03', '2096-08-03', NULL);
    RAISE EXCEPTION 'MANAGEMENT_ONLY_USER_ENTERED_INSIGHT_ATTENDANCE';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  PERFORM set_config('request.jwt.claim.sub', '73000000-0000-4000-8000-000000000005', true);
  BEGIN
    PERFORM public.get_insight_performance('2096-08-03', '2096-08-03');
    RAISE EXCEPTION 'GUEST_OVERRIDE_GRANTED_INSIGHT';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;

  PERFORM set_config('request.jwt.claim.sub', '73000000-0000-4000-8000-000000000001', true);
  BEGIN
    PERFORM public.get_insight_performance('2096-08-04', '2096-08-03');
    RAISE EXCEPTION 'REVERSED_RANGE_SUCCEEDED';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  BEGIN
    PERFORM public.get_insight_performance('2095-08-04', '2096-08-02');
  EXCEPTION WHEN SQLSTATE '22023' THEN
    RAISE EXCEPTION 'MAXIMUM_INCLUSIVE_RANGE_REJECTED';
  END;
  BEGIN
    PERFORM public.get_insight_performance('2095-08-03', '2096-08-02');
    RAISE EXCEPTION 'OVER_MAXIMUM_RANGE_SUCCEEDED';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
END
$verify$;

RESET ROLE;
ROLLBACK;

SELECT jsonb_build_object(
  'status', 'pass',
  'roles', 'doctor_admin,resident_doctor,operations,locum,guest,admin',
  'metrics', 'pass',
  'resident_redaction', 'pass',
  'operations_suppression', 'pass',
  'overrides', 'pass',
  'transaction_end', 'ROLLBACK'
) AS insight_performance_verification;
