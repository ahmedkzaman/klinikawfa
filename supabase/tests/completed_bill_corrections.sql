-- Reproducible staging verification for completed-bill corrections.
--
-- Safety properties:
--   * fixed synthetic UUIDs and TEST ONLY labels;
--   * no reads of existing clinical rows;
--   * RPCs execute as the authenticated database role with synthetic JWT claims;
--   * there is deliberately no COMMIT statement;
--   * the final command before the result is ROLLBACK.
--
-- Run against a non-production Supabase project after applying the feature
-- migrations. Reaching the final result means every assertion passed.

BEGIN;

DO $setup$
DECLARE
  v_actor uuid;
BEGIN
  IF EXISTS (
    SELECT 1 FROM auth.users
    WHERE id::text LIKE '70000000-0000-4000-8000-0000000000%'
  ) OR EXISTS (
    SELECT 1 FROM public.patients
    WHERE id::text LIKE '70000000-0000-4000-8000-0000000001%'
  ) THEN
    RAISE EXCEPTION 'TEST_UUID_COLLISION';
  END IF;

  FOR v_actor IN
    SELECT unnest(ARRAY[
      '70000000-0000-4000-8000-000000000001'::uuid,
      '70000000-0000-4000-8000-000000000002'::uuid,
      '70000000-0000-4000-8000-000000000003'::uuid,
      '70000000-0000-4000-8000-000000000004'::uuid,
      '70000000-0000-4000-8000-000000000005'::uuid,
      '70000000-0000-4000-8000-000000000006'::uuid,
      '70000000-0000-4000-8000-000000000011'::uuid,
      '70000000-0000-4000-8000-000000000012'::uuid,
      '70000000-0000-4000-8000-000000000013'::uuid,
      '70000000-0000-4000-8000-000000000014'::uuid,
      '70000000-0000-4000-8000-000000000015'::uuid,
      '70000000-0000-4000-8000-000000000016'::uuid
    ])
  LOOP
    INSERT INTO auth.users (
      id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    )
    VALUES (
      v_actor,
      'authenticated',
      'authenticated',
      'completed-bill-' || right(v_actor::text, 2) || '@example.invalid',
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"TEST ONLY BILL CORRECTION ACTOR"}'::jsonb,
      now(),
      now()
    );
  END LOOP;

  INSERT INTO public.user_roles (user_id, role)
  SELECT u.id, 'guest'::public.app_role
  FROM auth.users u
  WHERE u.id::text LIKE '70000000-0000-4000-8000-0000000000%'
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = u.id
    );

  UPDATE public.user_roles
  SET role = CASE user_id
    WHEN '70000000-0000-4000-8000-000000000001' THEN 'ops_staff'::public.app_role
    WHEN '70000000-0000-4000-8000-000000000002' THEN 'operations'::public.app_role
    WHEN '70000000-0000-4000-8000-000000000003' THEN 'staff'::public.app_role
    WHEN '70000000-0000-4000-8000-000000000004' THEN 'admin'::public.app_role
    WHEN '70000000-0000-4000-8000-000000000005' THEN 'special_admin'::public.app_role
    WHEN '70000000-0000-4000-8000-000000000006' THEN 'doctor_admin'::public.app_role
    WHEN '70000000-0000-4000-8000-000000000011' THEN 'locum'::public.app_role
    WHEN '70000000-0000-4000-8000-000000000012' THEN 'resident_doctor'::public.app_role
    WHEN '70000000-0000-4000-8000-000000000013' THEN 'purchaser'::public.app_role
    WHEN '70000000-0000-4000-8000-000000000014' THEN 'staff_nurse'::public.app_role
    WHEN '70000000-0000-4000-8000-000000000015' THEN 'website_editor'::public.app_role
    WHEN '70000000-0000-4000-8000-000000000016' THEN 'guest'::public.app_role
  END
  WHERE user_id::text LIKE '70000000-0000-4000-8000-0000000000%';

  IF (SELECT count(*) FROM public.user_roles
      WHERE user_id::text LIKE '70000000-0000-4000-8000-0000000000%') <> 12 THEN
    RAISE EXCEPTION 'SYNTHETIC_ROLE_SETUP_FAILED';
  END IF;

  INSERT INTO public.clinic_charge_types (id, name, default_amount, is_active)
  VALUES (
    '70000000-0000-4000-8000-000000000701',
    'TEST ONLY COMPLETED BILL OTHER CHARGE',
    5,
    true
  );
  INSERT INTO public.inventory_items (
    id, name, stock, allocated_quantity, cost_price,
    price_to_patient_min, price_to_patient_max, status
  )
  VALUES (
    '70000000-0000-4000-8000-000000000401',
    'TEST ONLY COMPLETED BILL MEDICINE',
    50, 0, 3, 10, 20, 'active'
  );
  INSERT INTO public.patients (id, name, notes)
  VALUES
    (
      '70000000-0000-4000-8000-000000000101',
      'TEST ONLY COMPLETED BILL CASH PATIENT',
      ''
    ),
    (
      '70000000-0000-4000-8000-000000000102',
      'TEST ONLY COMPLETED BILL PANEL PATIENT',
      ''
    ),
    (
      '70000000-0000-4000-8000-000000000103',
      'TEST ONLY COMPLETED BILL CHECKOUT PATIENT',
      ''
    );

  INSERT INTO public.queue_entries (
    id, patient_id, clinic_status, payment_method, created_by
  )
  VALUES (
    '70000000-0000-4000-8000-000000000201',
    '70000000-0000-4000-8000-000000000101',
    'registered',
    'cash',
    '70000000-0000-4000-8000-000000000001'
  );
  INSERT INTO public.consultations (
    id, queue_entry_id, patient_id, status,
    case_note, diagnosis_text, dispense_note
  )
  VALUES (
    '70000000-0000-4000-8000-000000000301',
    '70000000-0000-4000-8000-000000000201',
    '70000000-0000-4000-8000-000000000101',
    'in_progress', '', '', ''
  );
  INSERT INTO public.consultation_items (
    id, consultation_id, item_name, quantity, price, unit_cost,
    item_id, dispensed_qty
  )
  VALUES (
    '70000000-0000-4000-8000-000000000501',
    '70000000-0000-4000-8000-000000000301',
    'TEST ONLY DISPENSED MEDICINE',
    2, 10, 3,
    '70000000-0000-4000-8000-000000000401',
    2
  );
  INSERT INTO public.consultation_items (
    id, consultation_id, item_name, quantity, price, unit_cost
  )
  VALUES (
    '70000000-0000-4000-8000-000000000502',
    '70000000-0000-4000-8000-000000000301',
    'TEST ONLY PROCEDURE',
    1, 30, 8
  );
  INSERT INTO public.consultation_items (
    id, consultation_id, item_name, quantity, price, unit_cost,
    billing_adjustment_kind, clinic_charge_type_id
  )
  VALUES (
    '70000000-0000-4000-8000-000000000503',
    '70000000-0000-4000-8000-000000000301',
    'TEST ONLY COMPLETED BILL OTHER CHARGE',
    1, 5, 0,
    'other_charge',
    '70000000-0000-4000-8000-000000000701'
  );
  UPDATE public.consultations
  SET status = 'completed'
  WHERE id = '70000000-0000-4000-8000-000000000301';
  UPDATE public.queue_entries
  SET clinic_status = 'completed'
  WHERE id = '70000000-0000-4000-8000-000000000201';
  INSERT INTO public.payments (
    id, queue_entry_id, consultation_id, payment_type,
    payment_method, amount, notes
  )
  VALUES (
    '70000000-0000-4000-8000-000000000601',
    '70000000-0000-4000-8000-000000000201',
    '70000000-0000-4000-8000-000000000301',
    'self_pay', 'cash', 50, 'TEST ONLY'
  );

  INSERT INTO public.insurance_providers (
    id, name, status, panel_type, submission_preference
  )
  VALUES (
    '70000000-0000-4000-8000-000000000801',
    'TEST ONLY COMPLETED BILL PANEL',
    'active', 'tpa', 'bulk_claim'
  );
  INSERT INTO public.queue_entries (
    id, patient_id, clinic_status, payment_method, panel_id, created_by
  )
  VALUES (
    '70000000-0000-4000-8000-000000000202',
    '70000000-0000-4000-8000-000000000102',
    'registered', 'panel',
    '70000000-0000-4000-8000-000000000801',
    '70000000-0000-4000-8000-000000000001'
  );
  INSERT INTO public.consultations (
    id, queue_entry_id, patient_id, status,
    case_note, diagnosis_text, dispense_note
  )
  VALUES (
    '70000000-0000-4000-8000-000000000302',
    '70000000-0000-4000-8000-000000000202',
    '70000000-0000-4000-8000-000000000102',
    'in_progress', '', '', ''
  );
  INSERT INTO public.consultation_items (
    id, consultation_id, item_name, quantity, price, unit_cost
  )
  VALUES (
    '70000000-0000-4000-8000-000000000504',
    '70000000-0000-4000-8000-000000000302',
    'TEST ONLY PANEL PROCEDURE',
    1, 100, 20
  );
  UPDATE public.consultations
  SET status = 'completed'
  WHERE id = '70000000-0000-4000-8000-000000000302';
  UPDATE public.queue_entries
  SET clinic_status = 'completed'
  WHERE id = '70000000-0000-4000-8000-000000000202';
  INSERT INTO public.payments (
    id, queue_entry_id, consultation_id, payment_type,
    payment_method, amount, notes
  )
  VALUES (
    '70000000-0000-4000-8000-000000000602',
    '70000000-0000-4000-8000-000000000202',
    '70000000-0000-4000-8000-000000000302',
    'panel', 'panel', 0, 'TEST ONLY'
  );
  UPDATE public.panel_claims
  SET id = '70000000-0000-4000-8000-000000000901',
      claim_no = 'TEST-ONLY-COMPLETED-BILL-CLAIM',
      amount = 100,
      received_amount = 120,
      approved_amount = 100,
      status = 'received',
      remarks = 'TEST ONLY'
  WHERE queue_entry_id = '70000000-0000-4000-8000-000000000202';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SYNTHETIC_PANEL_CLAIM_NOT_CREATED';
  END IF;

  INSERT INTO public.queue_entries (
    id, patient_id, clinic_status, payment_method, created_by
  )
  VALUES (
    '70000000-0000-4000-8000-000000000203',
    '70000000-0000-4000-8000-000000000103',
    'registered', 'cash',
    '70000000-0000-4000-8000-000000000001'
  );
  INSERT INTO public.consultations (
    id, queue_entry_id, patient_id, status,
    case_note, diagnosis_text, dispense_note
  )
  VALUES (
    '70000000-0000-4000-8000-000000000303',
    '70000000-0000-4000-8000-000000000203',
    '70000000-0000-4000-8000-000000000103',
    'in_progress', '', '', ''
  );
