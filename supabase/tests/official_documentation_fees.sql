-- Rollback-only acceptance verification for official documentation fees.
--
-- Safety properties:
--   * fixed synthetic UUIDs and TEST ONLY labels;
--   * no reads of existing clinical rows;
--   * reviewed RPCs execute as authenticated users with synthetic JWT claims;
--   * every invariant raises a named exception on failure;
--   * there is deliberately no COMMIT statement.

BEGIN;

DO $setup$
DECLARE
  v_actor uuid;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM auth.users
    WHERE id::text LIKE '71000000-0000-4000-8000-0000000000%'
  ) OR EXISTS (
    SELECT 1
    FROM public.patients
    WHERE id::text LIKE '71000000-0000-4000-8000-0000000001%'
  ) THEN
    RAISE EXCEPTION 'TEST_UUID_COLLISION';
  END IF;

  FOR v_actor IN
    SELECT unnest(ARRAY[
      '71000000-0000-4000-8000-000000000001'::uuid,
      '71000000-0000-4000-8000-000000000002'::uuid,
      '71000000-0000-4000-8000-000000000003'::uuid,
      '71000000-0000-4000-8000-000000000004'::uuid,
      '71000000-0000-4000-8000-000000000005'::uuid,
      '71000000-0000-4000-8000-000000000006'::uuid,
      '71000000-0000-4000-8000-000000000011'::uuid,
      '71000000-0000-4000-8000-000000000012'::uuid,
      '71000000-0000-4000-8000-000000000013'::uuid
    ])
  LOOP
    INSERT INTO auth.users (
      id,
      aud,
      role,
      email,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    )
    VALUES (
      v_actor,
      'authenticated',
      'authenticated',
      'official-document-fee-' || right(v_actor::text, 2) || '@example.invalid',
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"TEST ONLY OFFICIAL DOCUMENT FEE ACTOR"}'::jsonb,
      now(),
      now()
    );
  END LOOP;

  INSERT INTO public.user_roles (user_id, role)
  SELECT u.id, 'guest'::public.app_role
  FROM auth.users u
  WHERE u.id::text LIKE '71000000-0000-4000-8000-0000000000%'
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = u.id
    );

  UPDATE public.user_roles
  SET role = CASE user_id
    WHEN '71000000-0000-4000-8000-000000000001' THEN 'ops_staff'::public.app_role
    WHEN '71000000-0000-4000-8000-000000000002' THEN 'operations'::public.app_role
    WHEN '71000000-0000-4000-8000-000000000003' THEN 'staff'::public.app_role
    WHEN '71000000-0000-4000-8000-000000000004' THEN 'resident_doctor'::public.app_role
    WHEN '71000000-0000-4000-8000-000000000005' THEN 'admin'::public.app_role
    WHEN '71000000-0000-4000-8000-000000000006' THEN 'doctor_admin'::public.app_role
    WHEN '71000000-0000-4000-8000-000000000011' THEN 'locum'::public.app_role
    WHEN '71000000-0000-4000-8000-000000000012' THEN 'special_admin'::public.app_role
    WHEN '71000000-0000-4000-8000-000000000013' THEN 'guest'::public.app_role
  END
  WHERE user_id::text LIKE '71000000-0000-4000-8000-0000000000%';

  IF (
    SELECT count(*)
    FROM public.user_roles
    WHERE user_id::text LIKE '71000000-0000-4000-8000-0000000000%'
  ) IS DISTINCT FROM 9 THEN
    RAISE EXCEPTION 'SYNTHETIC_ROLE_SETUP_FAILED';
  END IF;

  INSERT INTO public.patients (id, name, notes)
  VALUES
    (
      '71000000-0000-4000-8000-000000000101',
      'TEST ONLY DOCUMENT FEE CASH PATIENT',
      ''
    ),
    (
      '71000000-0000-4000-8000-000000000102',
      'TEST ONLY DOCUMENT FEE PANEL PATIENT',
      ''
    ),
    (
      '71000000-0000-4000-8000-000000000103',
      'TEST ONLY DOCUMENT FEE COMPLETED CASH PATIENT',
      ''
    );

  INSERT INTO public.insurance_providers (
    id,
    name,
    status,
    panel_type,
    submission_preference
  )
  VALUES (
    '71000000-0000-4000-8000-000000000801',
    'TEST ONLY DOCUMENT FEE PANEL',
    'active',
    'tpa',
    'bulk_claim'
  );

  INSERT INTO public.queue_entries (
    id,
    patient_id,
    clinic_status,
    payment_method,
    panel_id,
    created_by
  )
  VALUES
    (
      '71000000-0000-4000-8000-000000000201',
      '71000000-0000-4000-8000-000000000101',
      'registered',
      'cash',
      NULL,
      '71000000-0000-4000-8000-000000000001'
    ),
    (
      '71000000-0000-4000-8000-000000000202',
      '71000000-0000-4000-8000-000000000102',
      'registered',
      'panel',
      '71000000-0000-4000-8000-000000000801',
      '71000000-0000-4000-8000-000000000001'
    ),
    (
      '71000000-0000-4000-8000-000000000203',
      '71000000-0000-4000-8000-000000000103',
      'registered',
      'cash',
      NULL,
      '71000000-0000-4000-8000-000000000001'
    );

  INSERT INTO public.consultations (
    id,
    queue_entry_id,
    patient_id,
    status,
    case_note,
    diagnosis_text,
    dispense_note
  )
  VALUES
    (
      '71000000-0000-4000-8000-000000000301',
      '71000000-0000-4000-8000-000000000201',
      '71000000-0000-4000-8000-000000000101',
      'in_progress',
      '',
      '',
      ''
    ),
    (
      '71000000-0000-4000-8000-000000000302',
      '71000000-0000-4000-8000-000000000202',
      '71000000-0000-4000-8000-000000000102',
      'in_progress',
      '',
      '',
      ''
    ),
    (
      '71000000-0000-4000-8000-000000000303',
      '71000000-0000-4000-8000-000000000203',
      '71000000-0000-4000-8000-000000000103',
      'in_progress',
      '',
      '',
      ''
    );

  INSERT INTO public.consultation_items (
    id,
    consultation_id,
    item_name,
    quantity,
    price,
    unit_cost
  )
  VALUES
    (
      '71000000-0000-4000-8000-000000000501',
      '71000000-0000-4000-8000-000000000301',
      'TEST ONLY CASH BASE CHARGE',
      1,
      20,
      0
    ),
    (
      '71000000-0000-4000-8000-000000000502',
      '71000000-0000-4000-8000-000000000302',
      'TEST ONLY PANEL BASE CHARGE',
      1,
      100,
      0
    ),
    (
      '71000000-0000-4000-8000-000000000503',
      '71000000-0000-4000-8000-000000000303',
      'TEST ONLY COMPLETED CASH BASE CHARGE',
      1,
      50,
      0
    );

  UPDATE public.consultations
  SET status = 'completed'
  WHERE id IN (
    '71000000-0000-4000-8000-000000000302',
    '71000000-0000-4000-8000-000000000303'
  );

  UPDATE public.queue_entries
  SET clinic_status = 'completed'
  WHERE id IN (
    '71000000-0000-4000-8000-000000000202',
    '71000000-0000-4000-8000-000000000203'
  );

  INSERT INTO public.payments (
    id,
    queue_entry_id,
    consultation_id,
    payment_type,
    payment_method,
    amount,
    notes
  )
  VALUES (
    '71000000-0000-4000-8000-000000000601',
    '71000000-0000-4000-8000-000000000203',
    '71000000-0000-4000-8000-000000000303',
    'self_pay',
    'cash',
    50,
    'TEST ONLY PAID BEFORE LATE DOCUMENT'
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.panel_claims
    WHERE queue_entry_id = '71000000-0000-4000-8000-000000000202'
      AND amount = 100
  ) THEN
    RAISE EXCEPTION 'SYNTHETIC_PANEL_CLAIM_NOT_CREATED';
  END IF;
