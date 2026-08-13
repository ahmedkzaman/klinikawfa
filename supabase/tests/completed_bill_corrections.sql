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

-- Setup writes run as postgres, but payment provenance now deliberately
-- requires the same authenticated actor context as every cached/RPC write.
SELECT set_config(
  'request.jwt.claim.sub',
  '70000000-0000-4000-8000-000000000001',
  true
);

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
  VALUES
    (
      '70000000-0000-4000-8000-000000000401',
      'TEST ONLY COMPLETED BILL MEDICINE',
      50, 0, 3, 10, 20, 'active'
    ),
    (
      '70000000-0000-4000-8000-000000000402',
      'TEST ONLY EFFECTIVE QUANTITY MEDICINE',
      50, 0, 3, 10, 100, 'active'
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
    ),
    (
      '70000000-0000-4000-8000-000000000104',
      'TEST ONLY MULTI DEBT PATIENT',
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
    id, consultation_id, item_name, quantity, price, unit_cost,
    item_id, dispensed_qty
  )
  VALUES (
    '70000000-0000-4000-8000-000000000504',
    '70000000-0000-4000-8000-000000000302',
    'TEST ONLY PANEL PROCEDURE',
    1, 100, 20, NULL, NULL
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
    'dispensing_payment', 'cash',
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
  INSERT INTO public.consultation_items (
    id, consultation_id, item_name, quantity, price, unit_cost
  ) VALUES (
    '70000000-0000-4000-8000-000000000511',
    '70000000-0000-4000-8000-000000000303',
    'TEST ONLY LEGACY CHECKOUT', 1, 25, 0
  );

  -- Split-payment fixtures: valid checkout, reusable validation target,
  -- panel co-payment, completed debt collection, and forced insert failure.
  INSERT INTO public.queue_entries (
    id, patient_id, clinic_status, payment_method, panel_id, created_by
  )
  VALUES
    (
      '70000000-0000-4000-8000-000000000204',
      '70000000-0000-4000-8000-000000000103',
      'dispensing_payment', 'cash', NULL,
      '70000000-0000-4000-8000-000000000001'
    ),
    (
      '70000000-0000-4000-8000-000000000205',
      '70000000-0000-4000-8000-000000000103',
      'dispensing_payment', 'cash', NULL,
      '70000000-0000-4000-8000-000000000001'
    ),
    (
      '70000000-0000-4000-8000-000000000206',
      '70000000-0000-4000-8000-000000000102',
      'dispensing_payment', 'panel',
      '70000000-0000-4000-8000-000000000801',
      '70000000-0000-4000-8000-000000000001'
    ),
    (
      '70000000-0000-4000-8000-000000000207',
      '70000000-0000-4000-8000-000000000103',
      'registered', 'cash', NULL,
      '70000000-0000-4000-8000-000000000001'
    ),
    (
      '70000000-0000-4000-8000-000000000208',
      '70000000-0000-4000-8000-000000000103',
      'dispensing_payment', 'cash', NULL,
      '70000000-0000-4000-8000-000000000001'
    ),
    (
      '70000000-0000-4000-8000-000000000209',
      '70000000-0000-4000-8000-000000000102',
      'registered', 'panel',
      '70000000-0000-4000-8000-000000000801',
      '70000000-0000-4000-8000-000000000001'
    ),
    (
      '70000000-0000-4000-8000-000000000210',
      '70000000-0000-4000-8000-000000000103',
      'dispensing_payment', 'cash', NULL,
      '70000000-0000-4000-8000-000000000001'
    );

  INSERT INTO public.consultations (
    id, queue_entry_id, patient_id, status,
    case_note, diagnosis_text, dispense_note
  )
  VALUES
    (
      '70000000-0000-4000-8000-000000000304',
      '70000000-0000-4000-8000-000000000204',
      '70000000-0000-4000-8000-000000000103',
      'in_progress', '', '', ''
    ),
    (
      '70000000-0000-4000-8000-000000000305',
      '70000000-0000-4000-8000-000000000205',
      '70000000-0000-4000-8000-000000000103',
      'in_progress', '', '', ''
    ),
    (
      '70000000-0000-4000-8000-000000000306',
      '70000000-0000-4000-8000-000000000206',
      '70000000-0000-4000-8000-000000000102',
      'in_progress', '', '', ''
    ),
    (
      '70000000-0000-4000-8000-000000000307',
      '70000000-0000-4000-8000-000000000207',
      '70000000-0000-4000-8000-000000000103',
      'in_progress', '', '', ''
    ),
    (
      '70000000-0000-4000-8000-000000000308',
      '70000000-0000-4000-8000-000000000208',
      '70000000-0000-4000-8000-000000000103',
      'in_progress', '', '', ''
    ),
    (
      '70000000-0000-4000-8000-000000000309',
      '70000000-0000-4000-8000-000000000209',
      '70000000-0000-4000-8000-000000000102',
      'in_progress', '', '', ''
    ),
    (
      '70000000-0000-4000-8000-000000000310',
      '70000000-0000-4000-8000-000000000210',
      '70000000-0000-4000-8000-000000000103',
      'in_progress', '', '', ''
    );

  INSERT INTO public.consultation_items (
    id, consultation_id, item_name, quantity, price, unit_cost,
    item_id, dispensed_qty
  )
  VALUES
    (
      '70000000-0000-4000-8000-000000000505',
      '70000000-0000-4000-8000-000000000304',
      'TEST ONLY SPLIT CHECKOUT', 1, 100, 0, NULL, NULL
    ),
    (
      '70000000-0000-4000-8000-000000000506',
      '70000000-0000-4000-8000-000000000305',
      'TEST ONLY SPLIT VALIDATION', 1, 100, 0, NULL, NULL
    ),
    (
      '70000000-0000-4000-8000-000000000507',
      '70000000-0000-4000-8000-000000000306',
      'TEST ONLY PANEL SPLIT CHECKOUT', 1, 100, 0, NULL, NULL
    ),
    (
      '70000000-0000-4000-8000-000000000508',
      '70000000-0000-4000-8000-000000000307',
      'TEST ONLY COMPLETED COLLECTION', 1, 80, 0,
      '70000000-0000-4000-8000-000000000402', 1
    ),
    (
      '70000000-0000-4000-8000-000000000509',
      '70000000-0000-4000-8000-000000000308',
      'TEST ONLY FORCED SPLIT ROLLBACK', 1, 100, 0, NULL, NULL
    ),
    (
      '70000000-0000-4000-8000-000000000510',
      '70000000-0000-4000-8000-000000000309',
      'TEST ONLY PANEL SAVED QUANTITY', 3, 10, 0,
      '70000000-0000-4000-8000-000000000402', 2
    ),
    (
      '70000000-0000-4000-8000-000000000512',
      '70000000-0000-4000-8000-000000000310',
      'TEST ONLY RETAINED SAVED QUANTITY', 3, 10, 0,
      '70000000-0000-4000-8000-000000000402', 2
    );

  -- Multi-debt fixtures deliberately separate the payment-only coordinator
  -- from the two historical ledgers. One visit is self-pay (RM60); the other
  -- is panel (RM100 bill, RM70 active claim, RM30 patient liability).
  INSERT INTO public.queue_entries (
    id, patient_id, clinic_status, payment_method, panel_id, visit_type,
    visit_purpose, created_by, created_at
  )
  VALUES
    (
      '70000000-0000-4000-8000-000000000211',
      '70000000-0000-4000-8000-000000000104',
      'registered', 'cash', NULL, 'consultation',
      'TEST ONLY DEBT CASH VISIT',
      '70000000-0000-4000-8000-000000000001',
      '2025-01-01 08:00:00+00'::timestamptz
    ),
    (
      '70000000-0000-4000-8000-000000000212',
      '70000000-0000-4000-8000-000000000104',
      'registered', 'panel',
      '70000000-0000-4000-8000-000000000801', 'consultation',
      'TEST ONLY DEBT PANEL VISIT',
      '70000000-0000-4000-8000-000000000001',
      '2025-02-01 08:00:00+00'::timestamptz
    ),
    (
      '70000000-0000-4000-8000-000000000213',
      '70000000-0000-4000-8000-000000000104',
      'sent_to_dispensary', 'cash', NULL, 'payment_only',
      'TEST ONLY KEYED DEBT COORDINATOR',
      '70000000-0000-4000-8000-000000000001', now()
    ),
    (
      '70000000-0000-4000-8000-000000000214',
      '70000000-0000-4000-8000-000000000104',
      'registered', 'cash', NULL, 'consultation',
      'TEST ONLY LEGACY DEBT VISIT',
      '70000000-0000-4000-8000-000000000001',
      '2025-03-01 08:00:00+00'::timestamptz
    ),
    (
      '70000000-0000-4000-8000-000000000215',
      '70000000-0000-4000-8000-000000000104',
      'sent_to_dispensary', 'cash', NULL, 'payment_only',
      'TEST ONLY LEGACY DEBT COORDINATOR',
      '70000000-0000-4000-8000-000000000001', now()
    ),
    (
      '70000000-0000-4000-8000-000000000216',
      '70000000-0000-4000-8000-000000000102',
      'registered', 'panel',
      '70000000-0000-4000-8000-000000000801', 'consultation',
      'TEST ONLY ZERO PANEL PORTION',
      '70000000-0000-4000-8000-000000000001', now()
    ),
    (
      '70000000-0000-4000-8000-000000000217',
      '70000000-0000-4000-8000-000000000104',
      'dispensing_payment', 'cash', NULL, 'consultation',
      'TEST ONLY ACTIVE VISIT IS NOT PAST DEBT',
      '70000000-0000-4000-8000-000000000001', now()
    );

  INSERT INTO public.consultations (
    id, queue_entry_id, patient_id, status, case_note, diagnosis_text,
    dispense_note, created_at
  )
  VALUES
    (
      '70000000-0000-4000-8000-000000000311',
      '70000000-0000-4000-8000-000000000211',
      '70000000-0000-4000-8000-000000000104',
      'in_progress', '', '', '', '2025-01-01 08:00:00+00'::timestamptz
    ),
    (
      '70000000-0000-4000-8000-000000000312',
      '70000000-0000-4000-8000-000000000212',
      '70000000-0000-4000-8000-000000000104',
      'in_progress', '', '', '', '2025-02-01 08:00:00+00'::timestamptz
    ),
    (
      '70000000-0000-4000-8000-000000000313',
      '70000000-0000-4000-8000-000000000214',
      '70000000-0000-4000-8000-000000000104',
      'in_progress', '', '', '', '2025-03-01 08:00:00+00'::timestamptz
    ),
    (
      '70000000-0000-4000-8000-000000000316',
      '70000000-0000-4000-8000-000000000216',
      '70000000-0000-4000-8000-000000000102',
      'in_progress', '', '', '', now()
    ),
    (
      '70000000-0000-4000-8000-000000000317',
      '70000000-0000-4000-8000-000000000217',
      '70000000-0000-4000-8000-000000000104',
      'in_progress', '', '', '', now()
    );

  INSERT INTO public.consultation_items (
    id, consultation_id, item_name, quantity, price, unit_cost
  )
  VALUES
    (
      '70000000-0000-4000-8000-000000000513',
      '70000000-0000-4000-8000-000000000311',
      'TEST ONLY DEBT CASH BILL', 1, 60, 0
    ),
    (
      '70000000-0000-4000-8000-000000000514',
      '70000000-0000-4000-8000-000000000312',
      'TEST ONLY DEBT PANEL BILL', 1, 100, 0
    ),
    (
      '70000000-0000-4000-8000-000000000515',
      '70000000-0000-4000-8000-000000000313',
      'TEST ONLY LEGACY DEBT BILL', 1, 25, 0
    ),
    (
      '70000000-0000-4000-8000-000000000516',
      '70000000-0000-4000-8000-000000000316',
      'TEST ONLY ZERO PANEL BILL', 1, 10, 0
    ),
    (
      '70000000-0000-4000-8000-000000000517',
      '70000000-0000-4000-8000-000000000317',
      'TEST ONLY ACTIVE VISIT BILL', 1, 20, 0
    );

  UPDATE public.consultations
  SET status = 'completed'
  WHERE id IN (
    '70000000-0000-4000-8000-000000000311',
    '70000000-0000-4000-8000-000000000312',
    '70000000-0000-4000-8000-000000000313',
    '70000000-0000-4000-8000-000000000316'
  );
  UPDATE public.queue_entries
  SET clinic_status = 'completed'
  WHERE id IN (
    '70000000-0000-4000-8000-000000000211',
    '70000000-0000-4000-8000-000000000212',
    '70000000-0000-4000-8000-000000000214',
    '70000000-0000-4000-8000-000000000216'
  );
  UPDATE public.panel_claims
  SET amount = 70
  WHERE queue_entry_id = '70000000-0000-4000-8000-000000000212'
    AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TEST_DEBT_PANEL_CLAIM_NOT_CREATED';
  END IF;

  UPDATE public.consultations
  SET status = 'completed'
  WHERE id = '70000000-0000-4000-8000-000000000307';
  UPDATE public.queue_entries
  SET clinic_status = 'completed'
  WHERE id = '70000000-0000-4000-8000-000000000207';
  UPDATE public.consultations
  SET status = 'completed'
  WHERE id = '70000000-0000-4000-8000-000000000309';
  UPDATE public.queue_entries
  SET clinic_status = 'completed'
  WHERE id = '70000000-0000-4000-8000-000000000209';

  -- Keep one non-completed payment row so authenticated UPDATE RLS reaches
  -- the production provenance trigger instead of filtering the row first.
  INSERT INTO public.payments (
    id, queue_entry_id, consultation_id, payment_type,
    payment_method, amount, notes
  ) VALUES (
    '70000000-0000-4000-8000-000000000618',
    '70000000-0000-4000-8000-000000000217',
    '70000000-0000-4000-8000-000000000317',
    'self_pay', 'cash', 0, 'TEST ONLY PROVENANCE GUARD'
  );
END;
$setup$;

CREATE FUNCTION public.test_only_reject_second_split_payment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $trigger$
BEGIN
  IF NEW.queue_entry_id = '70000000-0000-4000-8000-000000000208'
     AND NEW.payment_method = 'qr_pay' THEN
    RAISE EXCEPTION 'TEST_ONLY_SECOND_SPLIT_REJECTED' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$trigger$;

CREATE TRIGGER test_only_reject_second_split_payment
BEFORE INSERT ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.test_only_reject_second_split_payment();

CREATE FUNCTION public.test_only_payment_batch_count(p_queue_entry_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT count(*)::integer
  FROM public.payment_batches AS batch
  WHERE batch.queue_entry_id = p_queue_entry_id
     OR batch.coordination_queue_entry_id = p_queue_entry_id;
$function$;

CREATE FUNCTION public.test_only_set_panel_claim_status(
  p_queue_entry_id uuid,
  p_status public.panel_claim_status
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  UPDATE public.panel_claims AS claim
  SET status = p_status
  WHERE claim.queue_entry_id = p_queue_entry_id;
$function$;

CREATE FUNCTION public.test_only_seed_panel_claim_portion(p_queue_entry_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $function$
DECLARE v_claim_id uuid;
BEGIN
  v_claim_id := public.ensure_panel_claim_for_queue(p_queue_entry_id);
  INSERT INTO public.panel_claim_portions (
    panel_claim_id, portion_no, amount, remark, created_by, updated_by
  ) SELECT claim.id, seed.portion_no,
      CASE seed.portion_no
        WHEN 1 THEN round(claim.amount / 2, 2)
        ELSE claim.amount - round(claim.amount / 2, 2)
      END,
      'TEST ONLY active split parent ' || seed.portion_no,
      '70000000-0000-4000-8000-000000000001',
      '70000000-0000-4000-8000-000000000001'
    FROM public.panel_claims claim
    CROSS JOIN (VALUES (1), (2)) AS seed(portion_no)
    WHERE claim.id = v_claim_id;
END;
$function$;

CREATE FUNCTION public.test_only_clear_panel_claim_portions(p_queue_entry_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public AS $function$
  DELETE FROM public.panel_claim_portions portion USING public.panel_claims claim
  WHERE portion.panel_claim_id=claim.id AND claim.queue_entry_id=p_queue_entry_id;
$function$;

CREATE FUNCTION public.test_only_zero_panel_portion_audit_count(
  p_queue_entry_id uuid
) RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT count(*)::integer
  FROM public.panel_claim_portion_audit AS audit
  JOIN public.panel_claims AS claim
    ON claim.id = audit.panel_claim_id
  WHERE claim.queue_entry_id = p_queue_entry_id
    AND audit.action = 'corrected'
    AND audit.new_values = '[]'::jsonb;
$function$;

CREATE FUNCTION public.test_only_payment_void_audit_count(
  p_payment_id uuid,
  p_reason text
) RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT count(*)::integer
  FROM public.payment_void_audit AS audit
  WHERE audit.payment_id = p_payment_id
    AND audit.reason = p_reason;
$function$;

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
    '70000000-0000-4000-8000-000000000006',
    '70000000-0000-4000-8000-000000000013',
    '70000000-0000-4000-8000-000000000014'
  ]::uuid[];
  v_denied_actors uuid[] := ARRAY[
    '70000000-0000-4000-8000-000000000011',
    '70000000-0000-4000-8000-000000000012',
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
  v_audit_before_atomic integer;
  v_audit_before_stale integer;
  v_current_count integer;
  v_stock integer;
  v_allocated integer;
  v_tx_count integer;
  v_price numeric;
  v_payment_amount numeric;
  v_payment_method text;
  v_queue_status text;
  v_consultation_status text;
  v_cash_audit_id uuid;
  v_history_reason text;
  v_history_before_total numeric;
  v_history_after_total numeric;
  v_claim_amount numeric;
  v_claim_status text;
  v_claim_received numeric;
  v_claim_approved numeric;
  v_replay_result jsonb;
  v_batch_count integer;
  v_payment_id uuid;
  v_payment_created_by uuid;
  v_payment_created_at timestamptz;
BEGIN
  PERFORM set_config(
    'request.jwt.claim.sub',
    '70000000-0000-4000-8000-000000000001',
    true
  );
  IF to_regprocedure('private.guard_panel_claim_split_parent_mutation()') IS NULL THEN
    RAISE EXCEPTION 'PRODUCTION_SPLIT_PARENT_GUARD_MISSING';
  END IF;

  -- Cached authenticated writes cannot forge the immutable actor or event
  -- timestamp. The deliberate exception rolls the successful probe back so
  -- later amount/count assertions keep their original fixtures.
  BEGIN
    INSERT INTO public.payments (
      id, queue_entry_id, consultation_id, payment_type,
      payment_method, amount, notes, created_by, created_at
    ) VALUES (
      '70000000-0000-4000-8000-000000000619',
      '70000000-0000-4000-8000-000000000217',
      '70000000-0000-4000-8000-000000000317',
      'self_pay', 'cash', 1, 'TEST ONLY DIRECT PROVENANCE',
      '70000000-0000-4000-8000-000000000002',
      '2000-01-01 00:00:00+00'::timestamptz
    )
    RETURNING created_by, created_at
    INTO STRICT v_payment_created_by, v_payment_created_at;
    IF v_payment_created_by IS DISTINCT FROM
         '70000000-0000-4000-8000-000000000001'::uuid
       OR v_payment_created_at IS DISTINCT FROM statement_timestamp() THEN
      RAISE EXCEPTION 'DIRECT_PAYMENT_PROVENANCE_MISMATCH';
    END IF;
    RAISE EXCEPTION 'TEST_ONLY_DIRECT_PROVENANCE_ROLLBACK';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'TEST_ONLY_DIRECT_PROVENANCE_ROLLBACK' THEN RAISE; END IF;
  END;

  -- A panel visit may never be relabelled self-pay by a cached client.
  BEGIN
    INSERT INTO public.payments (
      queue_entry_id, consultation_id, payment_type,
      payment_method, amount, notes
    ) VALUES (
      '70000000-0000-4000-8000-000000000212',
      '70000000-0000-4000-8000-000000000312',
      'self_pay', 'cash', 1, 'TEST ONLY WRONG PANEL ATTRIBUTION'
    );
    RAISE EXCEPTION 'DIRECT_PANEL_SELF_PAY_REJECTION_MISSED';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM <> 'PAYMENT_TYPE_MISMATCH' THEN RAISE; END IF;
  END;

  -- The complete materialization predicate applies to cached physical copays,
  -- not only to zero-value allocation markers.
  PERFORM public.test_only_set_panel_claim_status(
    '70000000-0000-4000-8000-000000000212', 'submitted'
  );
  BEGIN
    INSERT INTO public.payments (
      queue_entry_id, consultation_id, payment_type,
      payment_method, amount, notes
    ) VALUES (
      '70000000-0000-4000-8000-000000000212',
      '70000000-0000-4000-8000-000000000312',
      'panel', 'cash', 10, 'TEST ONLY MATERIALIZED PANEL COPAY'
    );
    RAISE EXCEPTION 'DIRECT_MATERIALIZED_PANEL_REJECTION_MISSED';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    IF SQLERRM <> 'PANEL_CLAIM_ALREADY_MATERIALIZED' THEN RAISE; END IF;
  END;
  PERFORM public.test_only_set_panel_claim_status(
    '70000000-0000-4000-8000-000000000212', 'pending'
  );

  -- A permitted pending cached copay is reconciled immediately. Roll the
  -- successful probe back after observing the parent claim change.
  BEGIN
    INSERT INTO public.payments (
      queue_entry_id, consultation_id, payment_type,
      payment_method, amount, notes
    ) VALUES (
      '70000000-0000-4000-8000-000000000212',
      '70000000-0000-4000-8000-000000000312',
      'panel', 'cash', 10, 'TEST ONLY CACHED PANEL RECONCILIATION'
    );
    IF (SELECT amount FROM public.panel_claims
        WHERE queue_entry_id = '70000000-0000-4000-8000-000000000212')
         IS DISTINCT FROM 90::numeric THEN
      RAISE EXCEPTION 'DIRECT_PANEL_RECONCILIATION_MISMATCH';
    END IF;
    RAISE EXCEPTION 'TEST_ONLY_DIRECT_PANEL_ROLLBACK';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'TEST_ONLY_DIRECT_PANEL_ROLLBACK' THEN RAISE; END IF;
  END;

  -- RETAINED_CHECKOUT_SAVED_QUANTITY_30_MISMATCH: checkout_visit is replaced
  -- by the additive migration and shares quantity 3 x RM10 = RM30 semantics.
  SELECT count(*) INTO v_current_count
  FROM public.inventory_items
  WHERE id = '70000000-0000-4000-8000-000000000401';
  IF v_current_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'INVENTORY_ROW_MISMATCH';
  END IF;
  SELECT stock, allocated_quantity
  INTO STRICT v_stock, v_allocated
  FROM public.inventory_items
  WHERE id = '70000000-0000-4000-8000-000000000401';
  SELECT count(*) INTO v_tx_count
  FROM public.inventory_transactions
  WHERE inventory_item_id = '70000000-0000-4000-8000-000000000401';
  IF v_tx_count IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'INVENTORY_TRANSACTION_COUNT_MISMATCH';
  END IF;

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
  SELECT count(*) INTO v_current_count
  FROM public.inventory_items
  WHERE id = '70000000-0000-4000-8000-000000000401';
  IF v_current_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'INVENTORY_ROW_MISMATCH';
  END IF;
  IF (SELECT stock FROM public.inventory_items
      WHERE id = '70000000-0000-4000-8000-000000000401')
        IS DISTINCT FROM v_stock
     OR (SELECT allocated_quantity FROM public.inventory_items
         WHERE id = '70000000-0000-4000-8000-000000000401')
        IS DISTINCT FROM v_allocated THEN
    RAISE EXCEPTION 'INVENTORY_CHANGED';
  END IF;
  SELECT count(*) INTO v_current_count
  FROM public.inventory_transactions
  WHERE inventory_item_id = '70000000-0000-4000-8000-000000000401';
  IF v_current_count IS DISTINCT FROM v_tx_count THEN
    RAISE EXCEPTION 'INVENTORY_TRANSACTION_COUNT_MISMATCH';
  END IF;
  SELECT qe.clinic_status, c.status
  INTO STRICT v_queue_status, v_consultation_status
  FROM public.queue_entries qe
  JOIN public.consultations c ON c.queue_entry_id = qe.id
  WHERE qe.id = '70000000-0000-4000-8000-000000000201'
    AND c.id = '70000000-0000-4000-8000-000000000301';
  IF v_queue_status IS DISTINCT FROM 'completed'
     OR v_consultation_status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'COMPLETED_VISIT_STATE_CHANGED';
  END IF;

  v_context := public.get_completed_bill_correction_context(
    '70000000-0000-4000-8000-000000000201'
  );
  v_before_fingerprint := v_context->>'fingerprint';
  SELECT count(*) INTO v_audit_before_atomic
  FROM public.get_completed_bill_correction_history(
    '70000000-0000-4000-8000-000000000201',
    100, NULL, NULL
  );
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
  )->>'fingerprint' IS DISTINCT FROM v_before_fingerprint THEN
    RAISE EXCEPTION 'ATOMIC_ROLLBACK_FAILED';
  END IF;
  SELECT count(*) INTO v_current_count
  FROM public.get_completed_bill_correction_history(
    '70000000-0000-4000-8000-000000000201',
    100, NULL, NULL
  );
  IF v_current_count IS DISTINCT FROM v_audit_before_atomic
     OR (SELECT count(*)
         FROM public.get_completed_bill_correction_history(
           '70000000-0000-4000-8000-000000000201',
           100, NULL, NULL
         )
         WHERE reason = 'TEST atomic rollback') IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'ATOMIC_ROLLBACK_AUDIT_CHANGED';
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
  SELECT count(*) INTO v_audit_before_stale
  FROM public.get_completed_bill_correction_history(
    '70000000-0000-4000-8000-000000000201',
    100, NULL, NULL
  );
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
  SELECT count(*) INTO v_current_count
  FROM public.consultation_items
  WHERE id = '70000000-0000-4000-8000-000000000501';
  IF v_current_count IS DISTINCT FROM 1
     OR v_price IS DISTINCT FROM 13 THEN
    RAISE EXCEPTION 'STALE_WRITER_A_STATE_MISMATCH';
  END IF;
  SELECT count(*) INTO v_current_count
  FROM public.get_completed_bill_correction_history(
    '70000000-0000-4000-8000-000000000201',
    100, NULL, NULL
  );
  IF v_current_count IS DISTINCT FROM v_audit_before_stale + 1
     OR (SELECT count(*)
         FROM public.get_completed_bill_correction_history(
           '70000000-0000-4000-8000-000000000201',
           100, NULL, NULL
         )
         WHERE reason = 'TEST writer A') IS DISTINCT FROM 1
     OR (SELECT count(*)
         FROM public.get_completed_bill_correction_history(
           '70000000-0000-4000-8000-000000000201',
           100, NULL, NULL
         )
         WHERE reason = 'TEST stale writer B') IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'STALE_WRITER_A_STATE_MISMATCH';
  END IF;

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
  v_cash_audit_id := (v_result->>'audit_id')::uuid;
  SELECT count(*) INTO v_current_count
  FROM public.payments
  WHERE id = '70000000-0000-4000-8000-000000000601'
    AND queue_entry_id = '70000000-0000-4000-8000-000000000201'
    AND consultation_id = '70000000-0000-4000-8000-000000000301'
    AND deleted_at IS NULL;
  IF v_current_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'CORRECTED_PAYMENT_ROW_MISMATCH';
  END IF;
  SELECT amount, payment_method
  INTO STRICT v_payment_amount, v_payment_method
  FROM public.payments
  WHERE id = '70000000-0000-4000-8000-000000000601'
    AND deleted_at IS NULL;
  IF v_payment_amount IS DISTINCT FROM 40
     OR v_payment_method IS DISTINCT FROM 'qr_pay' THEN
    RAISE EXCEPTION 'CORRECTED_PAYMENT_ROW_MISMATCH';
  END IF;
  SELECT count(*) INTO v_current_count
  FROM public.get_completed_bill_correction_history(
    '70000000-0000-4000-8000-000000000201',
    100, NULL, NULL
  )
  WHERE id = v_cash_audit_id;
  IF v_current_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'AUDIT_SNAPSHOT_FAILED';
  END IF;
  SELECT reason, before_total, after_total
  INTO STRICT v_history_reason, v_history_before_total, v_history_after_total
  FROM public.get_completed_bill_correction_history(
    '70000000-0000-4000-8000-000000000201',
    100, NULL, NULL
  )
  WHERE id = v_cash_audit_id;
  IF v_history_reason IS DISTINCT FROM 'TEST cash outstanding'
     OR v_history_before_total IS DISTINCT FROM 61
     OR v_history_after_total IS DISTINCT FROM 60.5
     OR (v_result->>'paid')::numeric IS DISTINCT FROM 40 THEN
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
  SELECT count(*) INTO v_current_count
  FROM public.payments
  WHERE id = '70000000-0000-4000-8000-000000000601'
    AND amount = 70
    AND payment_method = 'card'
    AND deleted_at IS NULL;
  IF v_current_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'CORRECTED_PAYMENT_ROW_MISMATCH';
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
  SELECT count(*) INTO v_current_count
  FROM public.panel_claims pc
  WHERE pc.id = '70000000-0000-4000-8000-000000000901';
  IF v_current_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'PANEL_CLAIM_ROW_MISMATCH';
  END IF;
  SELECT amount, status, received_amount, approved_amount
  INTO STRICT
    v_claim_amount, v_claim_status, v_claim_received, v_claim_approved
  FROM public.panel_claims
  WHERE id = '70000000-0000-4000-8000-000000000901';
  IF v_claim_amount IS DISTINCT FROM 80
     OR v_claim_status IS DISTINCT FROM 'received'
     OR v_claim_received IS DISTINCT FROM 120
     OR v_claim_approved IS DISTINCT FROM 100
     OR (v_result->>'panel_credit_due')::numeric IS DISTINCT FROM 40 THEN
    RAISE EXCEPTION 'PANEL_CLAIM_ROW_MISMATCH';
  END IF;

  v_context := public.get_completed_bill_correction_context(
    '70000000-0000-4000-8000-000000000202'
  );
  SELECT jsonb_agg(
    value || '{"remove":false,"price":140}'::jsonb
  )
  INTO v_items FROM jsonb_array_elements(v_context->'items');
  v_result := public.correct_completed_bill(
    '70000000-0000-4000-8000-000000000202',
    v_context->>'fingerprint',
    'TEST panel outstanding correction',
    v_items, v_context->'payments', 0, 0
  );
  SELECT amount, status, received_amount
  INTO STRICT v_claim_amount, v_claim_status, v_claim_received
  FROM public.panel_claims
  WHERE id = '70000000-0000-4000-8000-000000000901';
  IF v_claim_amount IS DISTINCT FROM 140
     OR v_claim_status IS DISTINCT FROM 'approved'
     OR v_claim_received IS DISTINCT FROM 120 THEN
    RAISE EXCEPTION 'PANEL_CLAIM_OUTSTANDING_CORRECTION_MISMATCH';
  END IF;
  SELECT count(*) INTO v_current_count
  FROM public.get_completed_bill_correction_history(
    '70000000-0000-4000-8000-000000000202',
    100, NULL, NULL
  )
  WHERE reason = 'TEST panel outstanding correction'
    AND before_total = 80
    AND after_total = 140;
  IF v_current_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'PANEL_CLAIM_OUTSTANDING_AUDIT_MISMATCH';
  END IF;

  PERFORM public.update_panel_claim_workflow(
    '70000000-0000-4000-8000-000000000901',
    'received', NULL, 140,
    'TEST-PANEL-REMAINDER', current_date, 140,
    'TEST remaining correction payment', NULL, NULL
  );
  SELECT amount, status, received_amount
  INTO STRICT v_claim_amount, v_claim_status, v_claim_received
  FROM public.panel_claims
  WHERE id = '70000000-0000-4000-8000-000000000901';
  IF v_claim_amount IS DISTINCT FROM 140
     OR v_claim_status IS DISTINCT FROM 'received'
     OR v_claim_received IS DISTINCT FROM 140 THEN
    RAISE EXCEPTION 'PANEL_CLAIM_REMAINING_PAYMENT_STRANDED';
  END IF;

  SELECT count(*) INTO v_current_count
  FROM public.get_completed_bill_correction_history(
    '70000000-0000-4000-8000-000000000201',
    100, NULL, NULL
  );
  IF v_current_count IS DISTINCT FROM 10
     OR (SELECT count(*)
         FROM public.get_completed_bill_correction_history(
           '70000000-0000-4000-8000-000000000201',
           100, NULL, NULL
         )
         WHERE id = v_cash_audit_id
           AND actor_id =
             '70000000-0000-4000-8000-000000000001'
           AND reason = 'TEST cash outstanding'
           AND before_total = 61
           AND after_total = 60.5) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'HISTORY_PROJECTION_EXACT_MISMATCH';
  END IF;

  -- The checkout RPC itself executes through the authenticated API role.
  PERFORM public.record_payment_and_complete_visit(
    '70000000-0000-4000-8000-000000000203',
    '70000000-0000-4000-8000-000000000303',
    'self_pay', 'cash', 25, 'TEST ONLY ATOMIC CHECKOUT'
  );
  SELECT qe.clinic_status, c.status
  INTO STRICT v_queue_status, v_consultation_status
  FROM public.queue_entries qe
  JOIN public.consultations c ON c.queue_entry_id = qe.id
  WHERE qe.id = '70000000-0000-4000-8000-000000000203'
    AND c.id = '70000000-0000-4000-8000-000000000303';
  SELECT count(*), min(amount), min(payment_method)
  INTO v_current_count, v_payment_amount, v_payment_method
  FROM public.payments
  WHERE queue_entry_id = '70000000-0000-4000-8000-000000000203'
    AND consultation_id = '70000000-0000-4000-8000-000000000303'
    AND payment_type = 'self_pay'
    AND deleted_at IS NULL;
  IF v_queue_status IS DISTINCT FROM 'completed'
     OR v_consultation_status IS DISTINCT FROM 'completed'
     OR v_current_count IS DISTINCT FROM 1
     OR v_payment_amount IS DISTINCT FROM 25
     OR v_payment_method IS DISTINCT FROM 'cash' THEN
    RAISE EXCEPTION 'ATOMIC_CHECKOUT_STATE_MISMATCH';
  END IF;
  BEGIN
    PERFORM public.record_payment_and_complete_visit(
      '70000000-0000-4000-8000-000000000203',
      '70000000-0000-4000-8000-000000000303',
      'self_pay', 'cash', 25, 'TEST ONLY DUPLICATE CHECKOUT'
    );
    RAISE EXCEPTION 'DUPLICATE_CHECKOUT_SUCCEEDED';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM <> 'INVALID_PAYMENT_STATUS' THEN RAISE; END IF;
  END;
  SELECT qe.clinic_status, c.status
  INTO STRICT v_queue_status, v_consultation_status
  FROM public.queue_entries qe
  JOIN public.consultations c ON c.queue_entry_id = qe.id
  WHERE qe.id = '70000000-0000-4000-8000-000000000203'
    AND c.id = '70000000-0000-4000-8000-000000000303';
  SELECT count(*), min(amount), min(payment_method)
  INTO v_current_count, v_payment_amount, v_payment_method
  FROM public.payments
  WHERE queue_entry_id = '70000000-0000-4000-8000-000000000203'
    AND consultation_id = '70000000-0000-4000-8000-000000000303'
    AND payment_type = 'self_pay'
    AND deleted_at IS NULL;
  IF v_queue_status IS DISTINCT FROM 'completed'
     OR v_consultation_status IS DISTINCT FROM 'completed'
     OR v_current_count IS DISTINCT FROM 1
     OR v_payment_amount IS DISTINCT FROM 25
     OR v_payment_method IS DISTINCT FROM 'cash' THEN
    RAISE EXCEPTION 'DUPLICATE_CHECKOUT_STATE_CHANGED';
  END IF;

  -- Execute the retained dispensary checkout against the same corrected bill:
  -- saved quantity 3 x RM10 = RM30 although only 2 were dispensed.
  v_result := public.checkout_visit(
    '70000000-0000-4000-8000-000000000210',
    '70000000-0000-4000-8000-000000000310',
    30, 30, 'cash', 'self_pay', NULL, '[]'::jsonb,
    'TEST ONLY RETAINED SAVED QUANTITY', 0, NULL,
    '70000000-0000-4000-8000-000000000a15'
  );
  IF (v_result->>'balance_due')::numeric IS DISTINCT FROM 0::numeric
     OR (SELECT sum(amount) FROM public.payments
         WHERE queue_entry_id = '70000000-0000-4000-8000-000000000210'
           AND deleted_at IS NULL) IS DISTINCT FROM 30::numeric THEN
    RAISE EXCEPTION 'RETAINED_CHECKOUT_SAVED_QUANTITY_30_MISMATCH';
  END IF;

  -- Past debt is a completed historical ledger only. An active checkout must
  -- neither appear in the selector snapshot nor be accepted by settlement.
  v_context := public.get_patient_debt_snapshot(
    '70000000-0000-4000-8000-000000000104'
  );
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_context->'consultations') AS row
    WHERE row->>'id' = '70000000-0000-4000-8000-000000000317'
  ) THEN
    RAISE EXCEPTION 'ACTIVE_VISIT_EXPOSED_AS_PAST_DEBT';
  END IF;
  BEGIN
    PERFORM public.settle_multiple_debts(
      '70000000-0000-4000-8000-000000000215',
      ARRAY['70000000-0000-4000-8000-000000000317'::uuid],
      1, 'cash', 'TEST ONLY ACTIVE VISIT IS NOT DEBT',
      '70000000-0000-4000-8000-000000000a22'
    );
    RAISE EXCEPTION 'ACTIVE_VISIT_DEBT_REJECTION_MISSED';
  EXCEPTION WHEN SQLSTATE '23503' THEN
    IF SQLERRM <> 'CONSULTATION_NOT_PATIENT_DEBT' THEN RAISE; END IF;
  END;

  -- A keyed multi-debt settlement posts each allocation to its historical
  -- visit ledger while the payment-only ticket coordinates one durable batch.
  -- The RM70 active panel claim leaves RM30 patient liability on the RM100
  -- panel visit, so RM75 pays RM60 cash debt + RM15 panel patient debt.
  PERFORM public.test_only_set_panel_claim_status(
    '70000000-0000-4000-8000-000000000212', 'submitted'
  );
  v_result := public.settle_multiple_debts(
    '70000000-0000-4000-8000-000000000213',
    ARRAY[
      '70000000-0000-4000-8000-000000000311'::uuid,
      '70000000-0000-4000-8000-000000000312'::uuid
    ],
    75, 'cash', 'TEST ONLY KEYED MULTI DEBT',
    '70000000-0000-4000-8000-000000000a20'
  );
  v_replay_result := public.settle_multiple_debts(
    '70000000-0000-4000-8000-000000000213',
    ARRAY[
      '70000000-0000-4000-8000-000000000311'::uuid,
      '70000000-0000-4000-8000-000000000312'::uuid
    ],
    75, 'cash', 'TEST ONLY KEYED MULTI DEBT',
    '70000000-0000-4000-8000-000000000a20'
  );
  v_batch_count := public.test_only_payment_batch_count(
    '70000000-0000-4000-8000-000000000213'
  );
  SELECT clinic_status::text INTO STRICT v_queue_status
  FROM public.queue_entries
  WHERE id = '70000000-0000-4000-8000-000000000213';
  IF v_result IS DISTINCT FROM v_replay_result
     OR v_batch_count IS DISTINCT FROM 1
     OR v_queue_status IS DISTINCT FROM 'completed'
     OR (SELECT count(*) FROM public.payments
         WHERE queue_entry_id IN (
           '70000000-0000-4000-8000-000000000211',
           '70000000-0000-4000-8000-000000000212'
         ) AND deleted_at IS NULL) IS DISTINCT FROM 2
     OR (SELECT count(DISTINCT batch_id) FROM public.payments
         WHERE queue_entry_id IN (
           '70000000-0000-4000-8000-000000000211',
           '70000000-0000-4000-8000-000000000212'
         ) AND deleted_at IS NULL) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'DEBT_KEYED_REPLAY_MISMATCH';
  END IF;
  IF EXISTS (
       SELECT 1 FROM public.payments
       WHERE queue_entry_id = '70000000-0000-4000-8000-000000000213'
     )
     OR (SELECT coalesce(sum(amount), 0) FROM public.payments
         WHERE queue_entry_id = '70000000-0000-4000-8000-000000000211'
           AND consultation_id = '70000000-0000-4000-8000-000000000311'
           AND deleted_at IS NULL) IS DISTINCT FROM 60::numeric
     OR (SELECT coalesce(sum(amount), 0) FROM public.payments
         WHERE queue_entry_id = '70000000-0000-4000-8000-000000000212'
           AND consultation_id = '70000000-0000-4000-8000-000000000312'
           AND deleted_at IS NULL) IS DISTINCT FROM 15::numeric THEN
    RAISE EXCEPTION 'DEBT_ORIGINAL_QUEUE_ATTRIBUTION_MISMATCH';
  END IF;
  IF (v_result->>'debt_remaining')::numeric IS DISTINCT FROM 15::numeric
     OR (SELECT amount FROM public.panel_claims
         WHERE queue_entry_id = '70000000-0000-4000-8000-000000000212')
        IS DISTINCT FROM 70::numeric THEN
    RAISE EXCEPTION 'DEBT_PANEL_COVERAGE_MISMATCH';
  END IF;
  IF (SELECT payment_type FROM public.payments
      WHERE queue_entry_id = '70000000-0000-4000-8000-000000000211'
        AND batch_id = (v_result->>'batch_id')::uuid) IS DISTINCT FROM 'self_pay'
     OR (SELECT payment_type FROM public.payments
         WHERE queue_entry_id = '70000000-0000-4000-8000-000000000212'
           AND batch_id = (v_result->>'batch_id')::uuid) IS DISTINCT FROM 'panel'
     OR (SELECT payment_type FROM public.payment_batches
         WHERE id = (v_result->>'batch_id')::uuid) IS DISTINCT FROM 'mixed' THEN
    RAISE EXCEPTION 'DEBT_PANEL_PAYMENT_TYPE_MISMATCH';
  END IF;
  IF (SELECT status::text FROM public.panel_claims
      WHERE queue_entry_id = '70000000-0000-4000-8000-000000000212')
     IS DISTINCT FROM 'submitted' THEN
    RAISE EXCEPTION 'DEBT_MATERIALIZED_PANEL_ALLOCATION_MISMATCH';
  END IF;

  -- Checkout-capable purchaser and staff-nurse roles execute the narrow
  -- snapshot APIs and verify their actual response shapes.
  PERFORM set_config(
    'request.jwt.claim.sub', '70000000-0000-4000-8000-000000000013', true
  );
  v_context := public.get_visit_financial_snapshot(
    '70000000-0000-4000-8000-000000000212'
  );
  IF NOT (v_context ? 'claim')
     OR (v_context->'claim'->>'amount')::numeric IS DISTINCT FROM 70::numeric THEN
    RAISE EXCEPTION 'PURCHASER_VISIT_SNAPSHOT_MISMATCH';
  END IF;
  PERFORM set_config(
    'request.jwt.claim.sub', '70000000-0000-4000-8000-000000000014', true
  );
  v_payment_id := (v_result->'payment_ids'->>0)::uuid;
  v_context := public.get_payment_batch_receipt(v_payment_id);
  IF v_context->>'receipt_id' IS DISTINCT FROM v_result->>'batch_id'
     OR jsonb_array_length(v_context->'payments') IS DISTINCT FROM 2
     OR jsonb_array_length(v_context->'queue_entries') IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'STAFF_NURSE_RECEIPT_SNAPSHOT_MISMATCH';
  END IF;
  PERFORM set_config(
    'request.jwt.claim.sub', '70000000-0000-4000-8000-000000000001', true
  );
  -- The durable batch is closed when its result is stored. A cached client
  -- cannot append a tender to the returned batch UUID and corrupt the receipt.
  BEGIN
    INSERT INTO public.payments (
      batch_id, queue_entry_id, consultation_id, payment_type,
      payment_method, amount, notes
    ) VALUES (
      (v_result->>'batch_id')::uuid,
      '70000000-0000-4000-8000-000000000212',
      '70000000-0000-4000-8000-000000000312',
      'self_pay', 'cash', 1, 'TEST ONLY FORBIDDEN BATCH APPEND'
    );
    RAISE EXCEPTION 'PAYMENT_BATCH_APPEND_REJECTION_MISSED';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    IF SQLERRM <> 'PAYMENT_BATCH_WRITE_FORBIDDEN' THEN RAISE; END IF;
  END;

  -- An authenticated cached client cannot move even an otherwise-updatable
  -- active payment onto another visit or attach it to a returned batch.
  BEGIN
    UPDATE public.payments
    SET queue_entry_id = '70000000-0000-4000-8000-000000000211',
        batch_id = (v_result->>'batch_id')::uuid
    WHERE id = '70000000-0000-4000-8000-000000000618';
    RAISE EXCEPTION 'PAYMENT_PROVENANCE_FORGERY_SUCCEEDED';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    IF SQLERRM <> 'PAYMENT_PROVENANCE_IMMUTABLE' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.settle_multiple_debts(
      '70000000-0000-4000-8000-000000000213',
      ARRAY[
        '70000000-0000-4000-8000-000000000311'::uuid,
        '70000000-0000-4000-8000-000000000312'::uuid
      ],
      75, 'cash', 'TEST ONLY CHANGED DEBT NOTES',
      '70000000-0000-4000-8000-000000000a20'
    );
    RAISE EXCEPTION 'DEBT_IDEMPOTENCY_CONFLICT_MISSED';
  EXCEPTION WHEN SQLSTATE '23505' THEN
    IF SQLERRM <> 'IDEMPOTENCY_KEY_CONFLICT' THEN RAISE; END IF;
  END;

  -- A coordinator may only settle consultations belonging to its patient.
  -- The failed keyed statement must roll its provisional batch back so the
  -- same coordinator remains usable by the five-argument compatibility call.
  BEGIN
    PERFORM public.settle_multiple_debts(
      '70000000-0000-4000-8000-000000000215',
      ARRAY['70000000-0000-4000-8000-000000000316'::uuid],
      1, 'cash', 'TEST ONLY WRONG PATIENT DEBT',
      '70000000-0000-4000-8000-000000000a21'
    );
    RAISE EXCEPTION 'DEBT_WRONG_PATIENT_REJECTION_MISSED';
  EXCEPTION WHEN SQLSTATE '23503' THEN
    IF SQLERRM <> 'CONSULTATION_NOT_PATIENT_DEBT' THEN RAISE; END IF;
  END;

  -- The five-argument cached-client overload remains executable, but its
  -- generated batch and payment still use the coordinator/original split.
  v_result := public.settle_multiple_debts(
    '70000000-0000-4000-8000-000000000215',
    ARRAY['70000000-0000-4000-8000-000000000313'::uuid],
    25, 'card', 'TEST ONLY LEGACY DEBT OVERLOAD'
  );
  IF (v_result->>'total_collected')::numeric IS DISTINCT FROM 25::numeric
     OR public.test_only_payment_batch_count(
          '70000000-0000-4000-8000-000000000215'
        ) IS DISTINCT FROM 1
     OR EXISTS (
       SELECT 1 FROM public.payments
       WHERE queue_entry_id = '70000000-0000-4000-8000-000000000215'
     )
     OR (SELECT coalesce(sum(amount), 0) FROM public.payments
         WHERE queue_entry_id = '70000000-0000-4000-8000-000000000214'
           AND consultation_id = '70000000-0000-4000-8000-000000000313'
           AND deleted_at IS NULL) IS DISTINCT FROM 25::numeric THEN
    RAISE EXCEPTION 'DEBT_LEGACY_OVERLOAD_MISMATCH';
  END IF;

  -- Cash 40 + QR 60 creates two rows, completes once, and a network retry
  -- returns the exact durable result without inserting again.
  v_result := public.record_split_payments_and_complete_visit(
    '70000000-0000-4000-8000-000000000204',
    '70000000-0000-4000-8000-000000000304',
    'self_pay', 100,
    '[{"payment_method":"cash","amount":40},{"payment_method":"qr_pay","amount":60}]'::jsonb,
    NULL, 'TEST ONLY SPLIT CHECKOUT',
    '70000000-0000-4000-8000-000000000a01'
  );
  v_replay_result := public.record_split_payments_and_complete_visit(
    '70000000-0000-4000-8000-000000000204',
    '70000000-0000-4000-8000-000000000304',
    'self_pay', 100,
    '[{"payment_method":"qr_pay","amount":60},{"payment_method":"cash","amount":40}]'::jsonb,
    NULL, 'TEST ONLY SPLIT CHECKOUT',
    '70000000-0000-4000-8000-000000000a01'
  );
  SELECT count(*) INTO v_current_count
  FROM public.payments
  WHERE queue_entry_id = '70000000-0000-4000-8000-000000000204'
    AND deleted_at IS NULL;
  v_batch_count := public.test_only_payment_batch_count(
    '70000000-0000-4000-8000-000000000204'
  );
  SELECT qe.clinic_status, c.status
  INTO STRICT v_queue_status, v_consultation_status
  FROM public.queue_entries qe
  JOIN public.consultations c ON c.queue_entry_id = qe.id
  WHERE qe.id = '70000000-0000-4000-8000-000000000204'
    AND c.id = '70000000-0000-4000-8000-000000000304';
  IF v_result IS DISTINCT FROM v_replay_result
     OR v_current_count IS DISTINCT FROM 2
     OR v_batch_count IS DISTINCT FROM 1
     OR (v_result->>'payment_count')::integer IS DISTINCT FROM 2
     OR v_queue_status IS DISTINCT FROM 'completed'
     OR v_consultation_status IS DISTINCT FROM 'completed'
     OR (SELECT sum(amount) FROM public.payments
         WHERE queue_entry_id = '70000000-0000-4000-8000-000000000204'
           AND deleted_at IS NULL) IS DISTINCT FROM 100::numeric THEN
    RAISE EXCEPTION 'SPLIT_CHECKOUT_IDEMPOTENCY_MISMATCH';
  END IF;

  -- Every request field represented by the active RPC must participate in
  -- idempotency conflict detection, while tender order remains canonical.
  BEGIN
    PERFORM public.record_split_payments_and_complete_visit(
      '70000000-0000-4000-8000-000000000204',
      '70000000-0000-4000-8000-000000000305',
      'self_pay', 100,
      '[{"payment_method":"cash","amount":40},{"payment_method":"qr_pay","amount":60}]'::jsonb,
      NULL, 'TEST ONLY SPLIT CHECKOUT',
      '70000000-0000-4000-8000-000000000a01'
    );
    RAISE EXCEPTION 'IDEMPOTENCY_CONSULTATION_CONFLICT_MISSED';
  EXCEPTION WHEN SQLSTATE '23505' THEN
    IF SQLERRM <> 'IDEMPOTENCY_KEY_CONFLICT' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.record_split_payments_and_complete_visit(
      '70000000-0000-4000-8000-000000000204',
      '70000000-0000-4000-8000-000000000304',
      'self_pay', 100,
      '[{"payment_method":"cash","amount":60},{"payment_method":"qr_pay","amount":40}]'::jsonb,
      NULL, 'TEST ONLY SPLIT CHECKOUT',
      '70000000-0000-4000-8000-000000000a01'
    );
    RAISE EXCEPTION 'IDEMPOTENCY_ALLOCATIONS_CONFLICT_MISSED';
  EXCEPTION WHEN SQLSTATE '23505' THEN
    IF SQLERRM <> 'IDEMPOTENCY_KEY_CONFLICT' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.record_split_payments_and_complete_visit(
      '70000000-0000-4000-8000-000000000204',
      '70000000-0000-4000-8000-000000000304',
      'self_pay', 100,
      '[{"payment_method":"cash","amount":40},{"payment_method":"qr_pay","amount":60}]'::jsonb,
      '70000000-0000-4000-8000-000000000801',
      'TEST ONLY SPLIT CHECKOUT',
      '70000000-0000-4000-8000-000000000a01'
    );
    RAISE EXCEPTION 'IDEMPOTENCY_PROVIDER_CONFLICT_MISSED';
  EXCEPTION WHEN SQLSTATE '23505' THEN
    IF SQLERRM <> 'IDEMPOTENCY_KEY_CONFLICT' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.record_split_payments_and_complete_visit(
      '70000000-0000-4000-8000-000000000204',
      '70000000-0000-4000-8000-000000000304',
      'self_pay', 100,
      '[{"payment_method":"cash","amount":40},{"payment_method":"qr_pay","amount":60}]'::jsonb,
      NULL, 'TEST ONLY CHANGED NOTES',
      '70000000-0000-4000-8000-000000000a01'
    );
    RAISE EXCEPTION 'IDEMPOTENCY_NOTES_CONFLICT_MISSED';
  EXCEPTION WHEN SQLSTATE '23505' THEN
    IF SQLERRM <> 'IDEMPOTENCY_KEY_CONFLICT' THEN RAISE; END IF;
  END;

  -- Billing staff can void exactly one completed tender atomically. The RPC
  -- leaves its sibling active, records the reason, and returns the new debt.
  SELECT id INTO STRICT v_payment_id
  FROM public.payments
  WHERE queue_entry_id = '70000000-0000-4000-8000-000000000204'
    AND payment_method = 'cash'
    AND deleted_at IS NULL;
  v_result := public.void_payment_portion(v_payment_id, 'TEST ONLY wrong tender');
  IF (v_result->>'patient_outstanding')::numeric IS DISTINCT FROM 40::numeric
     OR (SELECT count(*) FROM public.payments
         WHERE queue_entry_id = '70000000-0000-4000-8000-000000000204'
           AND deleted_at IS NULL) IS DISTINCT FROM 1
     OR (SELECT deleted_by FROM public.payments WHERE id = v_payment_id)
          IS DISTINCT FROM '70000000-0000-4000-8000-000000000001'::uuid
     OR public.test_only_payment_void_audit_count(
          v_payment_id, 'TEST ONLY wrong tender'
        ) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'VOID_PAYMENT_PORTION_MISMATCH';
  END IF;
  BEGIN
    PERFORM public.get_payment_batch_receipt(v_payment_id);
    RAISE EXCEPTION 'VOIDED_RECEIPT_REJECTION_MISSED';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM <> 'PAYMENT_VOIDED' THEN RAISE; END IF;
  END;

  -- The active-checkout RPC cannot resurrect cancelled visits.
  UPDATE public.queue_entries SET clinic_status = 'cancelled'
  WHERE id = '70000000-0000-4000-8000-000000000205';
  BEGIN
    PERFORM public.record_split_payments_and_complete_visit(
      '70000000-0000-4000-8000-000000000205',
      '70000000-0000-4000-8000-000000000305',
      'self_pay', 100, '[{"payment_method":"cash","amount":100}]'::jsonb,
      NULL, NULL, '70000000-0000-4000-8000-000000000a13'
    );
    RAISE EXCEPTION 'CANCELLED_SPLIT_CHECKOUT_SUCCEEDED';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM <> 'INVALID_CHECKOUT_STATUS' THEN RAISE; END IF;
  END;
  UPDATE public.queue_entries SET clinic_status = 'dispensing_payment'
  WHERE id = '70000000-0000-4000-8000-000000000205';

  -- Duplicate methods, under/over allocation, negative amounts, and methods
  -- outside the four physical tenders all fail with the validation SQLSTATE.
  BEGIN
    PERFORM public.record_split_payments_and_complete_visit(
      '70000000-0000-4000-8000-000000000205',
      '70000000-0000-4000-8000-000000000305',
      'self_pay', 100,
      '[{"payment_method":"cash","amount":40},{"payment_method":"cash","amount":60}]'::jsonb,
      NULL, NULL, '70000000-0000-4000-8000-000000000a02'
    );
    RAISE EXCEPTION 'DUPLICATE_SPLIT_METHOD_SUCCEEDED';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM <> 'INVALID_PAYMENT_ALLOCATIONS' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.record_split_payments_and_complete_visit(
      '70000000-0000-4000-8000-000000000205',
      '70000000-0000-4000-8000-000000000305',
      'self_pay', 100,
      '[{"payment_method":"cash","amount":40},{"payment_method":"qr_pay","amount":59.99}]'::jsonb,
      NULL, NULL, '70000000-0000-4000-8000-000000000a03'
    );
    RAISE EXCEPTION 'UNDER_ALLOCATED_SPLIT_SUCCEEDED';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM <> 'INVALID_PAYMENT_ALLOCATIONS' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.record_split_payments_and_complete_visit(
      '70000000-0000-4000-8000-000000000205',
      '70000000-0000-4000-8000-000000000305',
      'self_pay', 100,
      '[{"payment_method":"cash","amount":40},{"payment_method":"qr_pay","amount":60.01}]'::jsonb,
      NULL, NULL, '70000000-0000-4000-8000-000000000a04'
    );
    RAISE EXCEPTION 'OVER_ALLOCATED_SPLIT_SUCCEEDED';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM <> 'INVALID_PAYMENT_ALLOCATIONS' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.record_split_payments_and_complete_visit(
      '70000000-0000-4000-8000-000000000205',
      '70000000-0000-4000-8000-000000000305',
      'self_pay', 100,
      '[{"payment_method":"cash","amount":110},{"payment_method":"qr_pay","amount":-10}]'::jsonb,
      NULL, NULL, '70000000-0000-4000-8000-000000000a05'
    );
    RAISE EXCEPTION 'NEGATIVE_SPLIT_AMOUNT_SUCCEEDED';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM <> 'INVALID_PAYMENT_ALLOCATIONS' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.record_split_payments_and_complete_visit(
      '70000000-0000-4000-8000-000000000205',
      '70000000-0000-4000-8000-000000000305',
      'self_pay', 100,
      '[{"payment_method":"cash","amount":40},{"payment_method":"cheque","amount":60}]'::jsonb,
      NULL, NULL, '70000000-0000-4000-8000-000000000a06'
    );
    RAISE EXCEPTION 'UNSUPPORTED_SPLIT_METHOD_SUCCEEDED';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM <> 'INVALID_PAYMENT_ALLOCATIONS' THEN RAISE; END IF;
  END;

  -- Panel co-payments retain panel attribution while their physical methods
  -- MATERIALIZED_ACTIVE_PANEL_SPLIT_SUCCEEDED is the forbidden outcome when
  -- the active RPC observes a submitted/approved/received parent claim.
  -- reduce the pending panel claim rather than masquerading as remittance.
  PERFORM public.test_only_seed_panel_claim_portion(
    '70000000-0000-4000-8000-000000000206'
  );
  PERFORM public.test_only_set_panel_claim_status(
    '70000000-0000-4000-8000-000000000206', 'submitted'
  );
  BEGIN
    PERFORM public.record_split_payments_and_complete_visit(
      '70000000-0000-4000-8000-000000000206',
      '70000000-0000-4000-8000-000000000306', 'panel', 30,
      '[{"payment_method":"cash","amount":30}]'::jsonb,
      '70000000-0000-4000-8000-000000000801', NULL,
      '70000000-0000-4000-8000-000000000a14'
    );
    RAISE EXCEPTION 'MATERIALIZED_ACTIVE_PANEL_SPLIT_SUCCEEDED';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    IF SQLERRM <> 'PANEL_CLAIM_ALREADY_MATERIALIZED' THEN RAISE; END IF;
  END;
  PERFORM public.test_only_set_panel_claim_status(
    '70000000-0000-4000-8000-000000000206', 'pending'
  );
  PERFORM public.test_only_clear_panel_claim_portions(
    '70000000-0000-4000-8000-000000000206'
  );
  PERFORM public.record_split_payments_and_complete_visit(
    '70000000-0000-4000-8000-000000000206',
    '70000000-0000-4000-8000-000000000306',
    'panel', 30,
    '[{"payment_method":"cash","amount":20},{"payment_method":"card","amount":10}]'::jsonb,
    '70000000-0000-4000-8000-000000000801',
    'TEST ONLY PANEL SPLIT',
    '70000000-0000-4000-8000-000000000a07'
  );
  SELECT count(*) INTO v_current_count
  FROM public.payments
  WHERE queue_entry_id = '70000000-0000-4000-8000-000000000206'
    AND payment_type = 'panel'
    AND payment_method IN ('cash', 'card')
    AND deleted_at IS NULL;
  SELECT amount INTO STRICT v_claim_amount
  FROM public.panel_claims
  WHERE queue_entry_id = '70000000-0000-4000-8000-000000000206';
  IF v_current_count IS DISTINCT FROM 2
     OR v_claim_amount IS DISTINCT FROM 70::numeric
     OR (SELECT sum(amount) FROM public.payments
         WHERE queue_entry_id = '70000000-0000-4000-8000-000000000206'
           AND deleted_at IS NULL) IS DISTINCT FROM 30::numeric THEN
    RAISE EXCEPTION 'PANEL_SPLIT_LEDGER_MISMATCH';
  END IF;

  -- A completed visit may collect a partial batch up to current outstanding
  -- without changing either completed status.
  v_result := public.record_split_payments(
    '70000000-0000-4000-8000-000000000207',
    '70000000-0000-4000-8000-000000000307',
    'self_pay',
    '[{"payment_method":"cash","amount":25},{"payment_method":"qr_pay","amount":25}]'::jsonb,
    'TEST ONLY COMPLETED SPLIT',
    '70000000-0000-4000-8000-000000000a08'
  );
  SELECT qe.clinic_status, c.status
  INTO STRICT v_queue_status, v_consultation_status
  FROM public.queue_entries qe
  JOIN public.consultations c ON c.queue_entry_id = qe.id
  WHERE qe.id = '70000000-0000-4000-8000-000000000207'
    AND c.id = '70000000-0000-4000-8000-000000000307';
  SELECT count(*) INTO v_current_count
  FROM public.payments
  WHERE queue_entry_id = '70000000-0000-4000-8000-000000000207'
    AND deleted_at IS NULL;
  IF v_queue_status IS DISTINCT FROM 'completed'
     OR v_consultation_status IS DISTINCT FROM 'completed'
     OR v_current_count IS DISTINCT FROM 2
     OR (v_result->>'amount')::numeric IS DISTINCT FROM 50::numeric
     OR (v_result->>'balance_due')::numeric IS DISTINCT FROM 30::numeric THEN
    RAISE EXCEPTION 'COMPLETED_SPLIT_COLLECTION_MISMATCH';
  END IF;

  -- Financials use authoritative saved billed quantity, not stock fulfillment:
  -- quantity 3 x RM10 = RM30 although dispensed_qty is 2.
  IF (SELECT sum(quantity * price) FROM public.consultation_items
      WHERE consultation_id = '70000000-0000-4000-8000-000000000309')
     IS DISTINCT FROM 30.00::numeric THEN
    RAISE EXCEPTION 'SAVED_BILLED_QUANTITY_30_MISMATCH';
  END IF;
  PERFORM public.test_only_seed_panel_claim_portion(
    '70000000-0000-4000-8000-000000000209'
  );
  v_result := public.record_split_payments(
    '70000000-0000-4000-8000-000000000209',
    '70000000-0000-4000-8000-000000000309',
    'panel', '[{"payment_method":"cash","amount":10}]'::jsonb,
    'TEST ONLY PANEL SAVED QUANTITY',
    '70000000-0000-4000-8000-000000000a12'
  );
  SELECT amount INTO STRICT v_claim_amount
  FROM public.panel_claims
  WHERE queue_entry_id = '70000000-0000-4000-8000-000000000209';
  IF (v_result->>'balance_due')::numeric IS DISTINCT FROM 20::numeric
     OR v_claim_amount IS DISTINCT FROM 20::numeric
     OR (SELECT sum(amount) FROM public.payments
         WHERE queue_entry_id = '70000000-0000-4000-8000-000000000209'
           AND deleted_at IS NULL) IS DISTINCT FROM 10::numeric THEN
    RAISE EXCEPTION 'PANEL_SAVED_QUANTITY_RECONCILIATION_MISMATCH';
  END IF;
  IF (SELECT sum(portion.amount) FROM public.panel_claim_portions portion
      JOIN public.panel_claims claim ON claim.id = portion.panel_claim_id
      WHERE claim.queue_entry_id = '70000000-0000-4000-8000-000000000209')
     IS DISTINCT FROM 20::numeric THEN
    RAISE EXCEPTION 'PENDING_PANEL_PORTION_RECONCILIATION_MISMATCH';
  END IF;

  -- An inactive provider remains the stored payer for a completed visit. A
  -- near-total copayment may reduce its wholly unreceived draft split to one
  -- sen by collapsing the no-longer-representable split to an unsplit claim.
  UPDATE public.insurance_providers SET status = 'inactive'
  WHERE id = '70000000-0000-4000-8000-000000000801';
  v_result := public.record_split_payments(
    '70000000-0000-4000-8000-000000000209',
    '70000000-0000-4000-8000-000000000309',
    'panel', '[{"payment_method":"transfer","amount":19.99}]'::jsonb,
    'TEST ONLY ONE CENT PANEL PORTION',
    '70000000-0000-4000-8000-000000000a17'
  );
  SELECT amount INTO STRICT v_claim_amount
  FROM public.panel_claims
  WHERE queue_entry_id = '70000000-0000-4000-8000-000000000209';
  IF v_claim_amount IS DISTINCT FROM 0.01::numeric
     OR EXISTS (
       SELECT 1 FROM public.panel_claim_portions AS portion
       JOIN public.panel_claims AS claim ON claim.id = portion.panel_claim_id
       WHERE claim.queue_entry_id = '70000000-0000-4000-8000-000000000209'
     ) THEN
    RAISE EXCEPTION 'ONE_CENT_PANEL_PORTION_RECONCILIATION_MISMATCH';
  END IF;
  IF public.test_only_zero_panel_portion_audit_count(
       '70000000-0000-4000-8000-000000000209'
     ) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'ONE_CENT_PANEL_PORTION_AUDIT_MISMATCH';
  END IF;

  -- Collecting the entire patient portion of a pending, unreceived split
  -- reduces the parent to zero and removes the now-empty configured portion
  -- through the production rebalancer, preserving its immutable audit trail.
  PERFORM public.test_only_seed_panel_claim_portion(
    '70000000-0000-4000-8000-000000000216'
  );
  v_result := public.record_split_payments(
    '70000000-0000-4000-8000-000000000216',
    '70000000-0000-4000-8000-000000000316',
    'panel', '[{"payment_method":"cash","amount":10}]'::jsonb,
    'TEST ONLY ZERO PANEL PORTION',
    '70000000-0000-4000-8000-000000000a16'
  );
  SELECT amount, status::text INTO STRICT v_claim_amount, v_claim_status
  FROM public.panel_claims
  WHERE queue_entry_id = '70000000-0000-4000-8000-000000000216';
  IF v_claim_amount IS DISTINCT FROM 0::numeric
     OR v_claim_status IS DISTINCT FROM 'pending'
     OR EXISTS (
       SELECT 1
       FROM public.panel_claim_portions AS portion
       JOIN public.panel_claims AS claim
         ON claim.id = portion.panel_claim_id
       WHERE claim.queue_entry_id = '70000000-0000-4000-8000-000000000216'
     )
     OR public.test_only_zero_panel_portion_audit_count(
          '70000000-0000-4000-8000-000000000216'
        ) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'ZERO_PANEL_PORTION_CLEANUP_MISMATCH';
  END IF;

  -- Four individually valid numeric portions whose aggregate exceeds the
  -- durable numeric(12,2) boundary must fail as validation, not overflow.
  BEGIN
    PERFORM public.record_split_payments(
      '70000000-0000-4000-8000-000000000207',
      '70000000-0000-4000-8000-000000000307',
      'self_pay',
      '[{"payment_method":"cash","amount":9999999999.99},{"payment_method":"qr_pay","amount":9999999999.99},{"payment_method":"card","amount":9999999999.99},{"payment_method":"transfer","amount":9999999999.99}]'::jsonb,
      NULL, '70000000-0000-4000-8000-000000000a10'
    );
    RAISE EXCEPTION 'AGGREGATE_SPLIT_OVERFLOW_SUCCEEDED';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM <> 'INVALID_PAYMENT_ALLOCATIONS' THEN RAISE; END IF;
  END;

  -- A materialized panel claim cannot be silently reallocated by a later
  -- completed-visit co-payment batch.
  PERFORM public.test_only_set_panel_claim_status(
    '70000000-0000-4000-8000-000000000206',
    'submitted'
  );
  BEGIN
    PERFORM public.record_split_payments(
      '70000000-0000-4000-8000-000000000206',
      '70000000-0000-4000-8000-000000000306',
      'panel', '[{"payment_method":"transfer","amount":10}]'::jsonb,
      NULL, '70000000-0000-4000-8000-000000000a11'
    );
    RAISE EXCEPTION 'NONPENDING_PANEL_SPLIT_SUCCEEDED';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    IF SQLERRM <> 'PANEL_CLAIM_NOT_PENDING' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM public.payments
      WHERE queue_entry_id = '70000000-0000-4000-8000-000000000206'
        AND deleted_at IS NULL) IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'NONPENDING_PANEL_SPLIT_CHANGED_PAYMENTS';
  END IF;

  -- The test-only trigger rejects the QR row after Cash has inserted. The
  -- caught statement must leave no payment/batch row and no completion state.
  BEGIN
    PERFORM public.record_split_payments_and_complete_visit(
      '70000000-0000-4000-8000-000000000208',
      '70000000-0000-4000-8000-000000000308',
      'self_pay', 100,
      '[{"payment_method":"cash","amount":40},{"payment_method":"qr_pay","amount":60}]'::jsonb,
      NULL, 'TEST ONLY FORCED SPLIT ROLLBACK',
      '70000000-0000-4000-8000-000000000a09'
    );
    RAISE EXCEPTION 'FORCED_SECOND_SPLIT_REJECTION_SUCCEEDED';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM <> 'TEST_ONLY_SECOND_SPLIT_REJECTED' THEN RAISE; END IF;
  END;
  SELECT count(*) INTO v_current_count
  FROM public.payments
  WHERE queue_entry_id = '70000000-0000-4000-8000-000000000208';
  v_batch_count := public.test_only_payment_batch_count(
    '70000000-0000-4000-8000-000000000208'
  );
  SELECT qe.clinic_status, c.status
  INTO STRICT v_queue_status, v_consultation_status
  FROM public.queue_entries qe
  JOIN public.consultations c ON c.queue_entry_id = qe.id
  WHERE qe.id = '70000000-0000-4000-8000-000000000208'
    AND c.id = '70000000-0000-4000-8000-000000000308';
  IF v_current_count IS DISTINCT FROM 0
     OR v_batch_count IS DISTINCT FROM 0
     OR v_queue_status IS DISTINCT FROM 'dispensing_payment'
     OR v_consultation_status IS DISTINCT FROM 'in_progress' THEN
    RAISE EXCEPTION 'FORCED_SPLIT_ROLLBACK_FAILED';
  END IF;
END;
$verify$;

SET CONSTRAINTS ALL IMMEDIATE;
RESET ROLE;
ROLLBACK;

SELECT jsonb_build_object(
  'status', 'pass',
  'database_role', 'authenticated',
  'jwt_claims', 'synthetic',
  'allowed_roles', ARRAY[
    'ops_staff', 'operations', 'staff',
    'admin', 'special_admin', 'doctor_admin',
    'purchaser', 'staff_nurse'
  ],
  'denied_roles', ARRAY[
    'locum', 'resident_doctor', 'website_editor', 'guest'
  ],
  'medicine_inventory', 'pass',
  'atomic_rollback', 'pass',
  'stale_fingerprint', 'pass',
  'cash_panel_reconciliation', 'pass',
  'audit_history', 'pass',
  'atomic_checkout', 'pass',
  'split_payment_batches', 'pass',
  'transaction_end', 'ROLLBACK'
) AS completed_bill_correction_verification;
