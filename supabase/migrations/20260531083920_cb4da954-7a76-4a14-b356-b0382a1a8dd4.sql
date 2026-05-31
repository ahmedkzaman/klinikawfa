
CREATE OR REPLACE FUNCTION public.checkout_visit(
  p_queue_entry_id    uuid,
  p_consultation_id   uuid,
  p_total_amount      numeric,
  p_amount_paid       numeric,
  p_payment_method    text,
  p_payment_type      text DEFAULT 'self_pay',
  p_panel_provider_id uuid DEFAULT NULL,
  p_other_charges     jsonb DEFAULT '[]'::jsonb,
  p_notes             text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_qe           record;
  v_payment_id   uuid;
  v_status       text;
  v_charge       jsonb;
  v_final_notes  text;
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
  IF p_amount_paid IS NULL OR p_amount_paid < 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT_PAID' USING ERRCODE = 'P0001';
  END IF;
  IF p_amount_paid > p_total_amount + 0.01 THEN
    RAISE EXCEPTION 'OVERPAYMENT' USING ERRCODE = 'P0001';
  END IF;
  IF p_amount_paid > 0 AND (p_payment_method IS NULL OR length(trim(p_payment_method)) = 0) THEN
    RAISE EXCEPTION 'PAYMENT_METHOD_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_payment_type NOT IN ('self_pay','panel') THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_TYPE' USING ERRCODE = 'P0001';
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

  -- 1. Append "other charges" as consultation_items (triggers handle pricing/COGS/inventory reservation)
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

  -- 2. Record payment row (only if any amount was tendered this round)
  IF p_amount_paid > 0 THEN
    v_final_notes := p_notes;
    INSERT INTO public.payments (
      queue_entry_id, consultation_id,
      payment_type, payment_method, amount, notes
    ) VALUES (
      p_queue_entry_id, p_consultation_id,
      p_payment_type, p_payment_method, p_amount_paid, v_final_notes
    ) RETURNING id INTO v_payment_id;
  END IF;

  -- 3. Determine status from cumulative payments
  IF p_amount_paid >= p_total_amount THEN
    v_status := 'paid';
  ELSE
    v_status := 'partial';
  END IF;

  -- 4. If fully paid, complete consultation + queue (triggers FEFO, panel claim, owe-slip)
  IF v_status = 'paid' THEN
    IF p_consultation_id IS NOT NULL THEN
      UPDATE public.consultations
         SET status = 'completed'
       WHERE id = p_consultation_id
         AND status <> 'completed';
    END IF;

    UPDATE public.queue_entries
       SET clinic_status = 'completed'
     WHERE id = p_queue_entry_id;
  END IF;

  RETURN jsonb_build_object(
    'payment_id',  v_payment_id,
    'status',      v_status,
    'balance_due', GREATEST(p_total_amount - p_amount_paid, 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.checkout_visit(
  uuid, uuid, numeric, numeric, text, text, uuid, jsonb, text
) TO authenticated;
