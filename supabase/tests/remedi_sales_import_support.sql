-- Rollback-only database acceptance fixture for the Remedi import boundary.
-- Run only after 20260828152615_add_remedi_sales_import_support.sql.

BEGIN;

DO $setup$
BEGIN
  IF EXISTS (
    SELECT 1 FROM auth.users
    WHERE id::text LIKE '73000000-0000-4000-8000-0000000000%'
  ) THEN
    RAISE EXCEPTION 'REMEDI_TEST_UUID_COLLISION';
  END IF;

  INSERT INTO auth.users (
    id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    '73000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'remedi-boundary-test@example.invalid',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"TEST ONLY REMEDI IMPORT ACTOR"}'::jsonb,
    now(), now()
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES ('73000000-0000-4000-8000-000000000001', 'staff'::public.app_role);

  INSERT INTO public.patients (id, name, national_id, notes) VALUES
    ('73000000-0000-4000-8000-000000000101', 'TEST ONLY REMEDI PATIENT', 'TEST-REMEDI-IC', 'TEST ONLY');

  IF NOT EXISTS (
    SELECT 1 FROM public.insurance_providers
    WHERE id = '72656d65-6469-4000-8000-000000000001'
      AND name = 'Legacy Remedi Corporate - Provider Unspecified'
      AND status = 'inactive'
  ) THEN
    RAISE EXCEPTION 'REMEDI_FIXED_PROVIDER_MISSING';
  END IF;

  INSERT INTO public.queue_entries (
    id, patient_id, queue_number, visit_type, payment_method, panel_id,
    clinic_status, created_at
  ) VALUES
    ('73000000-0000-4000-8000-000000000201', '73000000-0000-4000-8000-000000000101', 7301, 'consultation', 'cash', NULL, 'dispensing_payment', now()),
    ('73000000-0000-4000-8000-000000000202', '73000000-0000-4000-8000-000000000101', NULL, 'historical_import', 'cash', NULL, 'dispensing_payment', '2026-01-15 02:30:00+00'),
    ('73000000-0000-4000-8000-000000000203', '73000000-0000-4000-8000-000000000101', NULL, 'historical_import', 'panel', '72656d65-6469-4000-8000-000000000001', 'dispensing_payment', '2026-01-16 02:30:00+00');

  INSERT INTO public.consultations (
    id, queue_entry_id, patient_id, case_note, diagnosis_text, dispense_note, status
  ) VALUES
    ('73000000-0000-4000-8000-000000000301', '73000000-0000-4000-8000-000000000201', '73000000-0000-4000-8000-000000000101', '', '', '', 'in_progress'),
    ('73000000-0000-4000-8000-000000000302', '73000000-0000-4000-8000-000000000202', '73000000-0000-4000-8000-000000000101', '', '', '', 'in_progress'),
    ('73000000-0000-4000-8000-000000000303', '73000000-0000-4000-8000-000000000203', '73000000-0000-4000-8000-000000000101', '', '', '', 'in_progress');

  INSERT INTO public.consultation_items (
    id, consultation_id, item_name, quantity, price, unit_cost
  ) VALUES
    ('73000000-0000-4000-8000-000000000401', '73000000-0000-4000-8000-000000000301', 'TEST ONLY ORDINARY CHARGE', 1, 50, 0),
    ('73000000-0000-4000-8000-000000000402', '73000000-0000-4000-8000-000000000302', 'TEST ONLY HISTORICAL CHARGE', 1, 50, 0),
    ('73000000-0000-4000-8000-000000000403', '73000000-0000-4000-8000-000000000303', 'TEST ONLY PANEL CHARGE', 1, 80, 0);

  INSERT INTO private.remedi_import_batches (
    id, idempotency_key, status, source_manifest_sha256, bundle_sha256,
    compiler_version, patient_count, encounter_count, canonical_invoice_count,
    source_gross_amount, source_patient_collection, source_corporate_amount,
    counts_summary, started_at
  ) VALUES (
    '73000000-0000-4000-8000-000000000501',
    '73000000-0000-4000-8000-000000000502',
    'loading', repeat('a', 64), repeat('b', 64), 'test-only',
    1, 2, 5, 180, 100, 80, '{}'::jsonb, now()
  );

  INSERT INTO private.remedi_invoice_map (
    id, batch_id, idempotency_key, bill_number, patient_id,
    queue_entry_id, consultation_id, payment_ids, panel_claim_id,
    source_pdf_sha256, source_rows, page_row_references, source_key_hash,
    source_created_at, corporate_amount, cash_sales_amount, gross_amount,
    cash_amount, transfer_amount, card_amount, e_wallet_amount,
    patient_collection_amount, outstanding_amount, outstanding_payment,
    raw_labels, payment_allocations, reconciliation_status
  ) VALUES
    (
      '73000000-0000-4000-8000-000000000511', '73000000-0000-4000-8000-000000000501',
      '73000000-0000-4000-8000-000000000512', 'TEST-SELF-PAY',
      '73000000-0000-4000-8000-000000000101', '73000000-0000-4000-8000-000000000202',
      '73000000-0000-4000-8000-000000000302', ARRAY['73000000-0000-4000-8000-000000000601'::uuid], NULL,
      repeat('c', 64), ARRAY[2], '[]'::jsonb, repeat('d', 64), '2026-01-15 03:00:00+00',
      0, 50, 50, 50, 0, 0, 0, 50, 0, 0, '{}'::jsonb,
      '[{"payment_id":"73000000-0000-4000-8000-000000000601","payment_method":"cash","amount":"50.00"}]'::jsonb,
      'importable'
    ),
    (
      '73000000-0000-4000-8000-000000000521', '73000000-0000-4000-8000-000000000501',
      '73000000-0000-4000-8000-000000000522', 'TEST-PANEL',
      '73000000-0000-4000-8000-000000000101', '73000000-0000-4000-8000-000000000203',
      '73000000-0000-4000-8000-000000000303', ARRAY[]::uuid[], '73000000-0000-4000-8000-000000000602',
      repeat('e', 64), ARRAY[3], '[]'::jsonb, repeat('f', 64), '2026-01-16 03:00:00+00',
      80, 0, 80, 0, 0, 0, 0, 0, 0, 0, '{}'::jsonb, '[]'::jsonb, 'importable'
    ),
    (
      '73000000-0000-4000-8000-000000000531', '73000000-0000-4000-8000-000000000501',
      '73000000-0000-4000-8000-000000000532', 'TEST-MIXED-QUARANTINE',
      '73000000-0000-4000-8000-000000000101', '73000000-0000-4000-8000-000000000202',
      '73000000-0000-4000-8000-000000000302', ARRAY['73000000-0000-4000-8000-000000000611'::uuid], NULL,
      repeat('1', 64), ARRAY[4], '[]'::jsonb, repeat('2', 64), '2026-01-17 03:00:00+00',
      20, 30, 50, 30, 0, 0, 0, 30, 0, 0, '{}'::jsonb,
      '[{"payment_id":"73000000-0000-4000-8000-000000000611","payment_method":"cash","amount":"30.00"}]'::jsonb,
      'mixed_panel_self_pay'
    ),
    (
      '73000000-0000-4000-8000-000000000541', '73000000-0000-4000-8000-000000000501',
      '73000000-0000-4000-8000-000000000542', 'TEST-ZERO-QUARANTINE',
      NULL, NULL, NULL, ARRAY[]::uuid[], NULL, repeat('3', 64), ARRAY[5], '[]'::jsonb, repeat('4', 64),
      '2026-01-18 03:00:00+00', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, '{}'::jsonb, '[]'::jsonb,
      'zero_total_ledger_only'
    ),
    (
      '73000000-0000-4000-8000-000000000551', '73000000-0000-4000-8000-000000000501',
      '73000000-0000-4000-8000-000000000552', 'TEST-IMBALANCED-QUARANTINE',
      '73000000-0000-4000-8000-000000000101', '73000000-0000-4000-8000-000000000202',
      '73000000-0000-4000-8000-000000000302', ARRAY['73000000-0000-4000-8000-000000000612'::uuid], NULL,
      repeat('5', 64), ARRAY[6], '[]'::jsonb, repeat('6', 64), '2026-01-19 03:00:00+00',
      0, 40, 50, 40, 0, 0, 0, 40, 0, 0, '{}'::jsonb,
      '[{"payment_id":"73000000-0000-4000-8000-000000000612","payment_method":"cash","amount":"40.00"}]'::jsonb,
      'invoice_total_imbalance'
    );
END
$setup$;

-- Ordinary payment writes must keep their existing auth.uid requirement and
-- server-owned timestamp behavior when no import context is active. This
-- restored local database intentionally omits production grants, so the owner
-- exercises the trigger while request JWT claims supply the ordinary actor.
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', '', true);

DO $missing_actor_verify$
BEGIN
  BEGIN
    INSERT INTO public.payments (
      id, queue_entry_id, consultation_id, payment_type, payment_method, amount
    ) VALUES (
      '73000000-0000-4000-8000-000000000699',
      '73000000-0000-4000-8000-000000000201',
      '73000000-0000-4000-8000-000000000301',
      'self_pay', 'cash', 50
    );
    RAISE EXCEPTION 'ORDINARY_PAYMENT_WITHOUT_ACTOR_SUCCEEDED';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    IF SQLERRM <> 'PAYMENT_ACTOR_REQUIRED' THEN RAISE; END IF;
  END;
END
$missing_actor_verify$;

SELECT set_config('request.jwt.claim.sub', '73000000-0000-4000-8000-000000000001', true);

INSERT INTO public.payments (
  id, queue_entry_id, consultation_id, payment_type, payment_method,
  amount, created_by, created_at
) VALUES (
  '73000000-0000-4000-8000-000000000600',
  '73000000-0000-4000-8000-000000000201',
  '73000000-0000-4000-8000-000000000301',
  'self_pay', 'cash', 50,
  '73000000-0000-4000-8000-000000000099', '2000-01-01 00:00:00+00'
);

DO $ordinary_verify$
DECLARE
  v_payment public.payments%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_payment FROM public.payments
  WHERE id = '73000000-0000-4000-8000-000000000600';
  IF v_payment.created_by IS DISTINCT FROM '73000000-0000-4000-8000-000000000001'::uuid
     OR v_payment.created_at = '2000-01-01 00:00:00+00'::timestamptz
     OR v_payment.created_at < pg_catalog.statement_timestamp() - interval '1 minute' THEN
    RAISE EXCEPTION 'ORDINARY_PAYMENT_PROVENANCE_NOT_SERVER_OWNED';
  END IF;
END
$ordinary_verify$;

DO $privilege_verify$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'remedi_import_batches', 'remedi_source_files', 'remedi_patient_map',
    'remedi_encounter_map', 'remedi_invoice_map', 'remedi_import_conflicts',
    'remedi_import_context'
  ]
  LOOP
    IF has_table_privilege('anon', 'private.' || v_table, 'SELECT,INSERT,UPDATE,DELETE')
       OR has_table_privilege('authenticated', 'private.' || v_table, 'SELECT,INSERT,UPDATE,DELETE')
       OR has_table_privilege('service_role', 'private.' || v_table, 'SELECT,INSERT,UPDATE,DELETE') THEN
      RAISE EXCEPTION 'REMEDI_LEDGER_PRIVILEGE_LEAK: %', v_table;
    END IF;
  END LOOP;

  IF has_function_privilege(
       'authenticated',
       'private.import_remedi_payment(uuid,text,uuid,uuid,uuid,uuid,numeric,text,timestamptz)',
       'EXECUTE'
     ) OR has_function_privilege(
       'service_role',
       'private.import_remedi_panel_claim(uuid,text,uuid,uuid,uuid,uuid,numeric,timestamptz)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'REMEDI_IMPORT_FUNCTION_PRIVILEGE_LEAK';
  END IF;
END
$privilege_verify$;

DO $owner_import_verify$
DECLARE
  v_result uuid;
BEGIN
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '', true);
  PERFORM pg_catalog.set_config('request.jwt.claim.role', '', true);
  PERFORM private.begin_remedi_import_context(
    '73000000-0000-4000-8000-000000000501',
    '73000000-0000-4000-8000-000000000001'
  );

  BEGIN
    PERFORM private.import_remedi_payment(
      '73000000-0000-4000-8000-000000000501', 'TEST-SELF-PAY',
      '73000000-0000-4000-8000-000000000601',
      '73000000-0000-4000-8000-000000000202',
      '73000000-0000-4000-8000-000000000302',
      '73000000-0000-4000-8000-000000000001',
      49, 'cash', '2026-01-15 03:00:00+00'
    );
    RAISE EXCEPTION 'FORGED_REMEDI_AMOUNT_SUCCEEDED';
  EXCEPTION WHEN SQLSTATE '23503' THEN
    IF SQLERRM <> 'REMEDI_PAYMENT_LEDGER_MISMATCH' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM private.import_remedi_payment(
      '73000000-0000-4000-8000-000000000501', 'TEST-SELF-PAY',
      '73000000-0000-4000-8000-000000000601',
      '73000000-0000-4000-8000-000000000202',
      '73000000-0000-4000-8000-000000000302',
      '73000000-0000-4000-8000-000000000001',
      50, 'cash', '2026-01-15 03:01:00+00'
    );
    RAISE EXCEPTION 'FORGED_REMEDI_TIME_SUCCEEDED';
  EXCEPTION WHEN SQLSTATE '23503' THEN
    IF SQLERRM <> 'REMEDI_PAYMENT_LEDGER_MISMATCH' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM private.import_remedi_payment(
      '73000000-0000-4000-8000-000000000501', 'TEST-SELF-PAY',
      '73000000-0000-4000-8000-000000000601',
      '73000000-0000-4000-8000-000000000202',
      '73000000-0000-4000-8000-000000000302',
      '73000000-0000-4000-8000-000000000099',
      50, 'cash', '2026-01-15 03:00:00+00'
    );
    RAISE EXCEPTION 'FORGED_REMEDI_ACTOR_SUCCEEDED';
  EXCEPTION WHEN SQLSTATE '23503' THEN
    IF SQLERRM <> 'REMEDI_PAYMENT_LEDGER_MISMATCH' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM private.import_remedi_payment(
      '73000000-0000-4000-8000-000000000501', 'TEST-SELF-PAY',
      '73000000-0000-4000-8000-000000000601',
      '73000000-0000-4000-8000-000000000202',
      '73000000-0000-4000-8000-000000000302',
      '73000000-0000-4000-8000-000000000001',
      50, 'bitcoin', '2026-01-15 03:00:00+00'
    );
    RAISE EXCEPTION 'FORGED_REMEDI_METHOD_SUCCEEDED';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM <> 'REMEDI_PAYMENT_METHOD_INVALID' THEN RAISE; END IF;
  END;

  v_result := private.import_remedi_payment(
    '73000000-0000-4000-8000-000000000501', 'TEST-SELF-PAY',
    '73000000-0000-4000-8000-000000000601',
    '73000000-0000-4000-8000-000000000202',
    '73000000-0000-4000-8000-000000000302',
    '73000000-0000-4000-8000-000000000001',
    50, 'cash', '2026-01-15 03:00:00+00'
  );
  IF v_result IS DISTINCT FROM '73000000-0000-4000-8000-000000000601'::uuid THEN
    RAISE EXCEPTION 'REMEDI_PAYMENT_INSERT_ID_MISMATCH';
  END IF;

  IF private.import_remedi_payment(
    '73000000-0000-4000-8000-000000000501', 'TEST-SELF-PAY',
    '73000000-0000-4000-8000-000000000601',
    '73000000-0000-4000-8000-000000000202',
    '73000000-0000-4000-8000-000000000302',
    '73000000-0000-4000-8000-000000000001',
    50, 'cash', '2026-01-15 03:00:00+00'
  ) IS DISTINCT FROM v_result THEN
    RAISE EXCEPTION 'REMEDI_PAYMENT_IDEMPOTENT_RERUN_MISMATCH';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.payments
    WHERE id = v_result
      AND created_by = '73000000-0000-4000-8000-000000000001'
      AND created_at = '2026-01-15 03:00:00+00'
      AND amount = 50 AND payment_method = 'cash'
  ) THEN
    RAISE EXCEPTION 'REMEDI_PAYMENT_HISTORICAL_PROVENANCE_MISMATCH';
  END IF;

  v_result := private.import_remedi_panel_claim(
    '73000000-0000-4000-8000-000000000501', 'TEST-PANEL',
    '73000000-0000-4000-8000-000000000602',
    '73000000-0000-4000-8000-000000000203',
    '73000000-0000-4000-8000-000000000101',
    '72656d65-6469-4000-8000-000000000001',
    80, '2026-01-16 03:00:00+00'
  );
  IF v_result IS DISTINCT FROM '73000000-0000-4000-8000-000000000602'::uuid THEN
    RAISE EXCEPTION 'REMEDI_PANEL_INSERT_ID_MISMATCH';
  END IF;

  BEGIN
    PERFORM private.import_remedi_payment(
      '73000000-0000-4000-8000-000000000501', 'TEST-MIXED-QUARANTINE',
      '73000000-0000-4000-8000-000000000611',
      '73000000-0000-4000-8000-000000000202',
      '73000000-0000-4000-8000-000000000302',
      '73000000-0000-4000-8000-000000000001',
      30, 'cash', '2026-01-17 03:00:00+00'
    );
    RAISE EXCEPTION 'MIXED_QUARANTINE_PUBLIC_WRITE_SUCCEEDED';
  EXCEPTION WHEN SQLSTATE '23503' THEN
    IF SQLERRM <> 'REMEDI_PAYMENT_LEDGER_MISMATCH' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM private.import_remedi_payment(
      '73000000-0000-4000-8000-000000000501', 'TEST-IMBALANCED-QUARANTINE',
      '73000000-0000-4000-8000-000000000612',
      '73000000-0000-4000-8000-000000000202',
      '73000000-0000-4000-8000-000000000302',
      '73000000-0000-4000-8000-000000000001',
      40, 'cash', '2026-01-19 03:00:00+00'
    );
    RAISE EXCEPTION 'IMBALANCED_QUARANTINE_PUBLIC_WRITE_SUCCEEDED';
  EXCEPTION WHEN SQLSTATE '23503' THEN
    IF SQLERRM <> 'REMEDI_PAYMENT_LEDGER_MISMATCH' THEN RAISE; END IF;
  END;

  IF EXISTS (
    SELECT 1 FROM public.payments
    WHERE id IN (
      '73000000-0000-4000-8000-000000000611',
      '73000000-0000-4000-8000-000000000612'
    )
  ) OR EXISTS (
    SELECT 1 FROM public.queue_entries
    WHERE id = '73000000-0000-4000-8000-000000000541'
  ) THEN
    RAISE EXCEPTION 'QUARANTINE_OR_ZERO_TOTAL_PUBLIC_ARTIFACT_CREATED';
  END IF;
END
$owner_import_verify$;

ROLLBACK;

SELECT jsonb_build_object(
  'status', 'pass',
  'ordinary_payment_provenance', 'pass',
  'owner_historical_timestamp', 'pass',
  'forged_inputs', 'pass',
  'idempotent_rerun', 'pass',
  'panel_only', 'pass',
  'quarantine_boundaries', 'pass',
  'private_privileges', 'pass',
  'transaction_end', 'ROLLBACK'
) AS remedi_sales_import_support_verification;
