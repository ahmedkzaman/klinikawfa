-- Rollback-only integration verification for Yezza source identity and import audit tables.
--
-- Run against a non-production Supabase project after applying the matching
-- migration. Reaching the final result means every assertion passed.

BEGIN;

DO $setup$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM auth.users
    WHERE id IN (
      '72000000-0000-4000-8000-000000000001'::uuid,
      '72000000-0000-4000-8000-000000000002'::uuid
    )
  ) THEN
    RAISE EXCEPTION 'TEST_UUID_COLLISION';
  END IF;

  INSERT INTO auth.users (
    id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  )
  VALUES
    (
      '72000000-0000-4000-8000-000000000001',
      'authenticated', 'authenticated', 'yezza-import-admin@example.invalid',
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"TEST ONLY YEZZA IMPORT ADMIN"}'::jsonb,
      now(), now()
    ),
    (
      '72000000-0000-4000-8000-000000000002',
      'authenticated', 'authenticated', 'yezza-import-staff@example.invalid',
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"TEST ONLY YEZZA IMPORT STAFF"}'::jsonb,
      now(), now()
    );

  INSERT INTO public.user_roles (user_id, role)
  VALUES
    ('72000000-0000-4000-8000-000000000001', 'admin'::public.app_role),
    ('72000000-0000-4000-8000-000000000002', 'staff'::public.app_role);

  INSERT INTO public.patients (id, name, notes)
  VALUES (
    '72000000-0000-4000-8000-000000000101',
    'TEST ONLY YEZZA IMPORT PATIENT',
    ''
  );

  INSERT INTO public.queue_entries (
    id, patient_id, clinic_status, payment_method, created_by
  )
  VALUES (
    '72000000-0000-4000-8000-000000000201',
    '72000000-0000-4000-8000-000000000101',
    'registered',
    'cash',
    '72000000-0000-4000-8000-000000000001'
  );
END
$setup$;

DO $schema$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'patient_external_ids',
    'visit_external_ids',
    'transaction_external_ids',
    'import_batches'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_class AS c
      JOIN pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = v_table
        AND c.relkind = 'r'
        AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'RLS_NOT_ENABLED:%', v_table;
    END IF;
  END LOOP;
END
$schema$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config(
  'request.jwt.claim.sub',
  '72000000-0000-4000-8000-000000000001',
  true
);

DO $allowed$
DECLARE
  v_batch_id uuid := '72000000-0000-4000-8000-000000000301';