END
$setup$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $verify$
DECLARE
  v_allowed_actors uuid[] := ARRAY[
    '70000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000002',
    '70000000-0000-4000-8000-000000000003',
    '70000000-0000-4000-8000-000000000004',
    '70000000-0000-4000-8000-000000000005',
    '70000000-0000-4000-8000-000000000006'
  ]::uuid[];
  v_denied_actors uuid[] := ARRAY[
    '70000000-0000-4000-8000-000000000011',
    '70000000-0000-4000-8000-000000000012',
    '70000000-0000-4000-8000-000000000013',
    '70000000-0000-4000-8000-000000000014',
    '70000000-0000-4000-8000-000000000015',
    '70000000-0000-4000-8000-000000000016'
  ]::uuid[];
  v_actor uuid;
  v_context jsonb;
  v_context_b jsonb;
  v_items jsonb;
  v_payments jsonb;
  v_result jsonb;
  v_before_fingerprint text;
  v_audit_count integer;
  v_stock integer;
  v_allocated integer;
  v_tx_count integer;
  v_price numeric;
  v_claim jsonb;
BEGIN
  PERFORM set_config(
    'request.jwt.claim.sub',
    '70000000-0000-4000-8000-000000000001',
    true
  );
  SELECT stock, allocated_quantity
  INTO v_stock, v_allocated
  FROM public.inventory_items
  WHERE id = '70000000-0000-4000-8000-000000000401';
  SELECT count(*) INTO v_tx_count
  FROM public.inventory_transactions
  WHERE inventory_item_id = '70000000-0000-4000-8000-000000000401';

  FOREACH v_actor IN ARRAY v_allowed_actors LOOP
    PERFORM set_config('request.jwt.claim.sub', v_actor::text, true);
    v_context := public.get_completed_bill_correction_context(
      '70000000-0000-4000-8000-000000000201'
    );
    SELECT coalesce(
      jsonb_agg(value || '{"remove":false}'::jsonb),
      '[]'::jsonb
    )
    INTO v_items
    FROM jsonb_array_elements(v_context->'items');
    PERFORM public.correct_completed_bill(
      '70000000-0000-4000-8000-000000000201',
      v_context->>'fingerprint',
      'TEST allowed role',
      v_items,
      v_context->'payments',
      (v_context->>'discount_rm')::numeric,
      (v_context->>'tax_pct')::numeric
    );
  END LOOP;

  PERFORM set_config(
    'request.jwt.claim.sub',
    '70000000-0000-4000-8000-000000000001',
    true
  );
  SELECT count(*) INTO v_audit_count
  FROM public.get_completed_bill_correction_history(
    '70000000-0000-4000-8000-000000000201',
    100, NULL, NULL
  );

  FOREACH v_actor IN ARRAY v_denied_actors LOOP
    PERFORM set_config('request.jwt.claim.sub', v_actor::text, true);
    BEGIN
      PERFORM public.get_completed_bill_correction_context(
        '70000000-0000-4000-8000-000000000201'
      );
      RAISE EXCEPTION 'DENIED_CONTEXT_SUCCEEDED';
    EXCEPTION WHEN SQLSTATE '42501' THEN
      IF SQLERRM <> 'NOT_AUTHORIZED' THEN RAISE; END IF;
    END;
    BEGIN
      PERFORM public.correct_completed_bill(
        '70000000-0000-4000-8000-000000000201',
        v_context->>'fingerprint',
        'TEST denied role',
        v_items,
        v_context->'payments',
        0, 0
      );
      RAISE EXCEPTION 'DENIED_CORRECTION_SUCCEEDED';
    EXCEPTION WHEN SQLSTATE '42501' THEN
      IF SQLERRM <> 'NOT_AUTHORIZED' THEN RAISE; END IF;
    END;
  END LOOP;

  PERFORM set_config(
    'request.jwt.claim.sub',
    '70000000-0000-4000-8000-000000000001',
    true
  );
  IF v_audit_count <> (
    SELECT count(*)
    FROM public.get_completed_bill_correction_history(
      '70000000-0000-4000-8000-000000000201',
      100, NULL, NULL
    )
  ) THEN
    RAISE EXCEPTION 'DENIED_ROLE_CHANGED_AUDIT';
  END IF;

  v_context := public.get_completed_bill_correction_context(
    '70000000-0000-4000-8000-000000000201'
  );
  SELECT jsonb_agg(value || '{"remove":false}'::jsonb)
  INTO v_items
  FROM jsonb_array_elements(v_context->'items');
  BEGIN
    PERFORM public.correct_completed_bill(
      '70000000-0000-4000-8000-000000000201',
      v_context->>'fingerprint',
      'TEST quantity boundary',
      (
        SELECT jsonb_agg(
          CASE WHEN value->>'id' =
            '70000000-0000-4000-8000-000000000501'
            THEN value || '{"quantity":1}'::jsonb
            ELSE value END
        )
        FROM jsonb_array_elements(v_items)
      ),
      v_context->'payments', 0, 0
    );
    RAISE EXCEPTION 'BELOW_DISPENSED_SUCCEEDED';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM <> 'QUANTITY_BELOW_DISPENSED' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.correct_completed_bill(
      '70000000-0000-4000-8000-000000000201',
      v_context->>'fingerprint',
      'TEST removal boundary',
      (
        SELECT jsonb_agg(
          CASE WHEN value->>'id' =
            '70000000-0000-4000-8000-000000000501'
            THEN value || '{"remove":true}'::jsonb
            ELSE value END
        )
        FROM jsonb_array_elements(v_items)
      ),
      v_context->'payments', 0, 0
    );
    RAISE EXCEPTION 'DISPENSED_REMOVE_SUCCEEDED';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM <> 'DISPENSED_MEDICINE_REMOVE' THEN RAISE; END IF;
  END;

  PERFORM public.correct_completed_bill(
    '70000000-0000-4000-8000-000000000201',
    v_context->>'fingerprint',
    'TEST price inventory invariant',
    (
      SELECT jsonb_agg(
        CASE WHEN value->>'id' =
          '70000000-0000-4000-8000-000000000501'
          THEN value || '{"price":12}'::jsonb
          ELSE value END
      )
      FROM jsonb_array_elements(v_items)
    ),
    v_context->'payments', 0, 0
  );
  IF (SELECT stock FROM public.inventory_items
      WHERE id = '70000000-0000-4000-8000-000000000401') <> v_stock
     OR (SELECT allocated_quantity FROM public.inventory_items
         WHERE id = '70000000-0000-4000-8000-000000000401') <> v_allocated
     OR (SELECT count(*) FROM public.inventory_transactions
         WHERE inventory_item_id =
           '70000000-0000-4000-8000-000000000401') <> v_tx_count THEN
    RAISE EXCEPTION 'INVENTORY_CHANGED';
  END IF;

  v_context := public.get_completed_bill_correction_context(
    '70000000-0000-4000-8000-000000000201'
  );
  v_before_fingerprint := v_context->>'fingerprint';
  SELECT jsonb_agg(value || '{"remove":false}'::jsonb)
  INTO v_items
  FROM jsonb_array_elements(v_context->'items');
  BEGIN
    PERFORM public.correct_completed_bill(
      '70000000-0000-4000-8000-000000000201',
      v_context->>'fingerprint',
      'TEST atomic rollback',
      (
        SELECT jsonb_agg(
          CASE WHEN value->>'id' =
            '70000000-0000-4000-8000-000000000502'
            THEN value || '{"price":99}'::jsonb
            ELSE value END
        )
        FROM jsonb_array_elements(v_items)
      ),
      jsonb_build_array(
        (v_context->'payments'->0) ||
          '{"id":"70000000-0000-4000-8000-000000000699"}'::jsonb
      ),
      0, 0
    );
    RAISE EXCEPTION 'INVALID_PAYMENT_SUCCEEDED';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM <> 'PAYMENT_NOT_IN_VISIT' THEN RAISE; END IF;
  END;
  IF public.get_completed_bill_correction_context(
    '70000000-0000-4000-8000-000000000201'
  )->>'fingerprint' <> v_before_fingerprint THEN
    RAISE EXCEPTION 'ATOMIC_ROLLBACK_FAILED';
  END IF;

  v_context := public.get_completed_bill_correction_context(
    '70000000-0000-4000-8000-000000000201'
  );
  v_context_b := public.get_completed_bill_correction_context(
    '70000000-0000-4000-8000-000000000201'
  );
  SELECT jsonb_agg(value || '{"remove":false}'::jsonb)
  INTO v_items
  FROM jsonb_array_elements(v_context->'items');
  PERFORM public.correct_completed_bill(
    '70000000-0000-4000-8000-000000000201',
    v_context->>'fingerprint',
    'TEST writer A',
    (
      SELECT jsonb_agg(
        CASE WHEN value->>'id' =
          '70000000-0000-4000-8000-000000000501'
          THEN value || '{"price":13}'::jsonb
          ELSE value END
      )
      FROM jsonb_array_elements(v_items)
    ),
    v_context->'payments', 0, 0
  );
  BEGIN
    PERFORM public.correct_completed_bill(
      '70000000-0000-4000-8000-000000000201',
      v_context_b->>'fingerprint',
      'TEST stale writer B',
      (
        SELECT jsonb_agg(
          CASE WHEN value->>'id' =
            '70000000-0000-4000-8000-000000000501'
            THEN value || '{"price":14}'::jsonb
            ELSE value END
        )
        FROM jsonb_array_elements(v_items)
      ),
      v_context_b->'payments', 0, 0
    );
    RAISE EXCEPTION 'STALE_WRITER_SUCCEEDED';
  EXCEPTION WHEN SQLSTATE '40001' THEN
    IF SQLERRM <> 'STALE_BILL' THEN RAISE; END IF;
  END;
  SELECT price INTO v_price
  FROM public.consultation_items
  WHERE id = '70000000-0000-4000-8000-000000000501';
  IF v_price <> 13 THEN RAISE EXCEPTION 'STALE_OVERWRITE'; END IF;

  v_context := public.get_completed_bill_correction_context(
    '70000000-0000-4000-8000-000000000201'
  );
  SELECT jsonb_agg(value || '{"remove":false}'::jsonb)
  INTO v_items
  FROM jsonb_array_elements(v_context->'items');
  SELECT jsonb_agg(
    value || '{"amount":40,"payment_method":"qr_pay"}'::jsonb
  )
  INTO v_payments
  FROM jsonb_array_elements(v_context->'payments');
  v_result := public.correct_completed_bill(
    '70000000-0000-4000-8000-000000000201',
    v_context->>'fingerprint',
    'TEST cash outstanding',
    (
      SELECT jsonb_agg(
        CASE WHEN value->>'id' =
          '70000000-0000-4000-8000-000000000501'
          THEN value || '{"price":12}'::jsonb
          ELSE value END
      )
      FROM jsonb_array_elements(v_items)
    ),
    v_payments, 4, 10
  );
  IF (v_result->>'subtotal')::numeric <> 59
     OR (v_result->>'total')::numeric <> 60.5
     OR (v_result->>'outstanding')::numeric <> 20.5
     OR v_result->>'status' <> 'outstanding' THEN
    RAISE EXCEPTION 'CASH_OUTSTANDING_FAILED';
  END IF;
  IF (
    SELECT before_total <> 61 OR after_total <> 60.5
    FROM public.get_completed_bill_correction_history(
      '70000000-0000-4000-8000-000000000201',
      100, NULL, NULL
    )
    WHERE id = (v_result->>'audit_id')::uuid
  ) OR (v_result->>'paid')::numeric <> 40 THEN
    RAISE EXCEPTION 'AUDIT_SNAPSHOT_FAILED';
  END IF;

  v_context := public.get_completed_bill_correction_context(
    '70000000-0000-4000-8000-000000000201'
  );
  SELECT jsonb_agg(value || '{"remove":false}'::jsonb)
  INTO v_items FROM jsonb_array_elements(v_context->'items');
  SELECT jsonb_agg(
    value || '{"amount":70,"payment_method":"card"}'::jsonb
  )
  INTO v_payments FROM jsonb_array_elements(v_context->'payments');
  v_result := public.correct_completed_bill(
    '70000000-0000-4000-8000-000000000201',
    v_context->>'fingerprint',
    'TEST cash credit',
    v_items, v_payments, 4, 10
  );
  IF (v_result->>'credit_due')::numeric <> 9.5
     OR v_result->>'status' <> 'credit_due' THEN
    RAISE EXCEPTION 'CASH_CREDIT_FAILED';
  END IF;

  v_context := public.get_completed_bill_correction_context(
    '70000000-0000-4000-8000-000000000202'
  );
  SELECT jsonb_agg(
    value || '{"remove":false,"price":80}'::jsonb
  )
  INTO v_items FROM jsonb_array_elements(v_context->'items');
  v_result := public.correct_completed_bill(
    '70000000-0000-4000-8000-000000000202',
    v_context->>'fingerprint',
    'TEST panel reconciliation',
    v_items, v_context->'payments', 0, 0
  );
  SELECT to_jsonb(pc) INTO v_claim
  FROM public.panel_claims pc
  WHERE pc.id = '70000000-0000-4000-8000-000000000901';
  IF (v_claim->>'amount')::numeric <> 80
     OR v_claim->>'status' <> 'received'
     OR (v_claim->>'received_amount')::numeric <> 120
     OR (v_claim->>'approved_amount')::numeric <> 100
     OR (v_result->>'panel_credit_due')::numeric <> 40 THEN
    RAISE EXCEPTION 'PANEL_RECONCILIATION_FAILED';
  END IF;

  IF (SELECT count(*) FROM public.get_completed_bill_correction_history(
    '70000000-0000-4000-8000-000000000201',
    100, NULL, NULL
  )) < 10 THEN
    RAISE EXCEPTION 'HISTORY_PROJECTION_FAILED';
  END IF;

  -- The checkout RPC itself executes through the authenticated API role.
  PERFORM public.record_payment_and_complete_visit(
    '70000000-0000-4000-8000-000000000203',
    '70000000-0000-4000-8000-000000000303',
    'self_pay', 'cash', 25, 'TEST ONLY ATOMIC CHECKOUT'
  );
  IF (SELECT count(*) FROM public.payments
      WHERE queue_entry_id =
        '70000000-0000-4000-8000-000000000203') <> 1 THEN
    RAISE EXCEPTION 'ATOMIC_CHECKOUT_FAILED';
  END IF;
  BEGIN
    PERFORM public.record_payment_and_complete_visit(
      '70000000-0000-4000-8000-000000000203',
      '70000000-0000-4000-8000-000000000303',
      'self_pay', 'cash', 25, 'TEST ONLY DUPLICATE CHECKOUT'
    );
    RAISE EXCEPTION 'DUPLICATE_CHECKOUT_SUCCEEDED';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM <> 'ALREADY_COMPLETED' THEN RAISE; END IF;
  END;
END
$verify$;

RESET ROLE;
ROLLBACK;

SELECT jsonb_build_object(
  'status', 'pass',
  'database_role', 'authenticated',
  'jwt_claims', 'synthetic',
  'allowed_roles', ARRAY[
    'ops_staff', 'operations', 'staff',
    'admin', 'special_admin', 'doctor_admin'
  ],
  'denied_roles', ARRAY[
    'locum', 'resident_doctor', 'purchaser',
    'staff_nurse', 'website_editor', 'guest'
  ],
  'medicine_inventory', 'pass',
  'atomic_rollback', 'pass',
  'stale_fingerprint', 'pass',
  'cash_panel_reconciliation', 'pass',
  'audit_history', 'pass',
  'atomic_checkout', 'pass',
  'transaction_end', 'ROLLBACK'
) AS completed_bill_correction_verification;
