-- Record one payment row per physical tender while keeping checkout atomic and
-- network retries idempotent. The batch table is intentionally RPC-only: RLS
-- is enabled without general policies and direct privileges are revoked.

CREATE TABLE public.payment_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_entry_id uuid NOT NULL REFERENCES public.queue_entries(id),
  idempotency_key uuid NOT NULL,
  actor_id uuid NOT NULL DEFAULT auth.uid(),
  payment_type text NOT NULL CHECK (payment_type IN ('self_pay', 'panel')),
  expected_patient_amount numeric(12,2) NOT NULL CHECK (expected_patient_amount >= 0),
  completes_visit boolean NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (queue_entry_id, idempotency_key)
);

ALTER TABLE public.payment_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_batches OWNER TO postgres;
REVOKE ALL ON TABLE public.payment_batches FROM PUBLIC;
REVOKE ALL ON TABLE public.payment_batches FROM anon;
REVOKE ALL ON TABLE public.payment_batches FROM authenticated;

CREATE OR REPLACE FUNCTION public.record_split_payments_and_complete_visit(
  p_queue_entry_id uuid,
  p_consultation_id uuid,
  p_payment_type text,
  p_expected_patient_amount numeric,
  p_payments jsonb,
  p_provider_id uuid,
  p_notes text,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_batch public.payment_batches%ROWTYPE;
  v_queue record;
  v_consultation_status text;
  v_expected_patient_amount numeric;
  v_billed_total numeric;
  v_existing_patient_paid numeric;
  v_current_patient_outstanding numeric;
  v_allocation_count integer;
  v_allocation_total numeric;
  v_distinct_method_count integer;
  v_invalid_allocation_count integer;
  v_allocation record;
  v_payment_id uuid;
  v_payment_ids jsonb := '[]'::jsonb;
  v_result jsonb;
  v_zero_method text;
BEGIN
  IF NOT public.can_checkout_visit(auth.uid()) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  IF p_queue_entry_id IS NULL
     OR p_consultation_id IS NULL
     OR p_idempotency_key IS NULL
     OR p_payment_type IS NULL
     OR p_payment_type NOT IN ('self_pay', 'panel')
     OR p_expected_patient_amount IS NULL
     OR p_expected_patient_amount::text IN ('NaN', 'Infinity', '-Infinity')
     OR p_expected_patient_amount < 0
     OR round(p_expected_patient_amount, 2) > 9999999999.99 THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_ALLOCATIONS' USING ERRCODE = '22023';
  END IF;
  v_expected_patient_amount := round(p_expected_patient_amount, 2);

  IF p_payments IS NULL
     OR jsonb_typeof(p_payments) <> 'array'
     OR jsonb_array_length(p_payments) > 4
     OR (jsonb_array_length(p_payments) = 0
         AND round(p_expected_patient_amount, 2) <> 0) THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_ALLOCATIONS' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_payments) AS element(value)
    WHERE jsonb_typeof(element.value) <> 'object'
       OR jsonb_typeof(element.value->'payment_method') IS DISTINCT FROM 'string'
       OR jsonb_typeof(element.value->'amount') IS DISTINCT FROM 'number'
  ) THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_ALLOCATIONS' USING ERRCODE = '22023';
  END IF;

  SELECT
    count(*)::integer,
    coalesce(sum(round(allocation.amount, 2)), 0),
    count(DISTINCT btrim(allocation.payment_method))::integer,
    count(*) FILTER (
      WHERE btrim(allocation.payment_method) NOT IN ('cash', 'qr_pay', 'card', 'transfer')
         OR round(allocation.amount, 2) <= 0
         OR round(allocation.amount, 2) > 9999999999.99
    )::integer
  INTO
    v_allocation_count,
    v_allocation_total,
    v_distinct_method_count,
    v_invalid_allocation_count
  FROM jsonb_to_recordset(p_payments)
    AS allocation(payment_method text, amount numeric, notes text);

  IF v_invalid_allocation_count <> 0
     OR v_distinct_method_count <> v_allocation_count
     OR round(v_allocation_total, 2) <> v_expected_patient_amount THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_ALLOCATIONS' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.payment_batches (
    queue_entry_id,
    idempotency_key,
    actor_id,
    payment_type,
    expected_patient_amount,
    completes_visit
  )
  VALUES (
    p_queue_entry_id,
    p_idempotency_key,
    v_actor_id,
    p_payment_type,
    v_expected_patient_amount,
    true
  )
  ON CONFLICT (queue_entry_id, idempotency_key) DO NOTHING;

  SELECT batch.*
  INTO STRICT v_batch
  FROM public.payment_batches AS batch
  WHERE batch.queue_entry_id = p_queue_entry_id
    AND batch.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF v_batch.actor_id IS DISTINCT FROM v_actor_id
     OR v_batch.payment_type IS DISTINCT FROM p_payment_type
     OR v_batch.expected_patient_amount IS DISTINCT FROM v_expected_patient_amount
     OR v_batch.completes_visit IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_CONFLICT' USING ERRCODE = '23505';
  END IF;
  IF v_batch.result IS NOT NULL THEN
    RETURN v_batch.result;
  END IF;

  PERFORM public.lock_completed_bill_item_mutation_boundary();

  SELECT
    queue_entry.clinic_status,
    queue_entry.payment_method,
    queue_entry.panel_id
  INTO v_queue
  FROM public.queue_entries AS queue_entry
  WHERE queue_entry.id = p_queue_entry_id
    AND queue_entry.deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'QUEUE_ENTRY_NOT_FOUND' USING ERRCODE = '22023';
  END IF;
  IF v_queue.clinic_status = 'completed' THEN
    RAISE EXCEPTION 'ALREADY_COMPLETED' USING ERRCODE = '22023';
  END IF;

  SELECT consultation.status
  INTO v_consultation_status
  FROM public.consultations AS consultation
  WHERE consultation.id = p_consultation_id
    AND consultation.queue_entry_id = p_queue_entry_id
    AND consultation.deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONSULTATION_NOT_IN_VISIT' USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.consultations AS consultation
  WHERE consultation.queue_entry_id = p_queue_entry_id
    AND consultation.deleted_at IS NULL
  ORDER BY consultation.id
  FOR UPDATE;

  PERFORM 1
  FROM public.consultation_items AS item
  JOIN public.consultations AS consultation
    ON consultation.id = item.consultation_id
  WHERE consultation.queue_entry_id = p_queue_entry_id
    AND consultation.deleted_at IS NULL
    AND item.deleted_at IS NULL
  ORDER BY item.id
  FOR UPDATE OF item;

  PERFORM 1
  FROM public.payments AS payment
  WHERE payment.queue_entry_id = p_queue_entry_id
    AND payment.deleted_at IS NULL
  ORDER BY payment.id
  FOR UPDATE;

  SELECT coalesce(sum(round(item.price * item.quantity, 2)), 0)
  INTO v_billed_total
  FROM public.consultations AS consultation
  JOIN public.consultation_items AS item
    ON item.consultation_id = consultation.id
   AND item.deleted_at IS NULL
  WHERE consultation.queue_entry_id = p_queue_entry_id
    AND consultation.deleted_at IS NULL;

  SELECT coalesce(sum(round(payment.amount, 2)), 0)
  INTO v_existing_patient_paid
  FROM public.payments AS payment
  WHERE payment.queue_entry_id = p_queue_entry_id
    AND payment.deleted_at IS NULL
    AND lower(btrim(payment.payment_method)) <> 'panel';

  v_billed_total := greatest(round(v_billed_total, 2), 0);
  v_existing_patient_paid := round(v_existing_patient_paid, 2);
  v_current_patient_outstanding := greatest(
    round(v_billed_total - v_existing_patient_paid, 2),
    0
  );

  IF p_payment_type = 'panel' THEN
    IF v_queue.payment_method IS DISTINCT FROM 'panel'
       OR v_queue.panel_id IS NULL
       OR p_provider_id IS DISTINCT FROM v_queue.panel_id
       OR v_expected_patient_amount > v_current_patient_outstanding THEN
      RAISE EXCEPTION 'PANEL_PROVIDER_MISMATCH' USING ERRCODE = '22023';
    END IF;
  ELSIF v_queue.payment_method = 'panel' OR p_provider_id IS NOT NULL THEN
    RAISE EXCEPTION 'PAYMENT_TYPE_MISMATCH' USING ERRCODE = '22023';
  ELSIF v_expected_patient_amount IS DISTINCT FROM v_current_patient_outstanding THEN
    RAISE EXCEPTION 'STALE_PATIENT_OUTSTANDING' USING ERRCODE = '22023';
  END IF;

  IF v_allocation_count = 0 THEN
    v_zero_method := coalesce(
      nullif(btrim(v_queue.payment_method), ''),
      CASE WHEN p_payment_type = 'panel' THEN 'panel' ELSE 'cash' END
    );
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
      v_zero_method,
      0,
      nullif(btrim(p_notes), '')
    )
    RETURNING id INTO v_payment_id;
    v_payment_ids := v_payment_ids || jsonb_build_array(v_payment_id);
  ELSE
    FOR v_allocation IN
      SELECT
        btrim(allocation.payment_method) AS payment_method,
        round(allocation.amount, 2) AS amount,
        nullif(btrim(allocation.notes), '') AS notes
      FROM jsonb_to_recordset(p_payments)
        AS allocation(payment_method text, amount numeric, notes text)
    LOOP
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
        v_allocation.payment_method,
        v_allocation.amount,
        coalesce(v_allocation.notes, nullif(btrim(p_notes), ''))
      )
      RETURNING id INTO v_payment_id;
      v_payment_ids := v_payment_ids || jsonb_build_array(v_payment_id);
    END LOOP;
  END IF;

  UPDATE public.consultations
  SET status = 'completed'
  WHERE id = p_consultation_id
    AND status <> 'completed';

  UPDATE public.queue_entries
  SET clinic_status = 'completed'
  WHERE id = p_queue_entry_id;

  v_result := jsonb_build_object(
    'batch_id', v_batch.id,
    'payment_ids', v_payment_ids,
    'payment_count', jsonb_array_length(v_payment_ids),
    'amount', v_expected_patient_amount,
    'balance_due', 0,
    'queue_status', 'completed',
    'consultation_status', 'completed'
  );

  UPDATE public.payment_batches
  SET result = v_result
  WHERE id = v_batch.id;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_split_payments(
  p_queue_entry_id uuid,
  p_consultation_id uuid,
  p_payment_type text,
  p_payments jsonb,
  p_notes text,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_batch public.payment_batches%ROWTYPE;
  v_queue record;
  v_consultation_status text;
  v_billed_total numeric;
  v_existing_patient_paid numeric;
  v_current_patient_outstanding numeric;
  v_allocation_count integer;
  v_allocation_total numeric;
  v_distinct_method_count integer;
  v_invalid_allocation_count integer;
  v_allocation record;
  v_payment_id uuid;
  v_payment_ids jsonb := '[]'::jsonb;
  v_result jsonb;
BEGIN
  IF NOT public.can_checkout_visit(auth.uid()) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  IF p_queue_entry_id IS NULL
     OR p_consultation_id IS NULL
     OR p_idempotency_key IS NULL
     OR p_payment_type IS NULL
     OR p_payment_type NOT IN ('self_pay', 'panel') THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_ALLOCATIONS' USING ERRCODE = '22023';
  END IF;

  IF p_payments IS NULL
     OR jsonb_typeof(p_payments) <> 'array'
     OR jsonb_array_length(p_payments) = 0
     OR jsonb_array_length(p_payments) > 4 THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_ALLOCATIONS' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_payments) AS element(value)
    WHERE jsonb_typeof(element.value) <> 'object'
       OR jsonb_typeof(element.value->'payment_method') IS DISTINCT FROM 'string'
       OR jsonb_typeof(element.value->'amount') IS DISTINCT FROM 'number'
  ) THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_ALLOCATIONS' USING ERRCODE = '22023';
  END IF;

  SELECT
    count(*)::integer,
    coalesce(sum(round(allocation.amount, 2)), 0),
    count(DISTINCT btrim(allocation.payment_method))::integer,
    count(*) FILTER (
      WHERE btrim(allocation.payment_method) NOT IN ('cash', 'qr_pay', 'card', 'transfer')
         OR round(allocation.amount, 2) <= 0
         OR round(allocation.amount, 2) > 9999999999.99
    )::integer
  INTO
    v_allocation_count,
    v_allocation_total,
    v_distinct_method_count,
    v_invalid_allocation_count
  FROM jsonb_to_recordset(p_payments)
    AS allocation(payment_method text, amount numeric, notes text);

  IF v_invalid_allocation_count <> 0
     OR v_distinct_method_count <> v_allocation_count THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_ALLOCATIONS' USING ERRCODE = '22023';
  END IF;
  v_allocation_total := round(v_allocation_total, 2);

  INSERT INTO public.payment_batches (
    queue_entry_id,
    idempotency_key,
    actor_id,
    payment_type,
    expected_patient_amount,
    completes_visit
  )
  VALUES (
    p_queue_entry_id,
    p_idempotency_key,
    v_actor_id,
    p_payment_type,
    v_allocation_total,
    false
  )
  ON CONFLICT (queue_entry_id, idempotency_key) DO NOTHING;

  SELECT batch.*
  INTO STRICT v_batch
  FROM public.payment_batches AS batch
  WHERE batch.queue_entry_id = p_queue_entry_id
    AND batch.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF v_batch.actor_id IS DISTINCT FROM v_actor_id
     OR v_batch.payment_type IS DISTINCT FROM p_payment_type
     OR v_batch.expected_patient_amount IS DISTINCT FROM v_allocation_total
     OR v_batch.completes_visit IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_CONFLICT' USING ERRCODE = '23505';
  END IF;
  IF v_batch.result IS NOT NULL THEN
    RETURN v_batch.result;
  END IF;

  PERFORM public.lock_completed_bill_item_mutation_boundary();

  SELECT
    queue_entry.clinic_status,
    queue_entry.payment_method,
    queue_entry.panel_id
  INTO v_queue
  FROM public.queue_entries AS queue_entry
  WHERE queue_entry.id = p_queue_entry_id
    AND queue_entry.deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'QUEUE_ENTRY_NOT_FOUND' USING ERRCODE = '22023';
  END IF;
  IF v_queue.clinic_status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'VISIT_NOT_COMPLETED' USING ERRCODE = '22023';
  END IF;

  SELECT consultation.status
  INTO v_consultation_status
  FROM public.consultations AS consultation
  WHERE consultation.id = p_consultation_id
    AND consultation.queue_entry_id = p_queue_entry_id
    AND consultation.deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONSULTATION_NOT_IN_VISIT' USING ERRCODE = '22023';
  END IF;
  IF v_consultation_status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'CONSULTATION_NOT_COMPLETED' USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.consultations AS consultation
  WHERE consultation.queue_entry_id = p_queue_entry_id
    AND consultation.deleted_at IS NULL
  ORDER BY consultation.id
  FOR UPDATE;

  PERFORM 1
  FROM public.consultation_items AS item
  JOIN public.consultations AS consultation
    ON consultation.id = item.consultation_id
  WHERE consultation.queue_entry_id = p_queue_entry_id
    AND consultation.deleted_at IS NULL
    AND item.deleted_at IS NULL
  ORDER BY item.id
  FOR UPDATE OF item;

  PERFORM 1
  FROM public.payments AS payment
  WHERE payment.queue_entry_id = p_queue_entry_id
    AND payment.deleted_at IS NULL
  ORDER BY payment.id
  FOR UPDATE;

  SELECT coalesce(sum(round(item.price * item.quantity, 2)), 0)
  INTO v_billed_total
  FROM public.consultations AS consultation
  JOIN public.consultation_items AS item
    ON item.consultation_id = consultation.id
   AND item.deleted_at IS NULL
  WHERE consultation.queue_entry_id = p_queue_entry_id
    AND consultation.deleted_at IS NULL;

  SELECT coalesce(sum(round(payment.amount, 2)), 0)
  INTO v_existing_patient_paid
  FROM public.payments AS payment
  WHERE payment.queue_entry_id = p_queue_entry_id
    AND payment.deleted_at IS NULL
    AND lower(btrim(payment.payment_method)) <> 'panel';

  v_billed_total := greatest(round(v_billed_total, 2), 0);
  v_existing_patient_paid := round(v_existing_patient_paid, 2);
  v_current_patient_outstanding := greatest(
    round(v_billed_total - v_existing_patient_paid, 2),
    0
  );

  IF p_payment_type = 'panel' THEN
    IF v_queue.payment_method IS DISTINCT FROM 'panel'
       OR v_queue.panel_id IS NULL THEN
      RAISE EXCEPTION 'PAYMENT_TYPE_MISMATCH' USING ERRCODE = '22023';
    END IF;
  ELSIF v_queue.payment_method = 'panel' THEN
    RAISE EXCEPTION 'PAYMENT_TYPE_MISMATCH' USING ERRCODE = '22023';
  END IF;

  IF v_allocation_total > v_current_patient_outstanding THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_ALLOCATIONS' USING ERRCODE = '22023';
  END IF;

  FOR v_allocation IN
    SELECT
      btrim(allocation.payment_method) AS payment_method,
      round(allocation.amount, 2) AS amount,
      nullif(btrim(allocation.notes), '') AS notes
    FROM jsonb_to_recordset(p_payments)
      AS allocation(payment_method text, amount numeric, notes text)
  LOOP
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
      v_allocation.payment_method,
      v_allocation.amount,
      coalesce(v_allocation.notes, nullif(btrim(p_notes), ''))
    )
    RETURNING id INTO v_payment_id;
    v_payment_ids := v_payment_ids || jsonb_build_array(v_payment_id);
  END LOOP;

  IF p_payment_type = 'panel' THEN
    PERFORM public.ensure_panel_claim_for_queue(p_queue_entry_id);
  END IF;

  v_result := jsonb_build_object(
    'batch_id', v_batch.id,
    'payment_ids', v_payment_ids,
    'payment_count', jsonb_array_length(v_payment_ids),
    'amount', v_allocation_total,
    'balance_due', greatest(
      round(v_current_patient_outstanding - v_allocation_total, 2),
      0
    ),
    'queue_status', v_queue.clinic_status,
    'consultation_status', v_consultation_status
  );

  UPDATE public.payment_batches
  SET result = v_result
  WHERE id = v_batch.id;

  RETURN v_result;
END;
$function$;

ALTER FUNCTION public.record_split_payments_and_complete_visit(
  uuid,uuid,text,numeric,jsonb,uuid,text,uuid
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.record_split_payments_and_complete_visit(
  uuid,uuid,text,numeric,jsonb,uuid,text,uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_split_payments_and_complete_visit(
  uuid,uuid,text,numeric,jsonb,uuid,text,uuid
) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_split_payments_and_complete_visit(
  uuid,uuid,text,numeric,jsonb,uuid,text,uuid
) TO authenticated;

ALTER FUNCTION public.record_split_payments(
  uuid,uuid,text,jsonb,text,uuid
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.record_split_payments(
  uuid,uuid,text,jsonb,text,uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_split_payments(
  uuid,uuid,text,jsonb,text,uuid
) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_split_payments(
  uuid,uuid,text,jsonb,text,uuid
) TO authenticated;
