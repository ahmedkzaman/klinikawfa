-- Record one payment row per physical tender while keeping checkout atomic and
-- network retries idempotent. The batch table is intentionally RPC-only: RLS
-- is enabled without general policies and direct privileges are revoked.

-- Keep panel receivables on the authoritative saved billed quantity used by
-- invoices, corrections, receipts, and financial reporting.
CREATE OR REPLACE FUNCTION public.ensure_panel_claim_for_queue(
  p_queue_entry_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_panel_id uuid;
  v_patient_id uuid;
  v_total_amount numeric(10,2);
  v_patient_paid numeric(10,2);
  v_panel_amount numeric(10,2);
  v_claim_id uuid;
  v_claim_no text;
  v_seq integer;
BEGIN
  SELECT queue.panel_id, queue.patient_id
  INTO v_panel_id, v_patient_id
  FROM public.queue_entries AS queue
  WHERE queue.id = p_queue_entry_id
    AND queue.payment_method = 'panel'
    AND queue.panel_id IS NOT NULL;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT coalesce(sum(
    item.price * item.quantity
  ), 0)::numeric(10,2)
  INTO v_total_amount
  FROM public.consultations AS consultation
  LEFT JOIN public.consultation_items AS item
    ON item.consultation_id = consultation.id
   AND item.deleted_at IS NULL
  WHERE consultation.queue_entry_id = p_queue_entry_id
    AND consultation.deleted_at IS NULL;

  SELECT coalesce(sum(payment.amount), 0)::numeric(10,2)
  INTO v_patient_paid
  FROM public.payments AS payment
  WHERE payment.queue_entry_id = p_queue_entry_id
    AND payment.deleted_at IS NULL
    AND lower(btrim(payment.payment_method)) <> 'panel';

  v_panel_amount := greatest(v_total_amount - v_patient_paid, 0)::numeric(10,2);

  SELECT claim.id
  INTO v_claim_id
  FROM public.panel_claims AS claim
  WHERE claim.queue_entry_id = p_queue_entry_id
  FOR UPDATE;

  IF v_claim_id IS NOT NULL THEN
    INSERT INTO private.panel_claim_split_correction_context (
      transaction_id, panel_claim_id, actor_id, reason
    ) VALUES (
      pg_catalog.txid_current(), v_claim_id, coalesce(auth.uid(), v_patient_id),
      'Patient payment reconciliation'
    ) ON CONFLICT (transaction_id, panel_claim_id) DO UPDATE
      SET actor_id = EXCLUDED.actor_id, reason = EXCLUDED.reason,
          created_at = pg_catalog.now();
    IF v_panel_amount = 0 AND NOT EXISTS (
      SELECT 1 FROM public.panel_claim_portion_receipts receipt WHERE receipt.panel_claim_id=v_claim_id
    ) THEN
      DELETE FROM public.panel_claim_portions portion WHERE portion.panel_claim_id=v_claim_id;
    END IF;
    UPDATE public.panel_claims AS claim
    SET amount = v_panel_amount
    WHERE claim.id = v_claim_id
      AND claim.status = 'pending'
      AND claim.amount IS DISTINCT FROM v_panel_amount;
    RETURN v_claim_id;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('panel-claim-' || CURRENT_DATE::text));

  SELECT count(*) + 1
  INTO v_seq
  FROM public.panel_claims
  WHERE claim_date = CURRENT_DATE;

  v_claim_no :=
    'PC-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || lpad(v_seq::text, 4, '0');

  INSERT INTO public.panel_claims (
    panel_id, patient_id, queue_entry_id, claim_no, amount, status, claim_date
  ) VALUES (
    v_panel_id, v_patient_id, p_queue_entry_id, v_claim_no,
    v_panel_amount, 'pending', CURRENT_DATE
  )
  ON CONFLICT (queue_entry_id) DO UPDATE
    SET amount = v_panel_amount
    WHERE panel_claims.status = 'pending'
  RETURNING id INTO v_claim_id;

  IF v_claim_id IS NULL THEN
    SELECT claim.id
    INTO v_claim_id
    FROM public.panel_claims AS claim
    WHERE claim.queue_entry_id = p_queue_entry_id;
  END IF;

  RETURN v_claim_id;
END
$function$;

