-- Rollback-only integration verification for Yezza source identity and import audit tables.
-- Run only against a non-production Supabase project after the matching migration.

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
    id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) VALUES
    ('72000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
     'yezza-import-admin@example.invalid',
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"full_name":"TEST ONLY YEZZA IMPORT ADMIN"}'::jsonb, now(), now()),
    ('72000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
     'yezza-import-staff@example.invalid',
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"full_name":"TEST ONLY YEZZA IMPORT STAFF"}'::jsonb, now(), now()),
    ('72000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
     'yezza-import-special-admin@example.invalid',
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"full_name":"TEST ONLY YEZZA IMPORT SPECIAL ADMIN"}'::jsonb, now(), now());

  INSERT INTO public.user_roles (user_id, role) VALUES
    ('72000000-0000-4000-8000-000000000001', 'admin'::public.app_role),
    ('72000000-0000-4000-8000-000000000002', 'staff'::public.app_role),
    ('72000000-0000-4000-8000-000000000003', 'special_admin'::public.app_role);

  INSERT INTO public.patients (id, name, notes) VALUES (
    '72000000-0000-4000-8000-000000000101',
    'TEST ONLY YEZZA IMPORT PATIENT', ''
  );
  INSERT INTO public.queue_entries (
    id, patient_id, clinic_status, payment_method, created_by
  ) VALUES (
    '72000000-0000-4000-8000-000000000201',
    '72000000-0000-4000-8000-000000000101', 'registered', 'cash',
    '72000000-0000-4000-8000-000000000001'
  );
END
$setup$;

DO $schema$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'patient_external_ids', 'visit_external_ids',
    'transaction_external_ids', 'import_batches'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_class AS c
      JOIN pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = v_table
        AND c.relkind = 'r' AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'RLS_NOT_ENABLED:%', v_table;
    END IF;
  END LOOP;
END
$schema$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', '72000000-0000-4000-8000-000000000001', true);

DO $allowed_admin$
DECLARE
  v_batch_id uuid := '72000000-0000-4000-8000-000000000301';
