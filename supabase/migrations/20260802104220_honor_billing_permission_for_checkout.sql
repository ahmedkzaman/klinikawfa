-- Checkout authorization must honor the effective permission matrix while
-- preserving every legacy staff role that could already complete payment.

CREATE OR REPLACE FUNCTION public.can_checkout_visit(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT _user_id IS NOT NULL
    AND (
      public.is_staff_or_admin(_user_id)
      OR public.has_clinic_permission('billing.manage', _user_id)
    );
$function$;

REVOKE ALL ON FUNCTION public.can_checkout_visit(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_checkout_visit(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.can_checkout_visit(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.can_checkout_visit(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.checkout_visit(
  p_queue_entry_id uuid,
  p_consultation_id uuid,
  p_total_amount numeric,
  p_amount_paid numeric,
  p_payment_method text,
  p_payment_type text DEFAULT 'self_pay'::text,
  p_panel_provider_id uuid DEFAULT NULL::uuid,
  p_other_charges jsonb DEFAULT '[]'::jsonb,
  p_notes text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_qe record;
  v_payment_id uuid;
  v_status text;
  v_charge jsonb;
  v_method text := p_payment_method;
BEGIN
  IF NOT public.can_checkout_visit(auth.uid()) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  IF p_queue_entry_id IS NULL THEN
    RAISE EXCEPTION 'QUEUE_ENTRY_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_total_amount IS NULL OR p_total_amount < 0 THEN
    RAISE EXCEPTION 'INVALID_TOTAL' USING ERRCODE = 'P0001';
  END IF;
  IF p_amount_paid IS NULL OR p_amount_paid < 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT' USING ERRCODE = 'P0001';
  END IF;
  IF p_amount_paid > p_total_amount THEN
    RAISE EXCEPTION 'OVERPAYMENT' USING ERRCODE = 'P0001';
  END IF;
  IF p_payment_type NOT IN ('self_pay', 'panel') THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_TYPE' USING ERRCODE = 'P0001';
  END IF;

  IF p_amount_paid = 0 THEN
    v_method := NULL;
  ELSIF v_method IS NULL OR length(trim(v_method)) = 0 THEN
    RAISE EXCEPTION 'PAYMENT_METHOD_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.lock_completed_bill_item_mutation_boundary();

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

  IF p_consultation_id IS NOT NULL
     AND p_other_charges IS NOT NULL
     AND jsonb_typeof(p_other_charges) = 'array' THEN
    FOR v_charge IN SELECT * FROM jsonb_array_elements(p_other_charges)
    LOOP
      IF coalesce(trim(v_charge->>'name'), '') = '' THEN
        CONTINUE;
      END IF;
      INSERT INTO public.consultation_items (
        consultation_id,
        item_name,
        quantity,
        price
      )
      VALUES (
        p_consultation_id,
        v_charge->>'name',
        1,
        coalesce((v_charge->>'amount')::numeric, 0)
      );
    END LOOP;
  END IF;

  IF p_amount_paid > 0 THEN
    INSERT INTO public.payments (
      queue_entry_id,
      consultation_id,
      payment_type,
      payment_method,
      amount,
      notes
    )
    VALUES (
      p_queue_entry_id,
      p_consultation_id,
      p_payment_type,
      v_method,
      p_amount_paid,
      p_notes
    )
    RETURNING id INTO v_payment_id;
  END IF;

  v_status := CASE
    WHEN p_amount_paid >= p_total_amount THEN 'paid'
    ELSE 'partial'
  END;

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
    'payment_id', v_payment_id,
    'status', v_status,
    'balance_due', greatest(p_total_amount - p_amount_paid, 0)
  );
END;
$function$;

ALTER FUNCTION public.checkout_visit(
  uuid, uuid, numeric, numeric, text, text, uuid, jsonb, text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.checkout_visit(
  uuid, uuid, numeric, numeric, text, text, uuid, jsonb, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.checkout_visit(
  uuid, uuid, numeric, numeric, text, text, uuid, jsonb, text
) FROM anon;
GRANT EXECUTE ON FUNCTION public.checkout_visit(
  uuid, uuid, numeric, numeric, text, text, uuid, jsonb, text
) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_payment_and_complete_visit(
  p_queue_entry_id uuid,
  p_consultation_id uuid,
  p_payment_type text,
  p_payment_method text,
  p_amount numeric,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_queue_status text;
  v_consultation_status text;
  v_payment_id uuid;
  v_amount numeric;
  v_payment_method text;
BEGIN
  IF NOT public.can_checkout_visit(auth.uid()) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF p_queue_entry_id IS NULL THEN
    RAISE EXCEPTION 'QUEUE_ENTRY_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF p_payment_type IS NULL
     OR p_payment_type NOT IN ('self_pay', 'panel') THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_TYPE' USING ERRCODE = '22023';
  END IF;

  v_payment_method := btrim(coalesce(p_payment_method, ''));
  IF p_amount IS NULL
     OR p_amount::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_AMOUNT' USING ERRCODE = '22023';
  END IF;
  v_amount := round(p_amount, 2);
  IF v_amount < 0 OR v_amount > 999999999.99 THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_AMOUNT' USING ERRCODE = '22023';
  END IF;
  IF length(v_payment_method) = 0 THEN
    RAISE EXCEPTION 'PAYMENT_METHOD_REQUIRED' USING ERRCODE = '22023';
  END IF;

  PERFORM public.lock_completed_bill_item_mutation_boundary();

  SELECT qe.clinic_status
    INTO v_queue_status
  FROM public.queue_entries qe
  WHERE qe.id = p_queue_entry_id
    AND qe.deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'QUEUE_ENTRY_NOT_FOUND' USING ERRCODE = '22023';
  END IF;
  IF v_queue_status = 'completed' THEN
    RAISE EXCEPTION 'ALREADY_COMPLETED' USING ERRCODE = '22023';
  END IF;

  IF p_consultation_id IS NOT NULL THEN
    SELECT c.status
      INTO v_consultation_status
    FROM public.consultations c
    WHERE c.id = p_consultation_id
      AND c.queue_entry_id = p_queue_entry_id
      AND c.deleted_at IS NULL
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CONSULTATION_NOT_IN_VISIT' USING ERRCODE = '22023';
    END IF;

    PERFORM 1
    FROM public.consultation_items ci
    WHERE ci.consultation_id = p_consultation_id
      AND ci.deleted_at IS NULL
    ORDER BY ci.id
    FOR UPDATE;
  END IF;

  PERFORM 1
  FROM public.payments p
  WHERE p.queue_entry_id = p_queue_entry_id
    AND p.deleted_at IS NULL
  ORDER BY p.id
  FOR UPDATE;

  INSERT INTO public.payments (
    queue_entry_id,
    consultation_id,
    payment_type,
    payment_method,
    amount,
    notes
  )
  VALUES (
    p_queue_entry_id,
    p_consultation_id,
    p_payment_type,
    v_payment_method,
    v_amount,
    nullif(p_notes, '')
  )
  RETURNING id INTO v_payment_id;

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
    'payment_id', v_payment_id,
    'amount', v_amount,
    'status', 'completed'
  );
END;
$function$;

ALTER FUNCTION public.record_payment_and_complete_visit(
  uuid, uuid, text, text, numeric, text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.record_payment_and_complete_visit(
  uuid, uuid, text, text, numeric, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_payment_and_complete_visit(
  uuid, uuid, text, text, numeric, text
) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_payment_and_complete_visit(
  uuid, uuid, text, text, numeric, text
) TO authenticated;

DO $$
DECLARE
  v_checkout text;
  v_compact_checkout text;
BEGIN
  SELECT pg_get_functiondef(to_regprocedure(
    'public.checkout_visit(uuid,uuid,numeric,numeric,text,text,uuid,jsonb,text)'
  )) INTO v_checkout;
  SELECT pg_get_functiondef(to_regprocedure(
    'public.record_payment_and_complete_visit(uuid,uuid,text,text,numeric,text)'
  )) INTO v_compact_checkout;

  IF to_regprocedure('public.can_checkout_visit(uuid)') IS NULL
     OR v_checkout NOT ILIKE '%can_checkout_visit(auth.uid())%'
     OR v_compact_checkout NOT ILIKE '%can_checkout_visit(auth.uid())%'
     OR has_function_privilege('anon', 'public.can_checkout_visit(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.can_checkout_visit(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'checkout billing authorization postflight failed';
  END IF;
END
$$;