END
$setup$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $verify$
DECLARE
  v_actor uuid;
  v_document public.consultation_documents;
  v_active_count integer;
  v_total numeric;
  v_paid numeric;
  v_claim_amount numeric;
  v_claim_status public.panel_claim_status;
  v_audit_before integer;
BEGIN
  IF (
    SELECT jsonb_object_agg(document_type, amount ORDER BY document_type)
    FROM public.clinic_document_fees
  ) IS DISTINCT FROM
    '{"mc":15.00,"prescription":15.00,"referral":15.00}'::jsonb THEN
    RAISE EXCEPTION 'RM15_DEFAULTS_MISMATCH';
  END IF;

  FOREACH v_actor IN ARRAY ARRAY[
    '71000000-0000-4000-8000-000000000001'::uuid,
    '71000000-0000-4000-8000-000000000002'::uuid,
    '71000000-0000-4000-8000-000000000003'::uuid,
    '71000000-0000-4000-8000-000000000004'::uuid,
    '71000000-0000-4000-8000-000000000005'::uuid,
    '71000000-0000-4000-8000-000000000006'::uuid
  ] LOOP
    PERFORM set_config('request.jwt.claim.sub', v_actor::text, true);
    PERFORM public.set_clinic_document_fee('mc', 15.00);
  END LOOP;

  FOREACH v_actor IN ARRAY ARRAY[
    '71000000-0000-4000-8000-000000000011'::uuid,
    '71000000-0000-4000-8000-000000000012'::uuid,
    '71000000-0000-4000-8000-000000000013'::uuid
  ] LOOP
    PERFORM set_config('request.jwt.claim.sub', v_actor::text, true);
    BEGIN
      PERFORM public.set_clinic_document_fee('mc', 15.00);
      RAISE EXCEPTION 'DENIED_MC_PRICE_UPDATE_SUCCEEDED';
    EXCEPTION WHEN SQLSTATE '42501' THEN
      IF SQLERRM <> 'NOT_AUTHORIZED' THEN
        RAISE;
      END IF;
    END;
  END LOOP;

  FOREACH v_actor IN ARRAY ARRAY[
    '71000000-0000-4000-8000-000000000005'::uuid,
    '71000000-0000-4000-8000-000000000006'::uuid
  ] LOOP
    PERFORM set_config('request.jwt.claim.sub', v_actor::text, true);
    PERFORM public.set_clinic_document_fee('prescription', 15.00);
    PERFORM public.set_clinic_document_fee('referral', 15.00);
  END LOOP;

  FOREACH v_actor IN ARRAY ARRAY[
    '71000000-0000-4000-8000-000000000001'::uuid,
    '71000000-0000-4000-8000-000000000002'::uuid,
    '71000000-0000-4000-8000-000000000003'::uuid,
    '71000000-0000-4000-8000-000000000004'::uuid,
    '71000000-0000-4000-8000-000000000011'::uuid,
    '71000000-0000-4000-8000-000000000012'::uuid,
    '71000000-0000-4000-8000-000000000013'::uuid
  ] LOOP
    PERFORM set_config('request.jwt.claim.sub', v_actor::text, true);
    BEGIN
      PERFORM public.set_clinic_document_fee('prescription', 15.00);
      RAISE EXCEPTION 'DENIED_PRESCRIPTION_PRICE_UPDATE_SUCCEEDED';
    EXCEPTION WHEN SQLSTATE '42501' THEN
      IF SQLERRM <> 'NOT_AUTHORIZED' THEN
        RAISE;
      END IF;
    END;
    BEGIN
      PERFORM public.set_clinic_document_fee('referral', 15.00);
      RAISE EXCEPTION 'DENIED_REFERRAL_PRICE_UPDATE_SUCCEEDED';
    EXCEPTION WHEN SQLSTATE '42501' THEN
      IF SQLERRM <> 'NOT_AUTHORIZED' THEN
        RAISE;
      END IF;
    END;
  END LOOP;

  PERFORM set_config(
    'request.jwt.claim.sub',
    '71000000-0000-4000-8000-000000000005',
    true
  );
  BEGIN
    PERFORM public.set_clinic_document_fee('mc', -0.01);
    RAISE EXCEPTION 'NEGATIVE_PRICE_SUCCEEDED';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM <> 'INVALID_DOCUMENT_FEE' THEN
      RAISE;
    END IF;
  END;
  BEGIN
    PERFORM public.set_clinic_document_fee('mc', 15.001);
    RAISE EXCEPTION 'THREE_DECIMAL_PRICE_SUCCEEDED';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM <> 'INVALID_DOCUMENT_FEE' THEN
      RAISE;
    END IF;
  END;

  PERFORM set_config(
    'request.jwt.claim.sub',
    '71000000-0000-4000-8000-000000000001',
    true
  );
  v_document := public.issue_consultation_document_with_fee(
    '71000000-0000-4000-8000-000000000401',
    '71000000-0000-4000-8000-000000000301',
    '71000000-0000-4000-8000-000000000101',
    NULL,
    'TEST ONLY MEDICAL CERTIFICATE',
    'mc',
    'TEST ONLY MC CONTENT',
    'A4',
    'portrait'
  );
  IF v_document.id IS DISTINCT FROM
      '71000000-0000-4000-8000-000000000401'::uuid THEN
    RAISE EXCEPTION 'ISSUE_DOCUMENT_ID_MISMATCH';
  END IF;

  SELECT count(*), COALESCE(sum(price * quantity), 0)
  INTO v_active_count, v_total
  FROM public.consultation_items
  WHERE consultation_id = '71000000-0000-4000-8000-000000000301'
    AND source_document_id = '71000000-0000-4000-8000-000000000401'
    AND source_document_type = 'mc'
    AND item_name = 'Official Documentation Fees'
    AND deleted_at IS NULL;
  IF v_active_count IS DISTINCT FROM 1 OR v_total IS DISTINCT FROM 15 THEN
    RAISE EXCEPTION 'ONE_CHARGE_ON_ISSUE_FAILED';
  END IF;

  v_document := public.issue_consultation_document_with_fee(
    '71000000-0000-4000-8000-000000000401',
    '71000000-0000-4000-8000-000000000301',
    '71000000-0000-4000-8000-000000000101',
    NULL,
    'TEST ONLY MEDICAL CERTIFICATE',
    'mc',
    'TEST ONLY MC CONTENT',
    'A4',
    'portrait'
  );
  SELECT count(*)
  INTO v_active_count
  FROM public.consultation_items
  WHERE source_document_id = '71000000-0000-4000-8000-000000000401'
    AND deleted_at IS NULL;
  IF v_active_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'IDEMPOTENT_RETRY_DUPLICATED_CHARGE';
  END IF;

  UPDATE public.consultation_documents
  SET content = 'TEST ONLY EDITED MC CONTENT'
  WHERE id = '71000000-0000-4000-8000-000000000401';
  SELECT count(*)
  INTO v_active_count
  FROM public.consultation_items
  WHERE source_document_id = '71000000-0000-4000-8000-000000000401'
    AND deleted_at IS NULL;
  IF v_active_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'DOCUMENT_UPDATE_DUPLICATED_CHARGE';
  END IF;

  BEGIN
    INSERT INTO public.consultation_items (
      consultation_id,
      item_name,
      quantity,
      price,
      unit_cost,
      source_document_id,
      source_document_type
    )
    VALUES (
      '71000000-0000-4000-8000-000000000301',
      'Official Documentation Fees',
      1,
      15,
      0,
      '71000000-0000-4000-8000-000000000401',
      'mc'
    );
    RAISE EXCEPTION 'DUPLICATE_ACTIVE_SOURCE_SUCCEEDED';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  SELECT COALESCE(sum(price * quantity), 0)
  INTO v_total
  FROM public.consultation_items
  WHERE consultation_id = '71000000-0000-4000-8000-000000000301'
    AND deleted_at IS NULL;
  IF v_total IS DISTINCT FROM 35 THEN
    RAISE EXCEPTION 'CASH_TOTAL_EXCLUDES_DOCUMENT_FEE';
  END IF;

  SELECT count(*)
  INTO v_audit_before
  FROM public.get_completed_bill_correction_history(
    '71000000-0000-4000-8000-000000000202',
    100,
    NULL,
    NULL
  );

  v_document := public.issue_consultation_document_with_fee(
    '71000000-0000-4000-8000-000000000402',
    '71000000-0000-4000-8000-000000000302',
    '71000000-0000-4000-8000-000000000102',
    NULL,
    'TEST ONLY PRESCRIPTION',
    'prescription',
    'TEST ONLY PRESCRIPTION CONTENT',
    'A4',
    'portrait'
  );

  SELECT amount, status
  INTO STRICT v_claim_amount, v_claim_status
  FROM public.panel_claims
  WHERE queue_entry_id = '71000000-0000-4000-8000-000000000202';
  IF v_claim_amount IS DISTINCT FROM 115
     OR v_claim_status IS DISTINCT FROM 'pending'::public.panel_claim_status THEN
    RAISE EXCEPTION 'PANEL_TOTAL_EXCLUDES_DOCUMENT_FEE';
  END IF;
  IF (
    SELECT count(*)
    FROM public.get_completed_bill_correction_history(
      '71000000-0000-4000-8000-000000000202',
      100,
      NULL,
      NULL
    )
  ) IS DISTINCT FROM v_audit_before + 1 THEN
    RAISE EXCEPTION 'COMPLETED_PANEL_AUDIT_MISSING';
  END IF;

  SELECT count(*)
  INTO v_audit_before
  FROM public.get_completed_bill_correction_history(
    '71000000-0000-4000-8000-000000000203',
    100,
    NULL,
    NULL
  );

  v_document := public.issue_consultation_document_with_fee(
    '71000000-0000-4000-8000-000000000403',
    '71000000-0000-4000-8000-000000000303',
    '71000000-0000-4000-8000-000000000103',
    NULL,
    'TEST ONLY REFERRAL',
    'referral',
    'TEST ONLY REFERRAL CONTENT',
    'A4',
    'portrait'
  );
  SELECT COALESCE(sum(price * quantity), 0)
  INTO v_total
  FROM public.consultation_items
  WHERE consultation_id = '71000000-0000-4000-8000-000000000303'
    AND deleted_at IS NULL;
  SELECT COALESCE(sum(amount), 0)
  INTO v_paid
  FROM public.payments
  WHERE queue_entry_id = '71000000-0000-4000-8000-000000000203'
    AND deleted_at IS NULL;
  IF v_total IS DISTINCT FROM 65
     OR v_paid IS DISTINCT FROM 50
     OR v_total - v_paid IS DISTINCT FROM 15 THEN
    RAISE EXCEPTION 'PAID_VISIT_OUTSTANDING_MISMATCH';
  END IF;
  IF (
    SELECT count(*)
    FROM public.get_completed_bill_correction_history(
      '71000000-0000-4000-8000-000000000203',
      100,
      NULL,
      NULL
    )
  ) IS DISTINCT FROM v_audit_before + 1 THEN
    RAISE EXCEPTION 'COMPLETED_CASH_AUDIT_MISSING';
  END IF;

  PERFORM public.void_consultation_document_with_fee(
    '71000000-0000-4000-8000-000000000403'
  );
  SELECT COALESCE(sum(price * quantity), 0)
  INTO v_total
  FROM public.consultation_items
  WHERE consultation_id = '71000000-0000-4000-8000-000000000303'
    AND deleted_at IS NULL;
  SELECT COALESCE(sum(amount), 0)
  INTO v_paid
  FROM public.payments
  WHERE queue_entry_id = '71000000-0000-4000-8000-000000000203'
    AND deleted_at IS NULL;
  IF v_total IS DISTINCT FROM 50 OR v_paid IS DISTINCT FROM 50 THEN
    RAISE EXCEPTION 'COMPLETED_VOID_DID_NOT_REVERSE_LINKED_FEE';
  END IF;
  IF (
    SELECT count(*)
    FROM public.get_completed_bill_correction_history(
      '71000000-0000-4000-8000-000000000203',
      100,
      NULL,
      NULL
    )
  ) IS DISTINCT FROM v_audit_before + 2 THEN
    RAISE EXCEPTION 'COMPLETED_VOID_AUDIT_MISSING';
  END IF;

  PERFORM public.void_consultation_document_with_fee(
    '71000000-0000-4000-8000-000000000401'
  );
  SELECT count(*)
  INTO v_active_count
  FROM public.consultation_items
  WHERE source_document_id = '71000000-0000-4000-8000-000000000401'
    AND deleted_at IS NULL;
  SELECT COALESCE(sum(price * quantity), 0)
  INTO v_total
  FROM public.consultation_items
  WHERE consultation_id = '71000000-0000-4000-8000-000000000301'
    AND deleted_at IS NULL;
  IF v_active_count IS DISTINCT FROM 0 OR v_total IS DISTINCT FROM 20 THEN
    RAISE EXCEPTION 'LINKED_CHARGE_REVERSAL_FAILED';
  END IF;

  PERFORM public.void_consultation_document_with_fee(
    '71000000-0000-4000-8000-000000000401'
  );

  PERFORM set_config(
    'request.jwt.claim.sub',
    '71000000-0000-4000-8000-000000000013',
    true
  );
  BEGIN
    PERFORM public.issue_consultation_document_with_fee(
      '71000000-0000-4000-8000-000000000404',
      '71000000-0000-4000-8000-000000000301',
      '71000000-0000-4000-8000-000000000101',
      NULL,
      'TEST ONLY DENIED DOCUMENT',
      'mc',
      'TEST ONLY DENIED CONTENT',
      'A4',
      'portrait'
    );
    RAISE EXCEPTION 'DENIED_DOCUMENT_ISSUE_SUCCEEDED';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    IF SQLERRM <> 'NOT_AUTHORIZED' THEN
      RAISE;
    END IF;
  END;
END
$verify$;

RESET ROLE;
ROLLBACK;

SELECT jsonb_build_object(
  'status', 'pass',
  'database_role', 'authenticated',
  'defaults', 'RM15.00',
  'cash_total', 'pass',
  'panel_total', 'pass',
  'completed_outstanding', 'pass',
  'linked_void', 'pass',
  'role_matrix', 'pass',
  'idempotent_uniqueness', 'pass',
  'transaction_end', 'ROLLBACK'
) AS official_documentation_fee_verification;