ALTER FUNCTION public.ensure_panel_claim_for_queue(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.ensure_panel_claim_for_queue(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_panel_claim_for_queue(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.ensure_panel_claim_for_queue(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_panel_claim_for_queue(uuid) TO service_role;

CREATE TABLE public.payment_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_entry_id uuid NOT NULL REFERENCES public.queue_entries(id),
  idempotency_key uuid NOT NULL,
  actor_id uuid NOT NULL DEFAULT auth.uid(),
  payment_type text NOT NULL CHECK (payment_type IN ('self_pay', 'panel')),
  expected_patient_amount numeric(12,2) NOT NULL CHECK (expected_patient_amount >= 0),
  completes_visit boolean NOT NULL,
  request_fingerprint text NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (queue_entry_id, idempotency_key)
);

ALTER TABLE public.payment_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_batches OWNER TO postgres;
REVOKE ALL ON TABLE public.payment_batches FROM PUBLIC;
REVOKE ALL ON TABLE public.payment_batches FROM anon;
REVOKE ALL ON TABLE public.payment_batches FROM authenticated;

ALTER TABLE public.payments ADD COLUMN batch_id uuid
  REFERENCES public.payment_batches(id) ON DELETE RESTRICT;
CREATE INDEX payments_batch_id_idx ON public.payments(batch_id) WHERE deleted_at IS NULL;

-- Universal mixed-version validation: no capability or client-settable flag is
-- involved. Cached clients retain INSERT during the bounded compatibility
-- window, but every row is serialized at the queue and bounded by the bill.
CREATE OR REPLACE FUNCTION private.validate_payment_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $function$
DECLARE v_status text; v_visit_type text; v_billed numeric; v_paid numeric; v_method text;
  v_queue_patient uuid; v_consultation_queue uuid; v_consultation_patient uuid; v_batch public.payment_batches%ROWTYPE;
BEGIN
  v_method := lower(btrim(coalesce(NEW.payment_method, '')));
  SELECT qe.clinic_status::text, qe.visit_type::text, qe.patient_id INTO v_status, v_visit_type, v_queue_patient
  FROM public.queue_entries qe WHERE qe.id = NEW.queue_entry_id AND qe.deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR (v_status NOT IN ('dispensing_payment', 'completed')
    AND NOT (v_visit_type = 'payment_only' AND v_status = 'sent_to_dispensary')) THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_STATUS' USING ERRCODE = '22023';
  END IF;
  IF NEW.amount IS NULL OR NEW.amount::text IN ('NaN','Infinity','-Infinity') OR NEW.amount < 0
     OR round(NEW.amount, 2) IS DISTINCT FROM NEW.amount THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_AMOUNT' USING ERRCODE = '22023';
  END IF;
  IF NEW.payment_type NOT IN ('self_pay','panel') OR
     (v_method = 'panel' AND (NEW.payment_type <> 'panel' OR NEW.amount <> 0)) OR
     (v_method <> 'panel' AND v_method NOT IN ('cash','qr_pay','card','transfer')) THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_METHOD' USING ERRCODE = '22023';
  END IF;
  IF NEW.consultation_id IS NOT NULL THEN
    SELECT c.queue_entry_id, c.patient_id INTO v_consultation_queue, v_consultation_patient
    FROM public.consultations c WHERE c.id=NEW.consultation_id AND c.deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND OR (v_visit_type <> 'payment_only' AND v_consultation_queue <> NEW.queue_entry_id)
       OR (v_visit_type = 'payment_only' AND v_consultation_patient <> v_queue_patient) THEN
      RAISE EXCEPTION 'PAYMENT_CONSULTATION_MISMATCH' USING ERRCODE='23503';
    END IF;
  END IF;
  IF NEW.batch_id IS NOT NULL THEN
    SELECT batch.* INTO v_batch FROM public.payment_batches batch WHERE batch.id=NEW.batch_id FOR UPDATE;
    IF NOT FOUND OR v_batch.queue_entry_id <> NEW.queue_entry_id OR v_batch.payment_type <> NEW.payment_type
       OR v_batch.actor_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'PAYMENT_BATCH_MISMATCH' USING ERRCODE='23503';
    END IF;
  END IF;
  IF NEW.payment_type='panel' AND EXISTS (
    SELECT 1 FROM public.panel_claims claim WHERE claim.queue_entry_id=NEW.queue_entry_id AND (
      claim.status::text <> 'pending' OR claim.submitted_date IS NOT NULL OR claim.approved_amount IS NOT NULL
      OR coalesce(claim.received_amount,0) <> 0 OR claim.payment_reference IS NOT NULL OR claim.received_date IS NOT NULL
      OR EXISTS (SELECT 1 FROM public.panel_claim_portions portion WHERE portion.panel_claim_id=claim.id)
      OR EXISTS (SELECT 1 FROM public.panel_claim_portion_receipts receipt WHERE receipt.panel_claim_id=claim.id)
    )
  ) THEN RAISE EXCEPTION 'PANEL_CLAIM_ALREADY_MATERIALIZED' USING ERRCODE='23514'; END IF;
  SELECT coalesce(sum(round(ci.price * ci.quantity, 2)),0) INTO v_billed
  FROM public.consultation_items ci WHERE ci.consultation_id=NEW.consultation_id AND ci.deleted_at IS NULL;
  SELECT coalesce(sum(round(p.amount,2)),0) INTO v_paid FROM public.payments p
  WHERE p.consultation_id=NEW.consultation_id AND p.deleted_at IS NULL
    AND lower(btrim(p.payment_method)) <> 'panel';
  IF v_method <> 'panel' AND NEW.amount > greatest(round(v_billed-v_paid,2),0) THEN
    RAISE EXCEPTION 'STALE_PATIENT_OUTSTANDING: expected %', greatest(round(v_billed-v_paid,2),0)
      USING ERRCODE='22023';
  END IF;
  RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION private.validate_payment_insert() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER validate_payment_insert BEFORE INSERT ON public.payments
FOR EACH ROW EXECUTE FUNCTION private.validate_payment_insert();

CREATE OR REPLACE FUNCTION private.reconcile_cached_panel_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog, public AS $function$
BEGIN
  IF NEW.batch_id IS NULL AND NEW.payment_type='panel' AND lower(btrim(NEW.payment_method)) <> 'panel' THEN
    PERFORM public.ensure_panel_claim_for_queue(NEW.queue_entry_id);
  END IF;
  RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION private.reconcile_cached_panel_payment() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER reconcile_cached_panel_payment AFTER INSERT ON public.payments
FOR EACH ROW EXECUTE FUNCTION private.reconcile_cached_panel_payment();

-- Direct INSERT remains available during the migration-first compatibility
-- window for already-cached clients. New clients use the keyed RPC below.
-- Revoke direct writes only in a later migration after the cache window.

CREATE TABLE public.payment_void_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id),
  queue_entry_id uuid NOT NULL REFERENCES public.queue_entries(id),
  actor_id uuid NOT NULL,
  amount numeric(12,2) NOT NULL,
  payment_method text NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payment_void_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.payment_void_audit FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.prevent_payment_void_audit_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $function$
BEGIN
  RAISE EXCEPTION 'PAYMENT_VOID_AUDIT_IMMUTABLE' USING ERRCODE = '42501';
END $function$;
REVOKE ALL ON FUNCTION private.prevent_payment_void_audit_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER prevent_payment_void_audit_change
BEFORE UPDATE OR DELETE ON public.payment_void_audit
FOR EACH ROW EXECUTE FUNCTION private.prevent_payment_void_audit_change();

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
  v_canonical_payments jsonb;
  v_request_fingerprint text;
  v_allocation record;
  v_payment_id uuid;
  v_payment_ids jsonb := '[]'::jsonb;
  v_result jsonb;
  v_zero_method text;
  v_panel_claim_status text;
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
     OR v_allocation_total > 9999999999.99
     OR round(v_allocation_total, 2) <> v_expected_patient_amount THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_ALLOCATIONS' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'payment_method', btrim(allocation.payment_method),
        'amount', round(allocation.amount, 2),
        'notes', nullif(btrim(allocation.notes), '')
      )
      ORDER BY btrim(allocation.payment_method)
    ),
    '[]'::jsonb
  )
  INTO v_canonical_payments
  FROM jsonb_to_recordset(p_payments)
    AS allocation(payment_method text, amount numeric, notes text);

  v_request_fingerprint := md5(jsonb_build_object(
    'queue_entry_id', p_queue_entry_id,
    'consultation_id', p_consultation_id,
    'payment_type', p_payment_type,
    'expected_patient_amount', v_expected_patient_amount,
    'payments', v_canonical_payments,
    'provider_id', p_provider_id,
    'notes', nullif(btrim(p_notes), ''),
    'completes_visit', true
  )::text);

  PERFORM public.lock_completed_bill_item_mutation_boundary();

  INSERT INTO public.payment_batches (
    queue_entry_id,
    idempotency_key,
    actor_id,
    payment_type,
    expected_patient_amount,
    completes_visit,
    request_fingerprint
  )
  VALUES (
    p_queue_entry_id,
    p_idempotency_key,
    v_actor_id,
    p_payment_type,
    v_expected_patient_amount,
    true,
    v_request_fingerprint
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
     OR v_batch.completes_visit IS DISTINCT FROM true
     OR v_batch.request_fingerprint IS DISTINCT FROM v_request_fingerprint THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_CONFLICT' USING ERRCODE = '23505';
  END IF;
  IF v_batch.result IS NOT NULL THEN
    RETURN v_batch.result;
  END IF;

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
  IF v_queue.clinic_status::text IS DISTINCT FROM 'dispensing_payment' THEN
    RAISE EXCEPTION 'INVALID_CHECKOUT_STATUS' USING ERRCODE = '22023';
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

  SELECT coalesce(sum(round(
    item.price * item.quantity,
    2
  )), 0)
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
    PERFORM public.ensure_panel_claim_for_queue(p_queue_entry_id);
    SELECT claim.status::text INTO v_panel_claim_status
    FROM public.panel_claims AS claim
    WHERE claim.queue_entry_id = p_queue_entry_id
    FOR UPDATE;
    IF NOT FOUND OR v_panel_claim_status IS DISTINCT FROM 'pending'
       OR EXISTS (SELECT 1 FROM public.panel_claims claim
          WHERE claim.queue_entry_id = p_queue_entry_id
            AND (claim.submitted_date IS NOT NULL OR claim.approved_amount IS NOT NULL
              OR coalesce(claim.received_amount, 0) <> 0 OR claim.payment_reference IS NOT NULL
              OR claim.received_date IS NOT NULL))
       OR EXISTS (SELECT 1 FROM public.panel_claim_portions portion
          JOIN public.panel_claims claim ON claim.id = portion.panel_claim_id
          WHERE claim.queue_entry_id = p_queue_entry_id) THEN
      RAISE EXCEPTION 'PANEL_CLAIM_ALREADY_MATERIALIZED' USING ERRCODE = '23514';
    END IF;
  ELSIF v_queue.payment_method = 'panel' OR p_provider_id IS NOT NULL THEN
    RAISE EXCEPTION 'PAYMENT_TYPE_MISMATCH' USING ERRCODE = '22023';
  ELSIF v_expected_patient_amount IS DISTINCT FROM v_current_patient_outstanding THEN
    RAISE EXCEPTION 'STALE_PATIENT_OUTSTANDING: expected %',
      v_current_patient_outstanding USING ERRCODE = '22023';
  END IF;

  IF v_allocation_count = 0 THEN
    v_zero_method := coalesce(
      nullif(btrim(v_queue.payment_method), ''),
      CASE WHEN p_payment_type = 'panel' THEN 'panel' ELSE 'cash' END
    );
    INSERT INTO public.payments (
      batch_id,
      queue_entry_id,
      consultation_id,
      payment_type,
      payment_method,
      amount,
      notes
    )
    VALUES (
      v_batch.id,
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
        batch_id,
        queue_entry_id,
        consultation_id,
        payment_type,
        payment_method,
        amount,
        notes
      )
      VALUES (
        v_batch.id,
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
  v_canonical_payments jsonb;
  v_request_fingerprint text;
  v_panel_claim_status text;
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
     OR v_distinct_method_count <> v_allocation_count
     OR v_allocation_total > 9999999999.99 THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_ALLOCATIONS' USING ERRCODE = '22023';
  END IF;
  v_allocation_total := round(v_allocation_total, 2);

  SELECT jsonb_agg(
    jsonb_build_object(
      'payment_method', btrim(allocation.payment_method),
      'amount', round(allocation.amount, 2),
      'notes', nullif(btrim(allocation.notes), '')
    )
    ORDER BY btrim(allocation.payment_method)
  )
  INTO v_canonical_payments
  FROM jsonb_to_recordset(p_payments)
    AS allocation(payment_method text, amount numeric, notes text);

  v_request_fingerprint := md5(jsonb_build_object(
    'queue_entry_id', p_queue_entry_id,
    'consultation_id', p_consultation_id,
    'payment_type', p_payment_type,
    'payments', v_canonical_payments,
    'provider_id', NULL,
    'notes', nullif(btrim(p_notes), ''),
    'completes_visit', false
  )::text);

  PERFORM public.lock_completed_bill_item_mutation_boundary();

  INSERT INTO public.payment_batches (
    queue_entry_id,
    idempotency_key,
    actor_id,
    payment_type,
    expected_patient_amount,
    completes_visit,
    request_fingerprint
  )
  VALUES (
    p_queue_entry_id,
    p_idempotency_key,
    v_actor_id,
    p_payment_type,
    v_allocation_total,
    false,
    v_request_fingerprint
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
     OR v_batch.completes_visit IS DISTINCT FROM false
     OR v_batch.request_fingerprint IS DISTINCT FROM v_request_fingerprint THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_CONFLICT' USING ERRCODE = '23505';
  END IF;
  IF v_batch.result IS NOT NULL THEN
    RETURN v_batch.result;
  END IF;

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

  SELECT coalesce(sum(round(
    item.price * item.quantity,
    2
  )), 0)
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

    SELECT claim.status::text
    INTO v_panel_claim_status
    FROM public.panel_claims AS claim
    WHERE claim.queue_entry_id = p_queue_entry_id
    FOR UPDATE;
    IF FOUND AND v_panel_claim_status IS DISTINCT FROM 'pending' THEN
      RAISE EXCEPTION 'PANEL_CLAIM_NOT_PENDING' USING ERRCODE = '23514';
    END IF;
  ELSIF v_queue.payment_method = 'panel' THEN
    RAISE EXCEPTION 'PAYMENT_TYPE_MISMATCH' USING ERRCODE = '22023';
  END IF;

  IF v_allocation_total > v_current_patient_outstanding THEN
    RAISE EXCEPTION 'STALE_PATIENT_OUTSTANDING: expected %', v_current_patient_outstanding
      USING ERRCODE = '22023';
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
      batch_id,
      queue_entry_id,
      consultation_id,
      payment_type,
      payment_method,
      amount,
      notes
    )
    VALUES (
      v_batch.id,
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

CREATE OR REPLACE FUNCTION public.void_payment_portion(
  p_payment_id uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_payment public.payments%ROWTYPE;
  v_claim_status text;
  v_billed numeric;
  v_paid numeric;
BEGIN
  IF NOT public.can_correct_completed_bill(v_actor) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'VOID_REASON_REQUIRED' USING ERRCODE = '22023';
  END IF;
  PERFORM public.lock_completed_bill_item_mutation_boundary();
  SELECT payment.* INTO v_payment FROM public.payments payment
  WHERE payment.id = p_payment_id AND payment.deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYMENT_NOT_FOUND' USING ERRCODE = '22023';
  END IF;
  IF lower(btrim(v_payment.payment_method)) = 'panel' THEN
    RAISE EXCEPTION 'PANEL_PAYMENT_VOID_FORBIDDEN' USING ERRCODE = '23514';
  END IF;
  SELECT claim.status::text INTO v_claim_status
  FROM public.panel_claims claim WHERE claim.queue_entry_id = v_payment.queue_entry_id
  FOR UPDATE;
  IF FOUND AND EXISTS (
    SELECT 1 FROM public.panel_claims claim WHERE claim.queue_entry_id=v_payment.queue_entry_id AND (
      claim.status::text <> 'pending' OR claim.submitted_date IS NOT NULL OR claim.approved_amount IS NOT NULL
      OR coalesce(claim.received_amount,0) <> 0 OR claim.payment_reference IS NOT NULL OR claim.received_date IS NOT NULL
      OR EXISTS (SELECT 1 FROM public.panel_claim_portions portion WHERE portion.panel_claim_id=claim.id)
      OR EXISTS (SELECT 1 FROM public.panel_claim_portion_receipts receipt WHERE receipt.panel_claim_id=claim.id)
    )
  ) THEN
    RAISE EXCEPTION 'PANEL_CLAIM_ALREADY_MATERIALIZED' USING ERRCODE = '23514';
  END IF;
  UPDATE public.payments SET deleted_at = now() WHERE id = p_payment_id;
  INSERT INTO public.payment_void_audit (
    payment_id, queue_entry_id, actor_id, amount, payment_method, reason
  ) VALUES (
    v_payment.id, v_payment.queue_entry_id, v_actor, v_payment.amount,
    v_payment.payment_method, btrim(p_reason)
  );
  IF v_claim_status = 'pending' THEN
    PERFORM public.ensure_panel_claim_for_queue(v_payment.queue_entry_id);
  END IF;
  SELECT coalesce(sum(round(item.price * item.quantity, 2)), 0)
  INTO v_billed FROM public.consultations consultation
  JOIN public.consultation_items item ON item.consultation_id = consultation.id
    AND item.deleted_at IS NULL
  WHERE consultation.queue_entry_id = v_payment.queue_entry_id
    AND consultation.deleted_at IS NULL;
  SELECT coalesce(sum(round(payment.amount, 2)), 0) INTO v_paid
  FROM public.payments payment WHERE payment.queue_entry_id = v_payment.queue_entry_id
    AND payment.deleted_at IS NULL
    AND lower(btrim(payment.payment_method)) <> 'panel';
  RETURN jsonb_build_object(
    'payment_id', v_payment.id,
    'queue_entry_id', v_payment.queue_entry_id,
    'patient_outstanding', greatest(round(v_billed - v_paid, 2), 0)
  );
END $function$;

ALTER FUNCTION public.void_payment_portion(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.void_payment_portion(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_payment_portion(uuid, text) TO authenticated;

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


-- Retain the legacy dispensary checkout API while aligning its financial basis.
CREATE OR REPLACE FUNCTION public.checkout_visit(
  p_queue_entry_id uuid,
  p_consultation_id uuid,
  p_total_amount numeric,
  p_amount_paid numeric,
  p_payment_method text,
  p_payment_type text DEFAULT 'self_pay'::text,
  p_panel_provider_id uuid DEFAULT NULL::uuid,
  p_other_charges jsonb DEFAULT '[]'::jsonb,
  p_notes text DEFAULT NULL::text,
  p_panel_covered_amount numeric DEFAULT NULL::numeric,
  p_panel_portions jsonb DEFAULT NULL::jsonb,
  p_checkout_idempotency_key uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_qe record;
  v_consultation_status text;
  v_payment_id uuid;
  v_status text;
  v_charge jsonb;
  v_charge_amount numeric;
  v_method text := p_payment_method;
  v_authoritative_balance numeric(12,2);
  v_item_total numeric(12,2);
  v_existing_paid numeric(12,2);
  v_panel_covered_amount numeric(12,2) := 0;
  v_patient_liability numeric(12,2);
  v_claim_id uuid;
  v_claim public.panel_claims%ROWTYPE;
  v_portions jsonb := '[]'::jsonb;
  v_result jsonb;
  v_request_fingerprint text;
  v_existing_request public.panel_claim_checkout_requests%ROWTYPE;
BEGIN
  IF NOT public.can_checkout_visit(v_actor_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF p_queue_entry_id IS NULL THEN
    RAISE EXCEPTION 'QUEUE_ENTRY_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF p_total_amount IS NULL
     OR p_total_amount::text IN ('NaN', 'Infinity', '-Infinity')
     OR p_total_amount < 0
     OR p_total_amount <> pg_catalog.round(p_total_amount, 2) THEN
    RAISE EXCEPTION 'INVALID_TOTAL' USING ERRCODE = '22023';
  END IF;
  IF p_amount_paid IS NULL
     OR p_amount_paid::text IN ('NaN', 'Infinity', '-Infinity')
     OR p_amount_paid < 0
     OR p_amount_paid <> pg_catalog.round(p_amount_paid, 2) THEN
    RAISE EXCEPTION 'INVALID_AMOUNT' USING ERRCODE = '22023';
  END IF;
  IF p_payment_type NOT IN ('self_pay', 'panel') THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_TYPE' USING ERRCODE = '22023';
  END IF;
  IF p_other_charges IS NULL OR pg_catalog.jsonb_typeof(p_other_charges) <> 'array' THEN
    RAISE EXCEPTION 'OTHER_CHARGES_MUST_BE_ARRAY' USING ERRCODE = '22023';
  END IF;
  IF p_panel_portions IS NOT NULL
     AND pg_catalog.jsonb_typeof(p_panel_portions) <> 'array' THEN
    RAISE EXCEPTION 'PORTIONS_MUST_BE_ARRAY' USING ERRCODE = '22023';
  END IF;
  IF p_panel_portions IS NOT NULL
     AND p_checkout_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF p_panel_portions IS NOT NULL
     AND NOT public.can_manage_panel_claim_portions(v_actor_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  v_request_fingerprint := pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'queue_entry_id', p_queue_entry_id,
      'consultation_id', p_consultation_id,
      'total_amount', pg_catalog.round(p_total_amount, 2),
      'amount_paid', pg_catalog.round(p_amount_paid, 2),
      'payment_method', nullif(pg_catalog.btrim(p_payment_method), ''),
      'payment_type', p_payment_type,
      'panel_provider_id', p_panel_provider_id,
      'other_charges', p_other_charges,
      'notes', p_notes,
      'panel_covered_amount', p_panel_covered_amount,
      'panel_portions', p_panel_portions
    )::text
  );

  IF p_checkout_idempotency_key IS NOT NULL THEN
    SELECT request.*
      INTO v_existing_request
    FROM public.panel_claim_checkout_requests AS request
    WHERE request.idempotency_key = p_checkout_idempotency_key;

    IF FOUND THEN
      IF v_existing_request.queue_entry_id <> p_queue_entry_id
         OR v_existing_request.request_fingerprint <> v_request_fingerprint THEN
        RAISE EXCEPTION 'IDEMPOTENCY_KEY_CONFLICT' USING ERRCODE = '23505';
      END IF;
      IF v_existing_request.result IS NOT NULL THEN
        RETURN v_existing_request.result;
      END IF;
    END IF;
  END IF;

  PERFORM public.lock_completed_bill_item_mutation_boundary();

  SELECT
    queue_entry.clinic_status,
    queue_entry.payment_method,
    queue_entry.panel_id,
    queue_entry.patient_id
  INTO v_qe
  FROM public.queue_entries AS queue_entry
  WHERE queue_entry.id = p_queue_entry_id
    AND queue_entry.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'QUEUE_ENTRY_NOT_FOUND' USING ERRCODE = '22023';
  END IF;

  -- A concurrent retry waits on the queue lock. Re-read its durable result
  -- before treating the now-completed visit as a second checkout.
  IF p_checkout_idempotency_key IS NOT NULL THEN
    SELECT request.*
      INTO v_existing_request
    FROM public.panel_claim_checkout_requests AS request
    WHERE request.idempotency_key = p_checkout_idempotency_key;
    IF FOUND AND v_existing_request.result IS NOT NULL THEN
      IF v_existing_request.queue_entry_id <> p_queue_entry_id
         OR v_existing_request.request_fingerprint <> v_request_fingerprint THEN
        RAISE EXCEPTION 'IDEMPOTENCY_KEY_CONFLICT' USING ERRCODE = '23505';
      END IF;
      RETURN v_existing_request.result;
    END IF;
  END IF;

  IF v_qe.clinic_status::text IS DISTINCT FROM 'dispensing_payment' THEN
    RAISE EXCEPTION 'INVALID_CHECKOUT_STATUS' USING ERRCODE = '22023';
  END IF;
  IF p_consultation_id IS NULL THEN
    RAISE EXCEPTION 'CONSULTATION_REQUIRED' USING ERRCODE = '22023';
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
  FROM public.consultation_items AS item
  WHERE item.consultation_id = p_consultation_id
    AND item.deleted_at IS NULL
  ORDER BY item.id
  FOR UPDATE;

  PERFORM 1
  FROM public.payments AS payment
  WHERE payment.queue_entry_id = p_queue_entry_id
    AND payment.deleted_at IS NULL
  ORDER BY payment.id
  FOR UPDATE;

  IF p_payment_type = 'panel' THEN
    IF v_qe.payment_method <> 'panel'
       OR v_qe.panel_id IS NULL
       OR p_panel_provider_id IS DISTINCT FROM v_qe.panel_id THEN
      RAISE EXCEPTION 'PANEL_PROVIDER_MISMATCH' USING ERRCODE = '23514';
    END IF;
    IF p_panel_covered_amount IS NULL
       OR p_panel_covered_amount::text IN ('NaN', 'Infinity', '-Infinity')
       OR p_panel_covered_amount < 0
       OR p_panel_covered_amount <> pg_catalog.round(p_panel_covered_amount, 2) THEN
      RAISE EXCEPTION 'INVALID_PANEL_COVERED_AMOUNT' USING ERRCODE = '22023';
    END IF;
    v_panel_covered_amount := pg_catalog.round(p_panel_covered_amount, 2);
  ELSIF coalesce(p_panel_covered_amount, 0) <> 0
        OR p_panel_portions IS NOT NULL
        OR p_panel_provider_id IS NOT NULL THEN
    RAISE EXCEPTION 'PANEL_DATA_REQUIRES_PANEL_CHECKOUT' USING ERRCODE = '23514';
  END IF;

  IF p_checkout_idempotency_key IS NOT NULL THEN
    INSERT INTO public.panel_claim_checkout_requests (
      idempotency_key,
      queue_entry_id,
      request_fingerprint,
      created_by
    )
    VALUES (
      p_checkout_idempotency_key,
      p_queue_entry_id,
      v_request_fingerprint,
      v_actor_id
    );
  END IF;

  FOR v_charge IN
    SELECT value
    FROM pg_catalog.jsonb_array_elements(p_other_charges)
  LOOP
    IF coalesce(pg_catalog.btrim(v_charge->>'name'), '') = '' THEN
      CONTINUE;
    END IF;

    BEGIN
      v_charge_amount := (v_charge->>'amount')::numeric;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'INVALID_OTHER_CHARGE_AMOUNT' USING ERRCODE = '22023';
    END;

    IF v_charge_amount IS NULL
       OR v_charge_amount::text IN ('NaN', 'Infinity', '-Infinity')
       OR v_charge_amount < 0
       OR v_charge_amount <> pg_catalog.round(v_charge_amount, 2) THEN
      RAISE EXCEPTION 'INVALID_OTHER_CHARGE_AMOUNT' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.consultation_items (
      consultation_id,
      item_name,
      quantity,
      price
    )
    VALUES (
      p_consultation_id,
      pg_catalog.btrim(v_charge->>'name'),
      1,
      v_charge_amount
    );
  END LOOP;

  SELECT coalesce(
    pg_catalog.sum(
      item.price * item.quantity
    ),
      0
    )::numeric(12,2)
    INTO v_item_total
  FROM public.consultations AS consultation
  JOIN public.consultation_items AS item
    ON item.consultation_id = consultation.id
   AND item.deleted_at IS NULL
  WHERE consultation.queue_entry_id = p_queue_entry_id
    AND consultation.deleted_at IS NULL;

  SELECT coalesce(pg_catalog.sum(payment.amount), 0)::numeric(12,2)
    INTO v_existing_paid
  FROM public.payments AS payment
  WHERE payment.queue_entry_id = p_queue_entry_id
    AND payment.deleted_at IS NULL;

  v_authoritative_balance := greatest(v_item_total - v_existing_paid, 0);
  IF pg_catalog.round(p_total_amount, 2) <> v_authoritative_balance THEN
    RAISE EXCEPTION 'CHECKOUT_TOTAL_MISMATCH' USING ERRCODE = '40001';
  END IF;
  IF v_panel_covered_amount > v_authoritative_balance THEN
    RAISE EXCEPTION 'PANEL_COVERAGE_EXCEEDS_BALANCE' USING ERRCODE = '23514';
  END IF;

  v_patient_liability := v_authoritative_balance - v_panel_covered_amount;
  IF p_amount_paid > v_patient_liability THEN
    RAISE EXCEPTION 'OVERPAYMENT' USING ERRCODE = '23514';
  END IF;

  IF p_amount_paid = 0 THEN
    v_method := NULL;
  ELSIF v_method IS NULL OR pg_catalog.btrim(v_method) = '' THEN
    RAISE EXCEPTION 'PAYMENT_METHOD_REQUIRED' USING ERRCODE = '22023';
  ELSE
    v_method := pg_catalog.btrim(v_method);
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
      nullif(p_notes, '')
    )
    RETURNING id INTO v_payment_id;
  END IF;

  v_status := CASE
    WHEN p_amount_paid = v_patient_liability THEN 'paid'
    ELSE 'partial'
  END;

  UPDATE public.consultations AS consultation
  SET status = 'completed'
  WHERE consultation.id = p_consultation_id
    AND consultation.status <> 'completed';

  UPDATE public.queue_entries AS queue_entry
  SET clinic_status = 'completed'
  WHERE queue_entry.id = p_queue_entry_id;

  IF p_payment_type = 'panel' THEN
    v_claim_id := public.ensure_panel_claim_for_queue(p_queue_entry_id);
    IF v_claim_id IS NULL THEN
      RAISE EXCEPTION 'PANEL_CLAIM_NOT_FOUND' USING ERRCODE = '23514';
    END IF;

    SELECT claim.*
      INTO v_claim
    FROM public.panel_claims AS claim
    WHERE claim.id = v_claim_id
      AND claim.queue_entry_id = p_queue_entry_id
      AND claim.panel_id = v_qe.panel_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PANEL_CLAIM_NOT_FOUND' USING ERRCODE = '23514';
    END IF;
    IF v_claim.status <> 'pending'
       OR v_claim.submitted_date IS NOT NULL
       OR v_claim.approved_amount IS NOT NULL
       OR coalesce(v_claim.received_amount, 0) <> 0
       OR v_claim.payment_reference IS NOT NULL
       OR v_claim.received_date IS NOT NULL THEN
      RAISE EXCEPTION 'PANEL_CLAIM_ALREADY_MATERIALIZED' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
         SELECT 1
         FROM public.panel_claim_portions AS portion
         WHERE portion.panel_claim_id = v_claim_id
       )
       OR EXISTS (
         SELECT 1
         FROM public.panel_claim_portion_receipts AS receipt
         WHERE receipt.panel_claim_id = v_claim_id
       ) THEN
      RAISE EXCEPTION 'PANEL_CLAIM_SPLIT_LOCKED' USING ERRCODE = '23514';
    END IF;

    UPDATE public.panel_claims AS claim
    SET amount = v_panel_covered_amount,
        received_amount = 0,
        payment_reference = NULL,
        received_date = NULL,
        updated_by = v_actor_id,
        updated_at = pg_catalog.now()
    WHERE claim.id = v_claim_id;

    SELECT claim.*
      INTO v_claim
    FROM public.panel_claims AS claim
    WHERE claim.id = v_claim_id;

    IF p_panel_portions IS NOT NULL THEN
      SELECT coalesce(
        pg_catalog.jsonb_agg(pg_catalog.to_jsonb(portion) ORDER BY portion.portion_no),
        '[]'::jsonb
      )
        INTO v_portions
      FROM public.replace_panel_claim_portions(
        v_claim_id,
        p_panel_portions,
        'Created during dispensary checkout',
        v_claim.portions_version
      ) AS portion;

      SELECT claim.*
        INTO v_claim
      FROM public.panel_claims AS claim
      WHERE claim.id = v_claim_id;
    END IF;
  END IF;

  v_result := pg_catalog.jsonb_build_object(
    'payment_id', v_payment_id,
    'status', v_status,
    'balance_due', greatest(v_patient_liability - p_amount_paid, 0),
    'panel_claim_id', v_claim_id,
    'panel_claim', CASE
      WHEN v_claim_id IS NULL THEN NULL
      ELSE pg_catalog.to_jsonb(v_claim)
    END,
    'portions', v_portions
  );

  IF p_checkout_idempotency_key IS NOT NULL THEN
    UPDATE public.panel_claim_checkout_requests AS request
    SET result = v_result,
        completed_at = pg_catalog.now()
    WHERE request.idempotency_key = p_checkout_idempotency_key;
  END IF;

  RETURN v_result;
END;
$function$;

ALTER FUNCTION public.checkout_visit(
  uuid, uuid, numeric, numeric, text, text, uuid, jsonb, text, numeric, jsonb, uuid
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.checkout_visit(
  uuid, uuid, numeric, numeric, text, text, uuid, jsonb, text, numeric, jsonb, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.checkout_visit(
  uuid, uuid, numeric, numeric, text, text, uuid, jsonb, text, numeric, jsonb, uuid
) TO authenticated;


-- Preserve and harden the deployed single-payment RPC for cached clients.
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
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_queue_status text;
  v_consultation_status text;
  v_payment_id uuid;
  v_amount numeric;
  v_payment_method text;
  v_billed_total numeric;
  v_existing_paid numeric;
  v_claim record;
  v_provider_name text;
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
     OR p_amount::text IN ('NaN', 'Infinity', '-Infinity')
     OR round(p_amount, 2) IS DISTINCT FROM p_amount THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_AMOUNT' USING ERRCODE = '22023';
  END IF;
  v_amount := round(p_amount, 2);
  IF v_amount < 0 OR v_amount > 999999999.99 THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_AMOUNT' USING ERRCODE = '22023';
  END IF;
  v_payment_method := lower(v_payment_method);
  IF v_payment_method LIKE 'panel:%' THEN
    v_provider_name := btrim(substr(v_payment_method, length('panel:') + 1));
    v_payment_method := 'panel';
  END IF;
  IF v_payment_method NOT IN ('cash', 'qr_pay', 'card', 'transfer', 'panel') THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_METHOD' USING ERRCODE = '22023';
  END IF;
  IF v_payment_method = 'panel' AND (p_payment_type <> 'panel' OR v_amount <> 0) THEN
    RAISE EXCEPTION 'INVALID_PANEL_PAYMENT' USING ERRCODE = '22023';
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
  IF v_queue_status <> 'dispensing_payment' THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_STATUS' USING ERRCODE = '22023';
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

  SELECT coalesce(sum(round(ci.price * ci.quantity, 2)), 0)
    INTO v_billed_total
  FROM public.consultations c
  JOIN public.consultation_items ci ON ci.consultation_id = c.id AND ci.deleted_at IS NULL
  WHERE c.queue_entry_id = p_queue_entry_id AND c.deleted_at IS NULL;
  SELECT coalesce(sum(round(p.amount, 2)), 0)
    INTO v_existing_paid
  FROM public.payments p
  WHERE p.queue_entry_id = p_queue_entry_id AND p.deleted_at IS NULL
    AND lower(btrim(p.payment_method)) <> 'panel';
  IF p_payment_type = 'self_pay'
     AND v_amount IS DISTINCT FROM greatest(round(v_billed_total - v_existing_paid, 2), 0) THEN
    RAISE EXCEPTION 'STALE_PATIENT_OUTSTANDING: expected %',
      greatest(round(v_billed_total - v_existing_paid, 2), 0) USING ERRCODE = '22023';
  END IF;
  IF p_payment_type = 'panel' AND v_payment_method <> 'panel'
     AND (v_amount <= 0 OR v_amount > greatest(round(v_billed_total-v_existing_paid,2),0)) THEN
    RAISE EXCEPTION 'STALE_PATIENT_OUTSTANDING: expected %', greatest(round(v_billed_total-v_existing_paid,2),0)
      USING ERRCODE='22023';
  END IF;
  IF p_payment_type = 'panel' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.queue_entries qe
      WHERE qe.id = p_queue_entry_id AND qe.payment_method = 'panel' AND qe.panel_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'INVALID_PANEL_PAYMENT' USING ERRCODE = '22023';
    END IF;
    IF v_provider_name IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.queue_entries qe JOIN public.insurance_providers provider ON provider.id=qe.panel_id
      WHERE qe.id=p_queue_entry_id AND lower(btrim(provider.name))=v_provider_name
    ) THEN
      RAISE EXCEPTION 'INVALID_PANEL_PROVIDER' USING ERRCODE='22023';
    END IF;
    SELECT claim.* INTO v_claim FROM public.panel_claims claim
    WHERE claim.queue_entry_id=p_queue_entry_id FOR UPDATE;
    IF NOT FOUND THEN
      PERFORM public.ensure_panel_claim_for_queue(p_queue_entry_id);
      SELECT claim.* INTO STRICT v_claim FROM public.panel_claims claim
      WHERE claim.queue_entry_id=p_queue_entry_id FOR UPDATE;
    END IF;
    IF v_claim.status::text <> 'pending' OR v_claim.submitted_date IS NOT NULL
       OR v_claim.approved_amount IS NOT NULL OR coalesce(v_claim.received_amount,0) <> 0
       OR v_claim.payment_reference IS NOT NULL OR v_claim.received_date IS NOT NULL
       OR EXISTS (SELECT 1 FROM public.panel_claim_portions portion WHERE portion.panel_claim_id=v_claim.id)
       OR EXISTS (SELECT 1 FROM public.panel_claim_portion_receipts receipt WHERE receipt.panel_claim_id=v_claim.id) THEN
      RAISE EXCEPTION 'PANEL_CLAIM_ALREADY_MATERIALIZED' USING ERRCODE='23514';
    END IF;
  END IF;

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

  IF p_payment_type='panel' AND v_payment_method <> 'panel' THEN
    PERFORM public.ensure_panel_claim_for_queue(p_queue_entry_id);
  END IF;

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

-- Keep the payment-only workflow while putting its historical writer behind a
-- canonical, bounded, fixed-search-path facade. The legacy core retains its
-- deterministic consultation/queue locks and saved-quantity FIFO allocation.
ALTER FUNCTION public.settle_multiple_debts(uuid, uuid[], numeric, text, text)
  RENAME TO settle_multiple_debts_legacy_core;
ALTER FUNCTION public.settle_multiple_debts_legacy_core(uuid, uuid[], numeric, text, text)
  SET search_path = pg_catalog, public;
REVOKE ALL ON FUNCTION public.settle_multiple_debts_legacy_core(uuid, uuid[], numeric, text, text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.settle_multiple_debts(
  p_queue_entry_id uuid, p_consultation_ids uuid[], p_amount_paid numeric,
  p_payment_method text, p_notes text, p_idempotency_key uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog, public AS $function$
DECLARE v_qe record; v_method text:=lower(btrim(coalesce(p_payment_method,''))); v_total numeric:=0;
  v_remaining numeric; v_apply numeric; v_row record; v_payment_id uuid; v_ids jsonb:='[]';
  v_batch public.payment_batches%ROWTYPE; v_result jsonb; v_fingerprint text;
BEGIN
  IF NOT public.can_checkout_visit(auth.uid()) THEN RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
  IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE='22023'; END IF;
  IF p_amount_paid IS NULL OR p_amount_paid::text IN ('NaN','Infinity','-Infinity') OR p_amount_paid<0
     OR round(p_amount_paid,2) IS DISTINCT FROM p_amount_paid THEN RAISE EXCEPTION 'INVALID_AMOUNT' USING ERRCODE='22023'; END IF;
  IF p_amount_paid>0 AND v_method NOT IN ('cash','qr_pay','card','transfer') THEN RAISE EXCEPTION 'INVALID_PAYMENT_METHOD' USING ERRCODE='22023'; END IF;
  SELECT qe.* INTO v_qe FROM public.queue_entries qe WHERE qe.id=p_queue_entry_id AND qe.deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR v_qe.visit_type::text<>'payment_only' OR v_qe.clinic_status::text<>'sent_to_dispensary' THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_ONLY_STATUS' USING ERRCODE='22023'; END IF;
  CREATE TEMP TABLE IF NOT EXISTS _debt_rows(consultation_id uuid primary key, outstanding numeric, sort_ts timestamptz) ON COMMIT DROP;
  DELETE FROM _debt_rows;
  FOR v_row IN SELECT c.id,c.created_at FROM public.consultations c
    WHERE c.id=ANY(coalesce(p_consultation_ids,ARRAY[]::uuid[])) AND c.patient_id=v_qe.patient_id AND c.deleted_at IS NULL
    ORDER BY c.created_at,c.id FOR UPDATE
  LOOP
    PERFORM 1 FROM public.queue_entries q JOIN public.consultations c ON c.queue_entry_id=q.id
      WHERE c.id=v_row.id ORDER BY q.id FOR UPDATE OF q;
    PERFORM 1 FROM public.payments p WHERE p.consultation_id=v_row.id AND p.deleted_at IS NULL ORDER BY p.id FOR UPDATE;
    INSERT INTO _debt_rows VALUES(v_row.id, greatest(
      coalesce((SELECT sum(round(ci.price*ci.quantity,2)) FROM public.consultation_items ci WHERE ci.consultation_id=v_row.id AND ci.deleted_at IS NULL),0)
      -coalesce((SELECT sum(round(p.amount,2)) FROM public.payments p WHERE p.consultation_id=v_row.id AND p.deleted_at IS NULL AND lower(btrim(p.payment_method))<>'panel'),0),0),v_row.created_at);
  END LOOP;
  SELECT coalesce(sum(outstanding),0) INTO v_total FROM _debt_rows;
  IF p_amount_paid>v_total THEN RAISE EXCEPTION 'STALE_PATIENT_OUTSTANDING: expected %',v_total USING ERRCODE='22023'; END IF;
  v_fingerprint:=encode(digest(jsonb_build_object('q',p_queue_entry_id,'c',p_consultation_ids,'a',p_amount_paid,'m',v_method,'n',p_notes)::text,'sha256'),'hex');
  INSERT INTO public.payment_batches(queue_entry_id,idempotency_key,actor_id,payment_type,expected_patient_amount,completes_visit,request_fingerprint)
    VALUES(p_queue_entry_id,p_idempotency_key,auth.uid(),'self_pay',p_amount_paid,true,v_fingerprint)
    ON CONFLICT(queue_entry_id,idempotency_key) DO NOTHING;
  SELECT * INTO v_batch FROM public.payment_batches b WHERE b.queue_entry_id=p_queue_entry_id AND b.idempotency_key=p_idempotency_key FOR UPDATE;
  IF v_batch.request_fingerprint<>v_fingerprint THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED' USING ERRCODE='22023'; END IF;
  IF v_batch.result IS NOT NULL THEN RETURN v_batch.result; END IF;
  v_remaining:=p_amount_paid;
  FOR v_row IN SELECT * FROM _debt_rows ORDER BY sort_ts,consultation_id LOOP
    EXIT WHEN v_remaining<=0; v_apply:=least(v_remaining,v_row.outstanding);
    IF v_apply>0 THEN INSERT INTO public.payments(batch_id,queue_entry_id,consultation_id,payment_type,payment_method,amount,notes)
      VALUES(v_batch.id,p_queue_entry_id,v_row.consultation_id,'self_pay',v_method,v_apply,p_notes) RETURNING id INTO v_payment_id;
      v_ids:=v_ids||jsonb_build_array(v_payment_id); v_remaining:=v_remaining-v_apply; END IF;
  END LOOP;
  UPDATE public.queue_entries SET clinic_status='completed' WHERE id=p_queue_entry_id;
  v_result:=jsonb_build_object('batch_id',v_batch.id,'payment_ids',v_ids,'total_collected',p_amount_paid,'debt_remaining',greatest(v_total-p_amount_paid,0));
  UPDATE public.payment_batches SET result=v_result WHERE id=v_batch.id; RETURN v_result;
END $function$;

CREATE FUNCTION public.settle_multiple_debts(
  p_queue_entry_id uuid, p_consultation_ids uuid[], p_amount_paid numeric,
  p_payment_method text, p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE v_method text := lower(btrim(coalesce(p_payment_method, ''))); v_qe record;
BEGIN
  RETURN public.settle_multiple_debts(p_queue_entry_id,p_consultation_ids,p_amount_paid,p_payment_method,p_notes,gen_random_uuid());
END;
$function$;
ALTER FUNCTION public.settle_multiple_debts(uuid, uuid[], numeric, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.settle_multiple_debts(uuid, uuid[], numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_multiple_debts(uuid, uuid[], numeric, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.settle_multiple_debts(uuid,uuid[],numeric,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.settle_multiple_debts(uuid,uuid[],numeric,text,text,uuid) TO authenticated;