BEGIN
  INSERT INTO public.import_batches (
    id, source_system, source_batch_id, status, source_counts,
    imported_counts, error_summary, started_at, created_by
  ) VALUES (
    v_batch_id, 'yezza', '2026-08-06-run-001', 'running',
    '{"patients":1,"visits":1,"transactions":1}'::jsonb,
    '{}'::jsonb, '{}'::jsonb, now(),
    '72000000-0000-4000-8000-000000000001'
  );

  INSERT INTO public.patient_external_ids (
    source_system, source_patient_id, patient_id, import_batch_id
  ) VALUES ('yezza', 'patient-001', '72000000-0000-4000-8000-000000000101', v_batch_id);
  INSERT INTO public.visit_external_ids (
    source_system, source_visit_id, queue_entry_id, import_batch_id
  ) VALUES ('yezza', 'visit-001', '72000000-0000-4000-8000-000000000201', v_batch_id);
  INSERT INTO public.transaction_external_ids (
    source_system, source_bill_id, queue_entry_id, amount, paid_amount, import_batch_id
  ) VALUES ('yezza', 'bill-001', '72000000-0000-4000-8000-000000000201', 12.50, 10.00, v_batch_id);

  BEGIN
    INSERT INTO public.import_batches (source_system, source_batch_id, status, created_by)
    VALUES ('yezza', '2026-08-06-run-001', 'running', '72000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'DUPLICATE_SOURCE_BATCH_SUCCEEDED';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.patient_external_ids (source_system, source_patient_id, patient_id, import_batch_id)
    VALUES ('yezza', 'patient-001', '72000000-0000-4000-8000-000000000101', v_batch_id);
    RAISE EXCEPTION 'DUPLICATE_PATIENT_SOURCE_KEY_SUCCEEDED';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.visit_external_ids (source_system, source_visit_id, queue_entry_id, import_batch_id)
    VALUES ('yezza', 'visit-001', '72000000-0000-4000-8000-000000000201', v_batch_id);
    RAISE EXCEPTION 'DUPLICATE_VISIT_SOURCE_KEY_SUCCEEDED';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.transaction_external_ids (source_system, source_bill_id, queue_entry_id, amount, paid_amount, import_batch_id)
    VALUES ('yezza', 'bill-001', '72000000-0000-4000-8000-000000000201', 12.50, 10.00, v_batch_id);
    RAISE EXCEPTION 'DUPLICATE_TRANSACTION_SOURCE_KEY_SUCCEEDED';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.import_batches (source_system, source_batch_id, status, created_by)
    VALUES ('yezza', 'forged-creator', 'running', '72000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'FORGED_CREATED_BY_SUCCEEDED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO public.patient_external_ids (source_system, source_patient_id, patient_id, import_batch_id)
    VALUES ('other', 'cross-source', '72000000-0000-4000-8000-000000000101', v_batch_id);
    RAISE EXCEPTION 'CROSS_SOURCE_BATCH_LINK_SUCCEEDED';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'IMPORT_BATCH_SOURCE_SYSTEM_MISMATCH' THEN RAISE; END IF;
  END;

  BEGIN
    INSERT INTO public.patient_external_ids (source_system, source_patient_id, patient_id, import_batch_id)
    VALUES ('yezza', 'missing-patient', '72000000-0000-4000-8000-000000000999', v_batch_id);
    RAISE EXCEPTION 'MISSING_PATIENT_FOREIGN_KEY_SUCCEEDED';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.visit_external_ids (source_system, source_visit_id, queue_entry_id, import_batch_id)
    VALUES ('yezza', 'missing-visit', '72000000-0000-4000-8000-000000000999', v_batch_id);
    RAISE EXCEPTION 'MISSING_VISIT_QUEUE_FOREIGN_KEY_SUCCEEDED';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.transaction_external_ids (source_system, source_bill_id, queue_entry_id, amount, paid_amount, import_batch_id)
    VALUES ('yezza', 'missing-transaction-queue', '72000000-0000-4000-8000-000000000999', 1, 0, v_batch_id);
    RAISE EXCEPTION 'MISSING_TRANSACTION_QUEUE_FOREIGN_KEY_SUCCEEDED';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.visit_external_ids (source_system, source_visit_id, queue_entry_id, import_batch_id)
    VALUES ('yezza', 'missing-visit-batch', '72000000-0000-4000-8000-000000000201', '72000000-0000-4000-8000-000000000999');
    RAISE EXCEPTION 'MISSING_VISIT_BATCH_FOREIGN_KEY_SUCCEEDED';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.transaction_external_ids (source_system, source_bill_id, queue_entry_id, amount, paid_amount, import_batch_id)
    VALUES ('yezza', 'missing-transaction-batch', '72000000-0000-4000-8000-000000000201', 1, 0, '72000000-0000-4000-8000-000000000999');
    RAISE EXCEPTION 'MISSING_TRANSACTION_BATCH_FOREIGN_KEY_SUCCEEDED';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN UPDATE public.patient_external_ids SET patient_id = patient_id WHERE source_patient_id = 'patient-001'; RAISE EXCEPTION 'PATIENT_MAPPING_UPDATE_SUCCEEDED'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN DELETE FROM public.patient_external_ids WHERE source_patient_id = 'patient-001'; RAISE EXCEPTION 'PATIENT_MAPPING_DELETE_SUCCEEDED'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE public.visit_external_ids SET queue_entry_id = queue_entry_id WHERE source_visit_id = 'visit-001'; RAISE EXCEPTION 'VISIT_MAPPING_UPDATE_SUCCEEDED'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN DELETE FROM public.visit_external_ids WHERE source_visit_id = 'visit-001'; RAISE EXCEPTION 'VISIT_MAPPING_DELETE_SUCCEEDED'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE public.transaction_external_ids SET amount = amount WHERE source_bill_id = 'bill-001'; RAISE EXCEPTION 'TRANSACTION_MAPPING_UPDATE_SUCCEEDED'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN DELETE FROM public.transaction_external_ids WHERE source_bill_id = 'bill-001'; RAISE EXCEPTION 'TRANSACTION_MAPPING_DELETE_SUCCEEDED'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.import_batches SET source_batch_id = 'mutated' WHERE id = v_batch_id;
    RAISE EXCEPTION 'IMPORT_BATCH_IDENTITY_UPDATE_SUCCEEDED';
  EXCEPTION WHEN invalid_parameter_value THEN
    IF SQLERRM <> 'IMPORT_BATCH_IDENTITY_IMMUTABLE' THEN RAISE; END IF;
  END;
END
$allowed_admin$;

DO $denied_roles$
DECLARE
  v_actor uuid;
  v_table text;
  v_count integer;
BEGIN
  FOREACH v_actor IN ARRAY ARRAY[
    '72000000-0000-4000-8000-000000000002'::uuid,
    '72000000-0000-4000-8000-000000000003'::uuid
  ] LOOP
    PERFORM set_config('request.jwt.claim.sub', v_actor::text, true);
    FOREACH v_table IN ARRAY ARRAY[
      'import_batches', 'patient_external_ids', 'visit_external_ids', 'transaction_external_ids'
    ] LOOP
      BEGIN
        EXECUTE format('SELECT count(*) FROM public.%I', v_table) INTO v_count;
        IF v_count <> 0 THEN RAISE EXCEPTION 'DENIED_ROLE_READ_SUCCEEDED:%:%', v_actor, v_table; END IF;
      EXCEPTION WHEN insufficient_privilege THEN NULL;
      END;
      BEGIN
        CASE v_table
          WHEN 'import_batches' THEN
            INSERT INTO public.import_batches (source_system, source_batch_id, status, created_by)
            VALUES ('yezza', 'denied-role-batch', 'running', v_actor);
          WHEN 'patient_external_ids' THEN
            INSERT INTO public.patient_external_ids (source_system, source_patient_id, patient_id, import_batch_id)
            VALUES ('yezza', 'denied-role-patient', '72000000-0000-4000-8000-000000000101', '72000000-0000-4000-8000-000000000301');
          WHEN 'visit_external_ids' THEN
            INSERT INTO public.visit_external_ids (source_system, source_visit_id, queue_entry_id, import_batch_id)
            VALUES ('yezza', 'denied-role-visit', '72000000-0000-4000-8000-000000000201', '72000000-0000-4000-8000-000000000301');
          WHEN 'transaction_external_ids' THEN
            INSERT INTO public.transaction_external_ids (source_system, source_bill_id, queue_entry_id, amount, paid_amount, import_batch_id)
            VALUES ('yezza', 'denied-role-bill', '72000000-0000-4000-8000-000000000201', 1, 0, '72000000-0000-4000-8000-000000000301');
        END CASE;
        RAISE EXCEPTION 'DENIED_ROLE_WRITE_SUCCEEDED:%:%', v_actor, v_table;
      EXCEPTION WHEN insufficient_privilege THEN NULL;
      END;
    END LOOP;
  END LOOP;
END
$denied_roles$;

RESET ROLE;
SET LOCAL ROLE anon;

DO $denied_anon$
DECLARE v_table text; v_count integer;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'import_batches', 'patient_external_ids', 'visit_external_ids', 'transaction_external_ids'
  ] LOOP
    BEGIN
      EXECUTE format('SELECT count(*) FROM public.%I', v_table) INTO v_count;
      IF v_count <> 0 THEN RAISE EXCEPTION 'ANON_READ_SUCCEEDED:%', v_table; END IF;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
      CASE v_table
        WHEN 'import_batches' THEN
          INSERT INTO public.import_batches (source_system, source_batch_id, status, created_by)
          VALUES ('yezza', 'anon-batch', 'running', '72000000-0000-4000-8000-000000000001');
        WHEN 'patient_external_ids' THEN
          INSERT INTO public.patient_external_ids (source_system, source_patient_id, patient_id, import_batch_id)
          VALUES ('yezza', 'anon-patient', '72000000-0000-4000-8000-000000000101', '72000000-0000-4000-8000-000000000301');
        WHEN 'visit_external_ids' THEN
          INSERT INTO public.visit_external_ids (source_system, source_visit_id, queue_entry_id, import_batch_id)
          VALUES ('yezza', 'anon-visit', '72000000-0000-4000-8000-000000000201', '72000000-0000-4000-8000-000000000301');
        WHEN 'transaction_external_ids' THEN
          INSERT INTO public.transaction_external_ids (source_system, source_bill_id, queue_entry_id, amount, paid_amount, import_batch_id)
          VALUES ('yezza', 'anon-bill', '72000000-0000-4000-8000-000000000201', 1, 0, '72000000-0000-4000-8000-000000000301');
      END CASE;
      RAISE EXCEPTION 'ANON_WRITE_SUCCEEDED:%', v_table;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
END
$denied_anon$;

RESET ROLE;
ROLLBACK;

SELECT jsonb_build_object(
  'status', 'pass', 'tables', 4, 'unique_source_keys', 'pass',
  'source_batch_deduplication', 'pass', 'foreign_keys', 'pass',
  'mapping_immutability', 'pass', 'role_boundaries', 'pass',
  'anonymous_access', 'denied', 'transaction_end', 'ROLLBACK'
) AS yezza_source_identity_verification;