BEGIN
  INSERT INTO public.import_batches (
    id, source_system, status, source_counts, imported_counts,
    error_summary, started_at, created_by
  )
  VALUES (
    v_batch_id, 'yezza', 'running',
    '{"patients":1,"visits":1,"transactions":1}'::jsonb,
    '{}'::jsonb, '{}'::jsonb, now(),
    '72000000-0000-4000-8000-000000000001'
  );

  INSERT INTO public.patient_external_ids (
    source_system, source_patient_id, patient_id, import_batch_id
  )
  VALUES (
    'yezza', 'patient-001',
    '72000000-0000-4000-8000-000000000101', v_batch_id
  );
  INSERT INTO public.visit_external_ids (
    source_system, source_visit_id, queue_entry_id, import_batch_id
  )
  VALUES (
    'yezza', 'visit-001',
    '72000000-0000-4000-8000-000000000201', v_batch_id
  );
  INSERT INTO public.transaction_external_ids (
    source_system, source_bill_id, queue_entry_id, amount, paid_amount,
    import_batch_id
  )
  VALUES (
    'yezza', 'bill-001',
    '72000000-0000-4000-8000-000000000201', 12.50, 10.00, v_batch_id
  );

  BEGIN
    INSERT INTO public.patient_external_ids (
      source_system, source_patient_id, patient_id, import_batch_id
    ) VALUES (
      'yezza', 'patient-001',
      '72000000-0000-4000-8000-000000000101', v_batch_id
    );
    RAISE EXCEPTION 'DUPLICATE_PATIENT_SOURCE_KEY_SUCCEEDED';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.visit_external_ids (
      source_system, source_visit_id, queue_entry_id, import_batch_id
    ) VALUES (
      'yezza', 'visit-001',
      '72000000-0000-4000-8000-000000000201', v_batch_id
    );
    RAISE EXCEPTION 'DUPLICATE_VISIT_SOURCE_KEY_SUCCEEDED';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.transaction_external_ids (
      source_system, source_bill_id, queue_entry_id, amount, paid_amount,
      import_batch_id
    ) VALUES (
      'yezza', 'bill-001',
      '72000000-0000-4000-8000-000000000201', 12.50, 10.00, v_batch_id
    );
    RAISE EXCEPTION 'DUPLICATE_TRANSACTION_SOURCE_KEY_SUCCEEDED';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.patient_external_ids (
      source_system, source_patient_id, patient_id, import_batch_id
    ) VALUES (
      'yezza', 'missing-patient',
      '72000000-0000-4000-8000-000000000999', v_batch_id
    );
    RAISE EXCEPTION 'MISSING_PATIENT_FOREIGN_KEY_SUCCEEDED';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.visit_external_ids (
      source_system, source_visit_id, queue_entry_id, import_batch_id
    ) VALUES (
      'yezza', 'missing-visit',
      '72000000-0000-4000-8000-000000000999', v_batch_id
    );
    RAISE EXCEPTION 'MISSING_QUEUE_ENTRY_FOREIGN_KEY_SUCCEEDED';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.transaction_external_ids (
      source_system, source_bill_id, queue_entry_id, amount, paid_amount,
      import_batch_id
    ) VALUES (
      'yezza', 'missing-bill-queue',
      '72000000-0000-4000-8000-000000000999', 1, 0, v_batch_id
    );
    RAISE EXCEPTION 'MISSING_TRANSACTION_QUEUE_ENTRY_FOREIGN_KEY_SUCCEEDED';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.patient_external_ids (
      source_system, source_patient_id, patient_id, import_batch_id
    ) VALUES (
      'yezza', 'missing-batch',
      '72000000-0000-4000-8000-000000000101',
      '72000000-0000-4000-8000-000000000999'
    );
    RAISE EXCEPTION 'MISSING_IMPORT_BATCH_FOREIGN_KEY_SUCCEEDED';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
END
$allowed$;

SELECT set_config(
  'request.jwt.claim.sub',
  '72000000-0000-4000-8000-000000000002',
  true
);

DO $denied_staff$
BEGIN
  BEGIN
    INSERT INTO public.import_batches (
      id, source_system, status, created_by
    ) VALUES (
      '72000000-0000-4000-8000-000000000302',
      'yezza', 'running',
      '72000000-0000-4000-8000-000000000002'
    );
    RAISE EXCEPTION 'STAFF_IMPORT_WRITE_SUCCEEDED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$denied_staff$;

RESET ROLE;
SET LOCAL ROLE anon;

DO $denied_anon$
DECLARE
  v_count integer;
BEGIN
  BEGIN
    SELECT count(*) INTO v_count
    FROM public.import_batches;
    IF v_count <> 0 THEN
      RAISE EXCEPTION 'ANON_IMPORT_BATCH_READ_SUCCEEDED';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO public.import_batches (source_system, status)
    VALUES ('yezza', 'running');
    RAISE EXCEPTION 'ANON_IMPORT_BATCH_WRITE_SUCCEEDED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$denied_anon$;

RESET ROLE;
ROLLBACK;

SELECT jsonb_build_object(
  'status', 'pass',
  'tables', 4,
  'unique_source_keys', 'pass',
  'foreign_keys', 'pass',
  'rls', 'pass',
  'anonymous_access', 'denied',
  'transaction_end', 'ROLLBACK'
) AS yezza_source_identity_verification;
