-- 1) Replace checkout_visit: always complete consultation+queue (paid OR partial),
--    hard negative-amount floor, zero-amount → coerce method to NULL and skip payment row.
CREATE OR REPLACE FUNCTION public.checkout_visit(
  p_queue_entry_id    uuid,
  p_consultation_id   uuid,
  p_total_amount      numeric,
  p_amount_paid       numeric,
  p_payment_method    text,
  p_payment_type      text DEFAULT 'self_pay'::text,
  p_panel_provider_id uuid DEFAULT NULL::uuid,
  p_other_charges     jsonb DEFAULT '[]'::jsonb,
  p_notes             text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_qe          record;
  v_payment_id  uuid;
  v_status      text;
  v_charge      jsonb;
  v_method      text := p_payment_method;
BEGIN
  IF NOT public.is_staff_or_admin(auth.uid()) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  IF p_queue_entry_id IS NULL THEN
    RAISE EXCEPTION 'QUEUE_ENTRY_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_total_amount IS NULL OR p_total_amount < 0 THEN
    RAISE EXCEPTION 'INVALID_TOTAL' USING ERRCODE = 'P0001';
  END IF;
  -- Hard floor: negative amounts can never reach the ledger.
  IF p_amount_paid IS NULL OR p_amount_paid < 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT' USING ERRCODE = 'P0001';
  END IF;
  -- Strict overpayment — no floating-point slack on numeric.
  IF p_amount_paid > p_total_amount THEN
    RAISE EXCEPTION 'OVERPAYMENT' USING ERRCODE = 'P0001';
  END IF;
  IF p_payment_type NOT IN ('self_pay','panel') THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_TYPE' USING ERRCODE = 'P0001';
  END IF;

  -- Zero-amount coercion: skip payments row entirely + neutralise method constraint.
  IF p_amount_paid = 0 THEN
    v_method := NULL;
  ELSE
    IF v_method IS NULL OR length(trim(v_method)) = 0 THEN
      RAISE EXCEPTION 'PAYMENT_METHOD_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Lock the queue entry
  SELECT id, clinic_status
    INTO v_qe
  FROM public.queue_entries
  WHERE id = p_queue_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'QUEUE_ENTRY_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_qe.clinic_status = 'completed' THEN
    RAISE EXCEPTION 'ALREADY_COMPLETED' USING ERRCODE = 'P0001';
  END IF;

  -- 1. Append "other charges" as consultation_items (existing triggers handle pricing/COGS/inventory)
  IF p_consultation_id IS NOT NULL
     AND p_other_charges IS NOT NULL
     AND jsonb_typeof(p_other_charges) = 'array' THEN
    FOR v_charge IN SELECT * FROM jsonb_array_elements(p_other_charges)
    LOOP
      IF COALESCE(trim(v_charge->>'name'), '') = '' THEN
        CONTINUE;
      END IF;
      INSERT INTO public.consultation_items (consultation_id, item_name, quantity, price)
      VALUES (
        p_consultation_id,
        v_charge->>'name',
        1,
        COALESCE((v_charge->>'amount')::numeric, 0)
      );
    END LOOP;
  END IF;

  -- 2. Record payment row (only when amount > 0)
  IF p_amount_paid > 0 THEN
    INSERT INTO public.payments (
      queue_entry_id, consultation_id,
      payment_type, payment_method, amount, notes
    ) VALUES (
      p_queue_entry_id, p_consultation_id,
      p_payment_type, v_method, p_amount_paid, p_notes
    ) RETURNING id INTO v_payment_id;
  END IF;

  -- 3. Status derived from this round's tender
  v_status := CASE WHEN p_amount_paid >= p_total_amount THEN 'paid' ELSE 'partial' END;

  -- 4. ALWAYS complete consultation + queue (paid OR partial). Decouples financial
  --    settlement from clinical completion so trg_consultations_inventory (FEFO +
  --    owe-slips) and trg_generate_panel_claim always fire exactly once per visit.
  IF p_consultation_id IS NOT NULL THEN
    UPDATE public.consultations
       SET status = 'completed'
     WHERE id = p_consultation_id
       AND status <> 'completed';
  END IF;

  UPDATE public.queue_entries
     SET clinic_status = 'completed'
   WHERE id = p_queue_entry_id;

  RETURN jsonb_build_object(
    'payment_id',  v_payment_id,
    'status',      v_status,
    'balance_due', GREATEST(p_total_amount - p_amount_paid, 0)
  );
END;
$function$;


-- 2) New settle_multiple_debts RPC for atomic multi-debt FIFO settlement.
CREATE OR REPLACE FUNCTION public.settle_multiple_debts(
  p_queue_entry_id   uuid,
  p_consultation_ids uuid[],
  p_amount_paid      numeric,
  p_payment_method   text,
  p_notes            text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_qe                  record;
  v_patient_id          uuid;
  v_method              text := p_payment_method;
  v_total_outstanding   numeric := 0;
  v_remaining           numeric;
  v_apply               numeric;
  v_pid                 uuid;
  v_payment_ids         uuid[] := ARRAY[]::uuid[];
  v_allocations         jsonb  := '[]'::jsonb;
  v_total_collected     numeric := 0;
  r                     record;
  v_outstanding         numeric;
BEGIN
  -- 1. Auth + hard guards (top of function)
  IF NOT public.is_staff_or_admin(auth.uid()) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF p_queue_entry_id IS NULL THEN
    RAISE EXCEPTION 'QUEUE_ENTRY_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_amount_paid IS NULL OR p_amount_paid < 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT' USING ERRCODE = 'P0001';
  END IF;

  -- Zero-amount coercion: don't insert payments, ignore method.
  IF p_amount_paid = 0 THEN
    v_method := NULL;
  ELSE
    IF v_method IS NULL OR length(trim(v_method)) = 0 THEN
      RAISE EXCEPTION 'PAYMENT_METHOD_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- 2. Lock the ticket FIRST. Reject if already closed or not payment_only.
  SELECT id, clinic_status, patient_id, visit_type
    INTO v_qe
  FROM public.queue_entries
  WHERE id = p_queue_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'QUEUE_ENTRY_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_qe.clinic_status = 'completed' THEN
    RAISE EXCEPTION 'ALREADY_COMPLETED' USING ERRCODE = 'P0001';
  END IF;
  IF v_qe.visit_type IS DISTINCT FROM 'payment_only' THEN
    RAISE EXCEPTION 'NOT_PAYMENT_ONLY_TICKET' USING ERRCODE = 'P0001';
  END IF;
  v_patient_id := v_qe.patient_id;

  -- 3. Lock targeted consultations deterministically (created_at ASC, id ASC).
  --    Tiebreaker on id eliminates deadlocks when timestamps collide.
  --    Accumulate per-row outstanding into a temp table for steps 4-6.
  CREATE TEMP TABLE IF NOT EXISTS _settle_rows (
    consultation_id uuid PRIMARY KEY,
    outstanding     numeric NOT NULL,
    sort_ts         timestamptz NOT NULL
  ) ON COMMIT DROP;
  DELETE FROM _settle_rows;

  IF p_consultation_ids IS NOT NULL AND array_length(p_consultation_ids, 1) > 0 THEN
    FOR r IN
      SELECT id, created_at
        FROM public.consultations
       WHERE id = ANY(p_consultation_ids)
         AND patient_id = v_patient_id
         AND deleted_at IS NULL
       ORDER BY created_at ASC, id ASC
       FOR UPDATE
    LOOP
      -- 4. Compute outstanding per locked row — both aggregates COALESCE'd
      --    to defeat NULL-propagation when a visit has zero prior payments.
      v_outstanding :=
          COALESCE((SELECT SUM(price * quantity)
                      FROM public.consultation_items
                     WHERE consultation_id = r.id
                       AND deleted_at IS NULL), 0)
        - COALESCE((SELECT SUM(amount)
                      FROM public.payments
                     WHERE consultation_id = r.id
                       AND deleted_at IS NULL), 0);

      IF v_outstanding > 0 THEN
        INSERT INTO _settle_rows(consultation_id, outstanding, sort_ts)
        VALUES (r.id, v_outstanding, r.created_at);
      END IF;
    END LOOP;
  END IF;

  -- 5. Total outstanding via concrete SELECT … INTO. Empty-array safe: COALESCE → 0.
  SELECT COALESCE(SUM(outstanding), 0)
    INTO v_total_outstanding
  FROM _settle_rows;

  -- Strict overpayment guard — zero numeric slack, empty-array safe.
  IF p_amount_paid > v_total_outstanding THEN
    RAISE EXCEPTION 'OVERPAYMENT' USING ERRCODE = 'P0001';
  END IF;

  -- 6. FIFO allocation in PL/pgSQL (numeric arithmetic).
  IF p_amount_paid > 0 THEN
    v_remaining := p_amount_paid;
    FOR r IN
      SELECT consultation_id, outstanding
        FROM _settle_rows
       ORDER BY sort_ts ASC, consultation_id ASC
    LOOP
      EXIT WHEN v_remaining <= 0;
      v_apply := LEAST(v_remaining, r.outstanding);
      IF v_apply > 0 THEN
        INSERT INTO public.payments (
          queue_entry_id, consultation_id,
          payment_type, payment_method, amount, notes
        ) VALUES (
          p_queue_entry_id, r.consultation_id,
          'self_pay', v_method, v_apply, p_notes
        ) RETURNING id INTO v_pid;

        v_payment_ids     := v_payment_ids || v_pid;
        v_allocations     := v_allocations || jsonb_build_object(
                               'consultation_id', r.consultation_id,
                               'amount',          v_apply,
                               'payment_id',      v_pid
                             );
        v_total_collected := v_total_collected + v_apply;
        v_remaining       := v_remaining - v_apply;
      END IF;
    END LOOP;
  END IF;

  -- 7. Always close the ticket — full / partial / zero alike.
  UPDATE public.queue_entries
     SET clinic_status = 'completed'
   WHERE id = p_queue_entry_id;

  RETURN jsonb_build_object(
    'payment_ids',     to_jsonb(v_payment_ids),
    'allocations',     v_allocations,
    'total_collected', v_total_collected,
    'debt_remaining',  GREATEST(v_total_outstanding - v_total_collected, 0)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.settle_multiple_debts(uuid, uuid[], numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.settle_multiple_debts(uuid, uuid[], numeric, text, text) TO service_role;