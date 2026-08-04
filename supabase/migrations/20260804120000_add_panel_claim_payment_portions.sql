-- Add independently payable portions beneath the existing one-claim-per-visit
-- parent. Parent claim amounts remain the sole billed-revenue source.

CREATE TABLE public.panel_claim_portions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  panel_claim_id uuid NOT NULL,
  portion_no integer NOT NULL,
  amount numeric(12,2) NOT NULL,
  received_amount numeric(12,2) NOT NULL DEFAULT 0,
  status text GENERATED ALWAYS AS (
    CASE
      WHEN received_amount = 0 THEN 'unpaid'
      WHEN received_amount = amount THEN 'paid'
      ELSE 'partially_paid'
    END
  ) STORED,
  payment_reference text,
  received_date date,
  remark text,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT panel_claim_portions_panel_claim_fkey
    FOREIGN KEY (panel_claim_id) REFERENCES public.panel_claims(id) ON DELETE RESTRICT,
  CONSTRAINT panel_claim_portions_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE RESTRICT,
  CONSTRAINT panel_claim_portions_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE RESTRICT,
  CONSTRAINT panel_claim_portions_portion_no_positive CHECK (portion_no > 0),
  CONSTRAINT panel_claim_portions_amount_positive CHECK (amount > 0),
  CONSTRAINT panel_claim_portions_received_amount_range
    CHECK (received_amount >= 0 AND received_amount <= amount),
  CONSTRAINT panel_claim_portions_claim_portion_unique
    UNIQUE (panel_claim_id, portion_no),
  CONSTRAINT panel_claim_portions_id_claim_unique
    UNIQUE (id, panel_claim_id)
);

CREATE TABLE public.panel_claim_portion_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  panel_claim_portion_id uuid NOT NULL,
  panel_claim_id uuid NOT NULL,
  amount numeric(12,2) NOT NULL,
  received_date date NOT NULL,
  payment_reference text NOT NULL,
  remark text,
  idempotency_key uuid NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT panel_claim_portion_receipts_portion_claim_fkey
    FOREIGN KEY (panel_claim_portion_id, panel_claim_id)
    REFERENCES public.panel_claim_portions(id, panel_claim_id) ON DELETE RESTRICT,
  CONSTRAINT panel_claim_portion_receipts_claim_fkey
    FOREIGN KEY (panel_claim_id)
    REFERENCES public.panel_claims(id) ON DELETE RESTRICT,
  CONSTRAINT panel_claim_portion_receipts_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE RESTRICT,
  CONSTRAINT panel_claim_portion_receipts_amount_positive CHECK (amount > 0),
  CONSTRAINT panel_claim_portion_receipts_idempotency_key_unique
    UNIQUE (idempotency_key)
);

CREATE TABLE public.panel_claim_portion_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  panel_claim_id uuid NOT NULL,
  action text NOT NULL,
  actor_id uuid NOT NULL,
  old_values jsonb,
  new_values jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT panel_claim_portion_audit_claim_fkey
    FOREIGN KEY (panel_claim_id) REFERENCES public.panel_claims(id) ON DELETE RESTRICT,
  CONSTRAINT panel_claim_portion_audit_actor_fkey
    FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE RESTRICT,
  CONSTRAINT panel_claim_portion_audit_action_present CHECK (btrim(action) <> '')
);

-- The privileged RPCs are owned by postgres. Keep the tables under the
-- same owner so revoking service_role access cannot remove RPC write rights.
ALTER TABLE public.panel_claim_portions OWNER TO postgres;
ALTER TABLE public.panel_claim_portion_receipts OWNER TO postgres;
ALTER TABLE public.panel_claim_portion_audit OWNER TO postgres;

CREATE INDEX panel_claim_portion_receipts_portion_idx
  ON public.panel_claim_portion_receipts (panel_claim_portion_id, created_at);
CREATE INDEX panel_claim_portion_receipts_claim_date_idx
  ON public.panel_claim_portion_receipts (panel_claim_id, received_date);
CREATE INDEX panel_claim_portion_audit_claim_created_idx
  ON public.panel_claim_portion_audit (panel_claim_id, created_at);

ALTER TABLE public.panel_claim_portions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.panel_claim_portion_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.panel_claim_portion_audit ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.panel_claim_portions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.panel_claim_portion_receipts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.panel_claim_portion_audit FORCE ROW LEVEL SECURITY;

CREATE POLICY panel_claim_portions_existing_claim_readers
  ON public.panel_claim_portions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.panel_claims AS claim
      WHERE claim.id = panel_claim_id
    )
  );

REVOKE ALL ON TABLE public.panel_claim_portions FROM PUBLIC;
REVOKE ALL ON TABLE public.panel_claim_portions FROM anon;
REVOKE ALL ON TABLE public.panel_claim_portions FROM authenticated;
REVOKE ALL ON TABLE public.panel_claim_portions FROM service_role;
GRANT SELECT ON TABLE public.panel_claim_portions TO authenticated;
GRANT SELECT ON TABLE public.panel_claim_portions TO service_role;

REVOKE ALL ON TABLE public.panel_claim_portion_receipts FROM PUBLIC;
REVOKE ALL ON TABLE public.panel_claim_portion_receipts FROM anon;
REVOKE ALL ON TABLE public.panel_claim_portion_receipts FROM authenticated;
REVOKE ALL ON TABLE public.panel_claim_portion_receipts FROM service_role;

REVOKE ALL ON TABLE public.panel_claim_portion_audit FROM PUBLIC;
REVOKE ALL ON TABLE public.panel_claim_portion_audit FROM anon;
REVOKE ALL ON TABLE public.panel_claim_portion_audit FROM authenticated;
REVOKE ALL ON TABLE public.panel_claim_portion_audit FROM service_role;

CREATE FUNCTION public.can_manage_panel_claim_portions(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT _user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_roles AS user_role
      WHERE user_role.user_id = _user_id
        -- Repository role migrations define ops_staff as the current
        -- operation-staff role and operations as its accepted legacy alias.
        AND user_role.role::text IN (
          'admin',
          'doctor_admin',
          'ops_staff',
          'operations',
          'purchaser'
        )
    );
$function$;

ALTER FUNCTION public.can_manage_panel_claim_portions(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.can_manage_panel_claim_portions(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_panel_claim_portions(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.can_manage_panel_claim_portions(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_panel_claim_portions(uuid) TO service_role;

CREATE FUNCTION public.reject_panel_claim_portion_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  RAISE EXCEPTION 'PANEL_CLAIM_PORTION_LEDGER_APPEND_ONLY'
    USING ERRCODE = '42501';
END;
$function$;

ALTER FUNCTION public.reject_panel_claim_portion_ledger_mutation() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reject_panel_claim_portion_ledger_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_panel_claim_portion_ledger_mutation() FROM anon;
REVOKE ALL ON FUNCTION public.reject_panel_claim_portion_ledger_mutation() FROM authenticated;

CREATE TRIGGER panel_claim_portion_receipts_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON public.panel_claim_portion_receipts
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.reject_panel_claim_portion_ledger_mutation();

CREATE TRIGGER panel_claim_portion_audit_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON public.panel_claim_portion_audit
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.reject_panel_claim_portion_ledger_mutation();

CREATE FUNCTION public.replace_panel_claim_portions(
  p_panel_claim_id uuid,
  p_portions jsonb,
  p_reason text
)
RETURNS SETOF public.panel_claim_portions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_claim public.panel_claims%ROWTYPE;
  v_claim_amount numeric(12,2);
  v_claim_cents bigint;
  v_portion_count integer;
  v_portion_total numeric;
  v_portion_cents bigint;
  v_invalid_amount boolean;
  v_old_values jsonb;
  v_new_values jsonb;
BEGIN
  IF NOT public.can_manage_panel_claim_portions(v_actor_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  IF p_panel_claim_id IS NULL THEN
    RAISE EXCEPTION 'PANEL_CLAIM_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  SELECT claim.*
    INTO v_claim
  FROM public.panel_claims AS claim
  WHERE claim.id = p_panel_claim_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PANEL_CLAIM_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF p_portions IS NULL OR jsonb_typeof(p_portions) <> 'array' THEN
    RAISE EXCEPTION 'PORTIONS_MUST_BE_ARRAY' USING ERRCODE = 'P0001';
  END IF;

  v_claim_amount := v_claim.amount::numeric(12,2);
  v_claim_cents := (v_claim_amount * 100)::bigint;

  IF v_claim_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_CLAIM_AMOUNT' USING ERRCODE = 'P0001';
  END IF;

  SELECT
    count(*)::integer,
    sum(candidate.amount),
    sum((candidate.amount * 100)::bigint),
    coalesce(
      bool_or(
        candidate.amount IS NULL
        OR candidate.amount <= 0
        OR candidate.amount <> trunc(candidate.amount, 2)
      ),
      false
    )
  INTO
    v_portion_count,
    v_portion_total,
    v_portion_cents,
    v_invalid_amount
  FROM jsonb_to_recordset(p_portions)
    AS candidate(amount numeric, remark text);

  IF v_portion_count < 2 THEN
    RAISE EXCEPTION 'AT_LEAST_TWO_PORTIONS_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  IF v_invalid_amount THEN
    RAISE EXCEPTION 'INVALID_PORTION_AMOUNT' USING ERRCODE = 'P0001';
  END IF;

  IF (
    SELECT sum(candidate.amount)
    FROM jsonb_to_recordset(p_portions)
      AS candidate(amount numeric, remark text)
  ) <> v_claim_amount
     OR v_portion_total <> v_claim_amount
     OR v_portion_cents <> v_claim_cents THEN
    RAISE EXCEPTION 'PORTION_TOTAL_MISMATCH' USING ERRCODE = 'P0001';
  END IF;

  IF coalesce(v_claim.received_amount, 0) > 0
     OR EXISTS (
       SELECT 1
       FROM public.panel_claim_portions AS portion
       WHERE portion.panel_claim_id = p_panel_claim_id
         AND portion.received_amount > 0
     )
     OR EXISTS (
       SELECT 1
       FROM public.panel_claim_portion_receipts AS receipt
       WHERE receipt.panel_claim_id = p_panel_claim_id
     ) THEN
    RAISE EXCEPTION 'PANEL_CLAIM_SPLIT_LOCKED' USING ERRCODE = 'P0001';
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(portion) ORDER BY portion.portion_no), '[]'::jsonb)
    INTO v_old_values
  FROM public.panel_claim_portions AS portion
  WHERE portion.panel_claim_id = p_panel_claim_id;

  DELETE FROM public.panel_claim_portions AS portion
  WHERE portion.panel_claim_id = p_panel_claim_id;

  INSERT INTO public.panel_claim_portions (
    panel_claim_id,
    portion_no,
    amount,
    remark,
    created_by,
    updated_by
  )
  SELECT
    p_panel_claim_id,
    candidate.portion_no::integer,
    candidate.amount,
    nullif(btrim(candidate.remark), ''),
    v_actor_id,
    v_actor_id
  FROM ROWS FROM (
    jsonb_to_recordset(p_portions) AS (amount numeric, remark text)
  ) WITH ORDINALITY AS candidate(amount, remark, portion_no);

  UPDATE public.panel_claims AS claim
  SET received_amount = 0,
      status = v_claim.status,
      payment_reference = NULL,
      received_date = NULL,
      updated_by = v_actor_id,
      updated_at = now()
  WHERE claim.id = p_panel_claim_id;

  SELECT jsonb_agg(to_jsonb(portion) ORDER BY portion.portion_no)
    INTO v_new_values
  FROM public.panel_claim_portions AS portion
  WHERE portion.panel_claim_id = p_panel_claim_id;

  INSERT INTO public.panel_claim_portion_audit (
    panel_claim_id,
    action,
    actor_id,
    old_values,
    new_values,
    reason
  )
  VALUES (
    p_panel_claim_id,
    CASE WHEN v_old_values = '[]'::jsonb THEN 'created' ELSE 'replaced' END,
    v_actor_id,
    v_old_values,
    v_new_values,
    nullif(btrim(p_reason), '')
  );

  RETURN QUERY
  SELECT portion.*
  FROM public.panel_claim_portions AS portion
  WHERE portion.panel_claim_id = p_panel_claim_id
  ORDER BY portion.portion_no;
END;
$function$;

ALTER FUNCTION public.replace_panel_claim_portions(uuid, jsonb, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.replace_panel_claim_portions(uuid, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_panel_claim_portions(uuid, jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.replace_panel_claim_portions(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_panel_claim_portions(uuid, jsonb, text) TO service_role;

CREATE FUNCTION public.set_checkout_panel_claim_portions(
  p_queue_entry_id uuid,
  p_panel_covered_amount numeric,
  p_portions jsonb,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_claim_id uuid;
  v_claim public.panel_claims%ROWTYPE;
  v_portions jsonb;
BEGIN
  IF NOT public.can_manage_panel_claim_portions(v_actor_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  IF p_queue_entry_id IS NULL THEN
    RAISE EXCEPTION 'QUEUE_ENTRY_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  IF p_panel_covered_amount IS NULL
     OR p_panel_covered_amount <= 0
     OR p_panel_covered_amount <> trunc(p_panel_covered_amount, 2) THEN
    RAISE EXCEPTION 'INVALID_PANEL_COVERED_AMOUNT' USING ERRCODE = 'P0001';
  END IF;

  v_claim_id := public.ensure_panel_claim_for_queue(p_queue_entry_id);
  IF v_claim_id IS NULL THEN
    RAISE EXCEPTION 'PANEL_CLAIM_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  SELECT claim.*
    INTO v_claim
  FROM public.panel_claims AS claim
  WHERE claim.id = v_claim_id
    AND claim.queue_entry_id = p_queue_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PANEL_CLAIM_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF v_claim.status <> 'pending'
     OR coalesce(v_claim.received_amount, 0) > 0
     OR EXISTS (
       SELECT 1
       FROM public.panel_claim_portions AS portion
       WHERE portion.panel_claim_id = v_claim_id
         AND portion.received_amount > 0
     )
     OR EXISTS (
       SELECT 1
       FROM public.panel_claim_portion_receipts AS receipt
       WHERE receipt.panel_claim_id = v_claim_id
     ) THEN
    RAISE EXCEPTION 'PANEL_CLAIM_SPLIT_LOCKED' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.panel_claims AS claim
  SET amount = p_panel_covered_amount,
      updated_by = v_actor_id,
      updated_at = now()
  WHERE claim.id = v_claim_id;

  SELECT coalesce(
    jsonb_agg(to_jsonb(portion) ORDER BY portion.portion_no),
    '[]'::jsonb
  )
    INTO v_portions
  FROM public.replace_panel_claim_portions(
    v_claim_id,
    p_portions,
    p_reason
  ) AS portion;

  SELECT claim.*
    INTO v_claim
  FROM public.panel_claims AS claim
  WHERE claim.id = v_claim_id;

  RETURN jsonb_build_object(
    'panel_claim_id', v_claim_id,
    'panel_claim', to_jsonb(v_claim),
    'portions', v_portions
  );
END;
$function$;

ALTER FUNCTION public.set_checkout_panel_claim_portions(uuid, numeric, jsonb, text)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_checkout_panel_claim_portions(uuid, numeric, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_checkout_panel_claim_portions(uuid, numeric, jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_checkout_panel_claim_portions(uuid, numeric, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_checkout_panel_claim_portions(uuid, numeric, jsonb, text) TO service_role;

CREATE FUNCTION public.cancel_panel_claim_portions(
  p_panel_claim_id uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_claim public.panel_claims%ROWTYPE;
  v_old_values jsonb;
BEGIN
  IF NOT public.can_manage_panel_claim_portions(v_actor_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  SELECT claim.*
    INTO v_claim
  FROM public.panel_claims AS claim
  WHERE claim.id = p_panel_claim_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PANEL_CLAIM_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.panel_claim_portions AS portion
    WHERE portion.panel_claim_id = p_panel_claim_id
  ) THEN
    RAISE EXCEPTION 'PANEL_CLAIM_SPLIT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF coalesce(v_claim.received_amount, 0) > 0
     OR EXISTS (
       SELECT 1
       FROM public.panel_claim_portions AS portion
       WHERE portion.panel_claim_id = p_panel_claim_id
         AND portion.received_amount > 0
     )
     OR EXISTS (
       SELECT 1
       FROM public.panel_claim_portion_receipts AS receipt
       WHERE receipt.panel_claim_id = p_panel_claim_id
     ) THEN
    RAISE EXCEPTION 'PANEL_CLAIM_SPLIT_LOCKED' USING ERRCODE = 'P0001';
  END IF;

  SELECT jsonb_agg(to_jsonb(portion) ORDER BY portion.portion_no)
    INTO v_old_values
  FROM public.panel_claim_portions AS portion
  WHERE portion.panel_claim_id = p_panel_claim_id;

  DELETE FROM public.panel_claim_portions AS portion
  WHERE portion.panel_claim_id = p_panel_claim_id;

  UPDATE public.panel_claims AS claim
  SET received_amount = 0,
      status = v_claim.status,
      payment_reference = NULL,
      received_date = NULL,
      updated_by = v_actor_id,
      updated_at = now()
  WHERE claim.id = p_panel_claim_id;

  INSERT INTO public.panel_claim_portion_audit (
    panel_claim_id,
    action,
    actor_id,
    old_values,
    new_values,
    reason
  )
  VALUES (
    p_panel_claim_id,
    'cancelled',
    v_actor_id,
    v_old_values,
    '[]'::jsonb,
    nullif(btrim(p_reason), '')
  );
END;
$function$;

ALTER FUNCTION public.cancel_panel_claim_portions(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.cancel_panel_claim_portions(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_panel_claim_portions(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_panel_claim_portions(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_panel_claim_portions(uuid, text) TO service_role;

CREATE FUNCTION public.record_panel_claim_portion_payment(
  p_portion_id uuid,
  p_amount numeric,
  p_received_date date,
  p_payment_reference text,
  p_remark text,
  p_idempotency_key uuid
)
RETURNS public.panel_claim_portions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_parent_id uuid;
  v_claim public.panel_claims%ROWTYPE;
  v_portion public.panel_claim_portions%ROWTYPE;
  v_before jsonb;
  v_existing_portion_id uuid;
  v_inserted_receipt_id uuid;
  v_parent_received numeric(12,2);
  v_parent_portion_total numeric(12,2);
BEGIN
  IF NOT public.can_manage_panel_claim_portions(v_actor_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  IF p_portion_id IS NULL THEN
    RAISE EXCEPTION 'PANEL_CLAIM_PORTION_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  SELECT portion.panel_claim_id
    INTO v_parent_id
  FROM public.panel_claim_portions AS portion
  WHERE portion.id = p_portion_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PANEL_CLAIM_PORTION_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  SELECT claim.*
    INTO v_claim
  FROM public.panel_claims AS claim
  WHERE claim.id = v_parent_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PANEL_CLAIM_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  SELECT portion.*
    INTO v_portion
  FROM public.panel_claim_portions AS portion
  WHERE portion.id = p_portion_id
    AND portion.panel_claim_id = v_parent_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PANEL_CLAIM_PORTION_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  SELECT receipt.panel_claim_portion_id
    INTO v_existing_portion_id
  FROM public.panel_claim_portion_receipts AS receipt
  WHERE receipt.idempotency_key = p_idempotency_key;

  IF v_existing_portion_id IS NOT NULL THEN
    IF v_existing_portion_id <> p_portion_id THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    RETURN v_portion;
  END IF;

  IF p_amount IS NULL
     OR p_amount <= 0
     OR p_amount <> trunc(p_amount, 2) THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_AMOUNT' USING ERRCODE = 'P0001';
  END IF;

  IF p_received_date IS NULL THEN
    RAISE EXCEPTION 'RECEIVED_DATE_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  IF p_payment_reference IS NULL OR btrim(p_payment_reference) = '' THEN
    RAISE EXCEPTION 'PAYMENT_REFERENCE_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  IF p_amount > v_portion.amount - v_portion.received_amount THEN
    RAISE EXCEPTION 'PORTION_OVERPAYMENT' USING ERRCODE = 'P0001';
  END IF;

  SELECT
    coalesce(sum(portion.amount), 0)::numeric(12,2),
    coalesce(sum(portion.received_amount), 0)::numeric(12,2)
  INTO v_parent_portion_total, v_parent_received
  FROM public.panel_claim_portions AS portion
  WHERE portion.panel_claim_id = v_parent_id;

  IF v_parent_portion_total <> v_claim.amount THEN
    RAISE EXCEPTION 'PORTION_TOTAL_MISMATCH' USING ERRCODE = 'P0001';
  END IF;

  v_before := to_jsonb(v_portion);

  INSERT INTO public.panel_claim_portion_receipts (
    panel_claim_portion_id,
    panel_claim_id,
    amount,
    received_date,
    payment_reference,
    remark,
    idempotency_key,
    created_by
  )
  VALUES (
    p_portion_id,
    v_parent_id,
    p_amount,
    p_received_date,
    btrim(p_payment_reference),
    nullif(btrim(p_remark), ''),
    p_idempotency_key,
    v_actor_id
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_inserted_receipt_id;

  IF v_inserted_receipt_id IS NULL THEN
    SELECT receipt.panel_claim_portion_id
      INTO v_existing_portion_id
    FROM public.panel_claim_portion_receipts AS receipt
    WHERE receipt.idempotency_key = p_idempotency_key;

    IF v_existing_portion_id <> p_portion_id THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_CONFLICT' USING ERRCODE = 'P0001';
    END IF;

    SELECT portion.*
      INTO v_portion
    FROM public.panel_claim_portions AS portion
    WHERE portion.id = p_portion_id;
    RETURN v_portion;
  END IF;

  UPDATE public.panel_claim_portions AS portion
  SET received_amount = portion.received_amount + p_amount,
      payment_reference = btrim(p_payment_reference),
      received_date = p_received_date,
      remark = CASE
        WHEN p_remark IS NULL THEN portion.remark
        ELSE nullif(btrim(p_remark), '')
      END,
      updated_by = v_actor_id,
      updated_at = now()
  WHERE portion.id = p_portion_id
  RETURNING portion.* INTO v_portion;

  SELECT coalesce(sum(portion.received_amount), 0)::numeric(12,2)
    INTO v_parent_received
  FROM public.panel_claim_portions AS portion
  WHERE portion.panel_claim_id = v_parent_id;

  IF v_parent_received > v_claim.amount THEN
    RAISE EXCEPTION 'PANEL_CLAIM_OVERPAYMENT' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.panel_claims AS claim
  SET received_amount = v_parent_received,
      status = CASE
        WHEN v_parent_received = claim.amount THEN 'received'::public.panel_claim_status
        ELSE claim.status
      END,
      payment_reference = btrim(p_payment_reference),
      received_date = p_received_date,
      updated_by = v_actor_id,
      updated_at = now()
  WHERE claim.id = v_parent_id;

  INSERT INTO public.panel_claim_portion_audit (
    panel_claim_id,
    action,
    actor_id,
    old_values,
    new_values,
    reason
  )
  VALUES (
    v_parent_id,
    'payment_recorded',
    v_actor_id,
    v_before,
    to_jsonb(v_portion),
    nullif(btrim(p_remark), '')
  );

  RETURN v_portion;
END;
$function$;

ALTER FUNCTION public.record_panel_claim_portion_payment(uuid, numeric, date, text, text, uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.record_panel_claim_portion_payment(uuid, numeric, date, text, text, uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_panel_claim_portion_payment(uuid, numeric, date, text, text, uuid)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.record_panel_claim_portion_payment(uuid, numeric, date, text, text, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_panel_claim_portion_payment(uuid, numeric, date, text, text, uuid)
  TO service_role;

DO $postflight$
DECLARE
  v_helper regprocedure := to_regprocedure('public.can_manage_panel_claim_portions(uuid)');
  v_checkout regprocedure := to_regprocedure(
    'public.set_checkout_panel_claim_portions(uuid,numeric,jsonb,text)'
  );
  v_replace regprocedure := to_regprocedure('public.replace_panel_claim_portions(uuid,jsonb,text)');
  v_cancel regprocedure := to_regprocedure('public.cancel_panel_claim_portions(uuid,text)');
  v_payment regprocedure := to_regprocedure(
    'public.record_panel_claim_portion_payment(uuid,numeric,date,text,text,uuid)'
  );
BEGIN
  IF to_regclass('public.panel_claim_portions') IS NULL
     OR to_regclass('public.panel_claim_portion_receipts') IS NULL
     OR to_regclass('public.panel_claim_portion_audit') IS NULL THEN
    RAISE EXCEPTION 'POSTFLIGHT_MISSING_TABLE';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.panel_claim_portions'::regclass
      AND conname = 'panel_claim_portions_claim_portion_unique'
      AND contype = 'u'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.panel_claim_portion_receipts'::regclass
      AND conname = 'panel_claim_portion_receipts_idempotency_key_unique'
      AND contype = 'u'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = 'public.panel_claim_portions'::regclass
      AND attname = 'status'
      AND attgenerated = 's'
      AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'POSTFLIGHT_MISSING_CONSTRAINT';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.panel_claim_portions'::regclass
      AND conname = 'panel_claim_portions_id_claim_unique'
      AND contype = 'u'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.panel_claim_portion_receipts'::regclass
      AND confrelid = 'public.panel_claim_portions'::regclass
      AND conname = 'panel_claim_portion_receipts_portion_claim_fkey'
      AND contype = 'f'
      AND pg_get_constraintdef(oid) ILIKE
        '%FOREIGN KEY (panel_claim_portion_id, panel_claim_id)%REFERENCES%panel_claim_portions(id, panel_claim_id)%'
  ) THEN
    RAISE EXCEPTION 'POSTFLIGHT_RECEIPT_PARENT_MEMBERSHIP';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_index
    WHERE indexrelid = 'public.panel_claims_queue_entry_unique_idx'::regclass
      AND indisunique
  ) THEN
    RAISE EXCEPTION 'POSTFLIGHT_PARENT_VISIT_UNIQUENESS';
  END IF;

  IF v_helper IS NULL OR v_checkout IS NULL OR v_replace IS NULL
     OR v_cancel IS NULL OR v_payment IS NULL THEN
    RAISE EXCEPTION 'POSTFLIGHT_MISSING_FUNCTION';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc AS proc
    WHERE proc.oid IN (v_helper, v_checkout, v_replace, v_cancel, v_payment)
      AND (
        NOT proc.prosecdef
        OR pg_get_userbyid(proc.proowner) <> 'postgres'
        OR NOT coalesce(proc.proconfig, '{}'::text[])
          @> ARRAY['search_path=pg_catalog']::text[]
      )
  ) THEN
    RAISE EXCEPTION 'POSTFLIGHT_INSECURE_FUNCTION';
  END IF;

  IF has_function_privilege('authenticated', v_helper, 'EXECUTE')
     OR has_function_privilege('anon', v_helper, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_helper, 'EXECUTE')
     OR EXISTS (
       SELECT 1
       FROM pg_proc AS proc
       CROSS JOIN LATERAL aclexplode(
         coalesce(proc.proacl, acldefault('f', proc.proowner))
       ) AS acl
       WHERE proc.oid IN (v_helper, v_checkout, v_replace, v_cancel, v_payment)
         AND acl.grantee = 0
         AND acl.privilege_type = 'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'POSTFLIGHT_FUNCTION_GRANT';
  END IF;

  IF NOT has_function_privilege('authenticated', v_checkout, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_checkout, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_replace, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_cancel, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_payment, 'EXECUTE')
     OR has_function_privilege('anon', v_checkout, 'EXECUTE')
     OR has_function_privilege('anon', v_replace, 'EXECUTE')
     OR has_function_privilege('anon', v_cancel, 'EXECUTE')
     OR has_function_privilege('anon', v_payment, 'EXECUTE') THEN
    RAISE EXCEPTION 'POSTFLIGHT_RPC_GRANT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class AS relation
    WHERE relation.oid IN (
      'public.panel_claim_portions'::regclass,
      'public.panel_claim_portion_receipts'::regclass,
      'public.panel_claim_portion_audit'::regclass
    )
      AND (NOT relation.relrowsecurity OR NOT relation.relforcerowsecurity)
  ) THEN
    RAISE EXCEPTION 'POSTFLIGHT_RLS_DISABLED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class AS relation
    WHERE relation.oid IN (
      'public.panel_claim_portions'::regclass,
      'public.panel_claim_portion_receipts'::regclass,
      'public.panel_claim_portion_audit'::regclass
    )
      AND pg_get_userbyid(relation.relowner) <> 'postgres'
  ) THEN
    RAISE EXCEPTION 'POSTFLIGHT_TABLE_OWNER';
  END IF;

  IF NOT has_table_privilege(
    'authenticated',
    'public.panel_claim_portions',
    'SELECT'
  ) THEN
    RAISE EXCEPTION 'POSTFLIGHT_MISSING_SELECT_PRIVILEGE';
  END IF;

  IF has_table_privilege('authenticated', 'public.panel_claim_portions', 'INSERT')
     OR has_table_privilege('authenticated', 'public.panel_claim_portions', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.panel_claim_portions', 'DELETE')
     OR has_table_privilege('authenticated', 'public.panel_claim_portions', 'TRUNCATE')
     OR has_table_privilege('authenticated', 'public.panel_claim_portion_receipts', 'INSERT')
     OR has_table_privilege('authenticated', 'public.panel_claim_portion_receipts', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.panel_claim_portion_receipts', 'DELETE')
     OR has_table_privilege('authenticated', 'public.panel_claim_portion_receipts', 'TRUNCATE')
     OR has_table_privilege('authenticated', 'public.panel_claim_portion_audit', 'INSERT')
     OR has_table_privilege('authenticated', 'public.panel_claim_portion_audit', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.panel_claim_portion_audit', 'DELETE')
     OR has_table_privilege('authenticated', 'public.panel_claim_portion_audit', 'TRUNCATE') THEN
    RAISE EXCEPTION 'POSTFLIGHT_DIRECT_WRITE_PRIVILEGE';
  END IF;

  IF has_table_privilege('service_role', 'public.panel_claim_portions', 'INSERT')
     OR has_table_privilege('service_role', 'public.panel_claim_portions', 'UPDATE')
     OR has_table_privilege('service_role', 'public.panel_claim_portions', 'DELETE')
     OR has_table_privilege('service_role', 'public.panel_claim_portions', 'TRUNCATE')
     OR has_table_privilege('service_role', 'public.panel_claim_portion_receipts', 'INSERT')
     OR has_table_privilege('service_role', 'public.panel_claim_portion_receipts', 'UPDATE')
     OR has_table_privilege('service_role', 'public.panel_claim_portion_receipts', 'DELETE')
     OR has_table_privilege('service_role', 'public.panel_claim_portion_receipts', 'TRUNCATE')
     OR has_table_privilege('service_role', 'public.panel_claim_portion_audit', 'INSERT')
     OR has_table_privilege('service_role', 'public.panel_claim_portion_audit', 'UPDATE')
     OR has_table_privilege('service_role', 'public.panel_claim_portion_audit', 'DELETE')
     OR has_table_privilege('service_role', 'public.panel_claim_portion_audit', 'TRUNCATE') THEN
    RAISE EXCEPTION 'POSTFLIGHT_SERVICE_ROLE_DIRECT_WRITE_PRIVILEGE';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.panel_claim_portions', 'SELECT')
     OR has_table_privilege('service_role', 'public.panel_claim_portion_receipts', 'SELECT')
     OR has_table_privilege('service_role', 'public.panel_claim_portion_audit', 'SELECT') THEN
    RAISE EXCEPTION 'POSTFLIGHT_SERVICE_ROLE_SELECT_PRIVILEGE';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policy
    WHERE polrelid = 'public.panel_claim_portions'::regclass
      AND polcmd = 'r'
  ) OR EXISTS (
    SELECT 1
    FROM pg_policy
    WHERE polrelid IN (
      'public.panel_claim_portions'::regclass,
      'public.panel_claim_portion_receipts'::regclass,
      'public.panel_claim_portion_audit'::regclass
    )
      AND polcmd IN ('a', 'w', 'd', '*')
  ) THEN
    RAISE EXCEPTION 'POSTFLIGHT_POLICY_BOUNDARY';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.panel_claim_portion_receipts'::regclass
      AND tgname = 'panel_claim_portion_receipts_append_only'
      AND tgenabled <> 'D'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.panel_claim_portion_audit'::regclass
      AND tgname = 'panel_claim_portion_audit_append_only'
      AND tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION 'POSTFLIGHT_APPEND_ONLY_TRIGGER';
  END IF;
END;
$postflight$;

-- Split claims keep the parent as the sole billed fact. Cash timing comes from
-- the append-only child receipt, while synchronized parent updates carry no
-- additional receipt delta.
CREATE OR REPLACE FUNCTION private.capture_financial_panel_claim_portion_receipt_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $function$
DECLARE
  v_claim public.panel_claims%ROWTYPE;
  v_received_amount numeric;
BEGIN
  SELECT claim.*
    INTO STRICT v_claim
  FROM public.panel_claims AS claim
  WHERE claim.id = NEW.panel_claim_id;

  SELECT coalesce(sum(receipt.amount), 0)::numeric
    INTO v_received_amount
  FROM public.panel_claim_portion_receipts AS receipt
  WHERE receipt.panel_claim_id = NEW.panel_claim_id;

  INSERT INTO private.financial_panel_claim_events (
    panel_claim_id,
    queue_entry_id,
    panel_id,
    event_kind,
    amount,
    received_amount,
    receipt_delta,
    status,
    due_date,
    occurred_at,
    provenance,
    attribution_complete
  ) VALUES (
    v_claim.id,
    v_claim.queue_entry_id,
    v_claim.panel_id,
    'receipt',
    v_claim.amount,
    v_received_amount,
    NEW.amount,
    CASE
      WHEN v_received_amount = v_claim.amount THEN 'received'
      ELSE v_claim.status::text
    END,
    v_claim.due_date,
    NEW.received_date::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur',
    'recorded',
    true
  );

  RETURN NEW;
END;
$function$;

ALTER FUNCTION private.capture_financial_panel_claim_portion_receipt_event()
  OWNER TO postgres;
REVOKE ALL ON FUNCTION private.capture_financial_panel_claim_portion_receipt_event()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER capture_financial_panel_claim_portion_receipt_event
  AFTER INSERT ON public.panel_claim_portion_receipts
  FOR EACH ROW
  EXECUTE FUNCTION private.capture_financial_panel_claim_portion_receipt_event();

CREATE OR REPLACE FUNCTION private.capture_financial_panel_claim_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $function$
DECLARE
  v_before_received numeric := 0;
  v_after_received numeric := 0;
  v_delta numeric;
  v_event_kind text;
  v_is_split boolean := false;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    v_before_received := COALESCE(OLD.received_amount, 0);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_after_received := COALESCE(NEW.received_amount, 0);
    v_is_split := EXISTS (
      SELECT 1
      FROM public.panel_claim_portions AS portion
      WHERE portion.panel_claim_id = NEW.id
    );
  END IF;
  v_delta := v_after_received - v_before_received;

  IF TG_OP = 'UPDATE' AND OLD.queue_entry_id IS DISTINCT FROM NEW.queue_entry_id THEN
    INSERT INTO private.financial_panel_claim_events (
      panel_claim_id, queue_entry_id, panel_id, event_kind, amount,
      received_amount, receipt_delta, status, due_date, occurred_at,
      provenance, attribution_complete
    ) VALUES (
      OLD.id, OLD.queue_entry_id, OLD.panel_id, 'reassignment_out', OLD.amount,
      0, CASE WHEN v_is_split THEN 0 ELSE -v_before_received END,
      'cancelled', OLD.due_date, statement_timestamp(),
      'recorded', true
    );
    INSERT INTO private.financial_panel_claim_events (
      panel_claim_id, queue_entry_id, panel_id, event_kind, amount,
      received_amount, receipt_delta, status, due_date, occurred_at,
      provenance, attribution_complete
    ) VALUES (
      NEW.id, NEW.queue_entry_id, NEW.panel_id, 'reassignment_in', NEW.amount,
      v_after_received, CASE WHEN v_is_split THEN 0 ELSE v_after_received END,
      NEW.status::text, NEW.due_date,
      statement_timestamp(), 'recorded', true
    );
    RETURN NEW;
  END IF;

  IF v_is_split AND TG_OP = 'UPDATE' THEN
    v_delta := 0;
  END IF;

  IF TG_OP = 'INSERT' AND v_delta = 0 THEN
    v_event_kind := 'claim_created';
  ELSIF TG_OP = 'DELETE' THEN
    v_event_kind := 'void';
  ELSIF v_delta > 0 THEN
    v_event_kind := 'receipt';
  ELSIF v_delta < 0 THEN
    v_event_kind := 'receipt_reversal';
  ELSE
    v_event_kind := 'claim_edit';
  END IF;

  INSERT INTO private.financial_panel_claim_events (
    panel_claim_id,
    queue_entry_id,
    panel_id,
    event_kind,
    amount,
    received_amount,
    receipt_delta,
    status,
    due_date,
    occurred_at,
    provenance,
    attribution_complete
  ) VALUES (
    CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.queue_entry_id ELSE NEW.queue_entry_id END,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.panel_id ELSE NEW.panel_id END,
    v_event_kind,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.amount ELSE NEW.amount END,
    v_after_received,
    v_delta,
    CASE WHEN TG_OP = 'DELETE' THEN 'cancelled' ELSE NEW.status::text END,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.due_date ELSE NEW.due_date END,
    statement_timestamp(),
    'recorded',
    true
  );

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

ALTER FUNCTION private.capture_financial_panel_claim_event() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.capture_financial_panel_claim_event()
  FROM PUBLIC, anon, authenticated;

-- Preserve the original visit-fact implementation for unsplit claims and
-- reconcile only rows whose parent had portions by the report cutoff.
ALTER FUNCTION private.financial_control_visit_facts(date, date, date)
  RENAME TO financial_control_visit_facts_parent_claims;
ALTER FUNCTION private.financial_control_visit_facts_parent_claims(date, date, date)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION private.financial_control_visit_facts_parent_claims(date,date,date)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.financial_control_visit_facts(
  _start_date date,
  _end_date date,
  _as_of_date date
)
RETURNS TABLE (
  queue_entry_id uuid,
  consultation_id uuid,
  completed_date date,
  patient_id uuid,
  patient_name text,
  doctor_id uuid,
  doctor_name text,
  payment_type text,
  payment_method text,
  panel_provider_id uuid,
  panel_provider_name text,
  billed numeric,
  paid_to_date numeric,
  paid_in_period numeric,
  older_debt_collected_in_period numeric,
  cogs numeric,
  discount numeric,
  tax numeric,
  refund numeric,
  outstanding numeric,
  panel_outstanding numeric,
  missing_cost_count integer,
  zero_price_count integer,
  correction_count integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public, private
AS $function$
  WITH parent_facts AS MATERIALIZED (
    SELECT *
    FROM private.financial_control_visit_facts_parent_claims(
      _start_date,
      _end_date,
      _as_of_date
    )
  )
  SELECT
    fact.queue_entry_id,
    fact.consultation_id,
    fact.completed_date,
    fact.patient_id,
    fact.patient_name,
    fact.doctor_id,
    fact.doctor_name,
    fact.payment_type,
    fact.payment_method,
    fact.panel_provider_id,
    fact.panel_provider_name,
    fact.billed,
    CASE
      WHEN split.panel_claim_id IS NULL THEN fact.paid_to_date
      WHEN fact.paid_to_date IS NULL THEN NULL
      ELSE round(split.payment_paid_to_date + split.received_to_date, 2)
    END,
    CASE
      WHEN split.panel_claim_id IS NULL THEN fact.paid_in_period
      WHEN fact.paid_in_period IS NULL THEN NULL
      ELSE round(split.payment_paid_in_period + split.received_in_period, 2)
    END,
    CASE
      WHEN split.panel_claim_id IS NULL THEN fact.older_debt_collected_in_period
      WHEN fact.older_debt_collected_in_period IS NULL THEN NULL
      WHEN fact.completed_date < _start_date
        THEN round(split.payment_paid_in_period + split.received_in_period, 2)
      ELSE 0::numeric
    END,
    fact.cogs,
    fact.discount,
    fact.tax,
    fact.refund,
    CASE
      WHEN split.panel_claim_id IS NULL THEN fact.outstanding
      WHEN fact.outstanding IS NULL THEN NULL
      WHEN split.status IN ('rejected', 'cancelled') THEN 0::numeric
      ELSE round(split.outstanding_amount, 2)
    END,
    CASE
      WHEN split.panel_claim_id IS NULL THEN fact.panel_outstanding
      WHEN fact.panel_outstanding IS NULL THEN NULL
      WHEN split.status IN ('rejected', 'cancelled') THEN 0::numeric
      ELSE round(split.outstanding_amount, 2)
    END,
    fact.missing_cost_count,
    fact.zero_price_count,
    fact.correction_count
  FROM parent_facts AS fact
  LEFT JOIN LATERAL (
    WITH latest_claim AS MATERIALIZED (
      SELECT event.panel_claim_id, event.status, event.event_kind
      FROM private.financial_panel_claim_events AS event
      WHERE event.queue_entry_id = fact.queue_entry_id
        AND (
          event.occurred_at IS NULL
          OR event.occurred_at
            < ((_as_of_date + 1)::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur')
        )
      ORDER BY event.occurred_at DESC NULLS LAST, event.id DESC
      LIMIT 1
    ), portion_balances AS MATERIALIZED (
      SELECT
        count(*)::integer AS portion_count,
        coalesce(sum(
          greatest(
            portion.amount - coalesce(receipts.received_amount, 0),
            0
          )
        ), 0)::numeric AS outstanding_amount,
        coalesce(sum(receipts.received_amount), 0)::numeric AS received_to_date
      FROM latest_claim AS claim
      JOIN public.panel_claim_portions AS portion
        ON portion.panel_claim_id = claim.panel_claim_id
       AND portion.created_at
         < ((_as_of_date + 1)::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur')
      LEFT JOIN LATERAL (
        SELECT
          coalesce(sum(receipt.amount) FILTER (
            WHERE receipt.received_date <= _as_of_date
          ), 0)::numeric AS received_amount
        FROM public.panel_claim_portion_receipts AS receipt
        WHERE receipt.panel_claim_portion_id = portion.id
          AND receipt.panel_claim_id = claim.panel_claim_id
      ) AS receipts ON true
    ), child_cash AS (
      SELECT coalesce(sum(event.receipt_delta), 0)::numeric AS received_in_period
      FROM latest_claim AS claim
      JOIN private.financial_panel_claim_events AS event
        ON event.panel_claim_id = claim.panel_claim_id
       AND event.queue_entry_id = fact.queue_entry_id
       AND event.event_kind = 'receipt'
       AND event.attribution_complete
       AND (timezone('Asia/Kuala_Lumpur', event.occurred_at))::date
         BETWEEN _start_date AND _end_date
    ), payment_totals AS (
      SELECT
        coalesce(sum(event.amount_delta) FILTER (
          WHERE event.attribution_complete
            AND event.occurred_at
              < ((_as_of_date + 1)::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur')
        ), 0)::numeric AS payment_paid_to_date,
        coalesce(sum(event.amount_delta) FILTER (
          WHERE event.attribution_complete
            AND (timezone('Asia/Kuala_Lumpur', event.occurred_at))::date
              BETWEEN _start_date AND _end_date
        ), 0)::numeric AS payment_paid_in_period
      FROM private.financial_payment_events AS event
      WHERE (
        (
          event.queue_entry_id = fact.queue_entry_id
          AND (
            event.consultation_id IS NULL
            OR event.consultation_id = fact.consultation_id
          )
        )
        OR (
          event.queue_entry_id IS NULL
          AND event.consultation_id = fact.consultation_id
        )
      )
    )
    SELECT
      claim.panel_claim_id,
      claim.status,
      balances.outstanding_amount,
      balances.received_to_date,
      cash.received_in_period,
      payments.payment_paid_to_date,
      payments.payment_paid_in_period
    FROM latest_claim AS claim
    CROSS JOIN portion_balances AS balances
    CROSS JOIN child_cash AS cash
    CROSS JOIN payment_totals AS payments
    WHERE balances.portion_count > 0
      AND claim.event_kind NOT IN ('reassignment_out', 'void')
  ) AS split ON true;
$function$;

ALTER FUNCTION private.financial_control_visit_facts(date, date, date)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION private.financial_control_visit_facts(date,date,date)
  FROM PUBLIC, anon, authenticated;

-- Clinic Health keeps its existing JSON contract and parent-level counts.
CREATE OR REPLACE FUNCTION public.get_clinic_health_metrics(_start_date date, _end_date date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.is_staff_or_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT jsonb_build_object(
    'financial', jsonb_build_object(
      'revenue', COALESCE((SELECT SUM(ci.price * ci.quantity) FROM consultation_items ci JOIN consultations c ON c.id = ci.consultation_id JOIN queue_entries q ON q.id = c.queue_entry_id WHERE (timezone('Asia/Kuala_Lumpur', q.created_at))::date BETWEEN _start_date AND _end_date AND (c.status = 'completed' OR q.clinic_status = 'completed') AND c.deleted_at IS NULL AND ci.deleted_at IS NULL), 0),
      'profit', COALESCE((SELECT SUM((ci.price - ci.unit_cost) * ci.quantity) FROM consultation_items ci JOIN consultations c ON c.id = ci.consultation_id JOIN queue_entries q ON q.id = c.queue_entry_id WHERE (timezone('Asia/Kuala_Lumpur', q.created_at))::date BETWEEN _start_date AND _end_date AND (c.status = 'completed' OR q.clinic_status = 'completed') AND c.deleted_at IS NULL AND ci.deleted_at IS NULL), 0),
      'marginPct', COALESCE((SELECT 100 * SUM((ci.price - ci.unit_cost) * ci.quantity) / NULLIF(SUM(ci.price * ci.quantity), 0) FROM consultation_items ci JOIN consultations c ON c.id = ci.consultation_id JOIN queue_entries q ON q.id = c.queue_entry_id WHERE (timezone('Asia/Kuala_Lumpur', q.created_at))::date BETWEEN _start_date AND _end_date AND (c.status = 'completed' OR q.clinic_status = 'completed') AND c.deleted_at IS NULL AND ci.deleted_at IS NULL), 0)
    ),
    'visits', jsonb_build_object(
      'registered', (SELECT COUNT(*) FROM queue_entries WHERE created_at::date BETWEEN _start_date AND _end_date),
      'completed', (SELECT COUNT(*) FROM queue_entries WHERE created_at::date BETWEEN _start_date AND _end_date AND clinic_status = 'completed'),
      'cancelled', (SELECT COUNT(*) FROM queue_entries WHERE created_at::date BETWEEN _start_date AND _end_date AND clinic_status = 'cancelled'),
      'noShow', (SELECT COUNT(*) FROM queue_entries WHERE created_at::date BETWEEN _start_date AND _end_date AND clinic_status::text = 'no_show')
    ),
    'claims', jsonb_build_object(
      'outstandingAmount', COALESCE((
        SELECT SUM(
          CASE
            WHEN EXISTS (
              SELECT 1
              FROM panel_claim_portions portion
              WHERE portion.panel_claim_id = claim.id
            ) THEN (
              SELECT COALESCE(SUM(GREATEST(
                portion.amount - portion.received_amount,
                0
              )), 0)
              FROM panel_claim_portions portion
              WHERE portion.panel_claim_id = claim.id
            )
            ELSE GREATEST(claim.amount - COALESCE(claim.received_amount, 0), 0)
          END
        ) FILTER (
          WHERE claim.status = ANY (
            ARRAY['pending', 'submitted', 'approved']::panel_claim_status[]
          )
        )
        FROM panel_claims claim
        WHERE claim.claim_date BETWEEN _start_date AND _end_date
      ), 0),
      'unsubmittedCount', (SELECT COUNT(*) FROM panel_claims WHERE claim_date BETWEEN _start_date AND _end_date AND submitted_date IS NULL),
      'overdueCount', (SELECT COUNT(*) FROM panel_claims WHERE due_date < CURRENT_DATE AND status = ANY (ARRAY['pending', 'submitted', 'approved']::panel_claim_status[]))
    ),
    'panelFees', jsonb_build_object(
      'activePanels', (SELECT COUNT(*) FROM insurance_providers WHERE status = 'active'),
      'missingDefaultCount', (SELECT COUNT(*) FROM insurance_providers WHERE status = 'active' AND consultation_fee_override IS NULL),
      'mismatchedVisitCount', 0
    ),
    'inventory', jsonb_build_object(
      'outOfStockCount', (SELECT COUNT(*) FROM inventory_items i WHERE NOT EXISTS (SELECT 1 FROM inventory_item_batches b WHERE b.inventory_item_id = i.id AND b.quantity_remaining > 0 AND b.expiry_date >= CURRENT_DATE)),
      'belowReorderCount', 0,
      'expiring60DaysCount', (SELECT COUNT(DISTINCT inventory_item_id) FROM inventory_item_batches WHERE quantity_remaining > 0 AND expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 60)
    ),
    'dataQuality', jsonb_build_object(
      'completedWithoutPayment', (SELECT COUNT(*) FROM queue_entries q WHERE (timezone('Asia/Kuala_Lumpur', q.created_at))::date BETWEEN _start_date AND _end_date AND q.clinic_status = 'completed' AND COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.queue_entry_id = q.id AND p.deleted_at IS NULL), 0) <= 0.005),
      'panelVisitWithoutPanel', (SELECT COUNT(*) FROM queue_entries WHERE created_at::date BETWEEN _start_date AND _end_date AND payment_method LIKE 'panel%' AND panel_id IS NULL),
      'consultationWithoutFee', (SELECT COUNT(*) FROM consultations c JOIN queue_entries q ON q.id = c.queue_entry_id WHERE q.created_at::date BETWEEN _start_date AND _end_date AND c.status = 'completed' AND NOT EXISTS (SELECT 1 FROM consultation_items ci WHERE ci.consultation_id = c.id AND ci.deleted_at IS NULL))
    )
  ) INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_clinic_health_metrics(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_clinic_health_metrics(date, date) TO authenticated;

DO $reporting_postflight$
DECLARE
  v_receipt_capture regprocedure := to_regprocedure(
    'private.capture_financial_panel_claim_portion_receipt_event()'
  );
BEGIN
  IF v_receipt_capture IS NULL
     OR to_regprocedure(
       'private.financial_control_visit_facts_parent_claims(date,date,date)'
     ) IS NULL
     OR to_regprocedure('private.financial_control_visit_facts(date,date,date)') IS NULL
     OR to_regprocedure('public.get_clinic_health_metrics(date,date)') IS NULL THEN
    RAISE EXCEPTION 'POSTFLIGHT_REPORTING_FUNCTION_MISSING';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.panel_claim_portion_receipts'::regclass
      AND tgname = 'capture_financial_panel_claim_portion_receipt_event'
      AND tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION 'POSTFLIGHT_RECEIPT_CAPTURE_TRIGGER_MISSING';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc AS proc
    WHERE proc.oid = v_receipt_capture
      AND (
        NOT proc.prosecdef
        OR pg_get_userbyid(proc.proowner) <> 'postgres'
        OR NOT coalesce(proc.proconfig, '{}'::text[])
          @> ARRAY['search_path=pg_catalog, public, private']::text[]
      )
  ) OR has_function_privilege('public', v_receipt_capture, 'EXECUTE')
     OR has_function_privilege('anon', v_receipt_capture, 'EXECUTE')
     OR has_function_privilege('authenticated', v_receipt_capture, 'EXECUTE') THEN
    RAISE EXCEPTION 'POSTFLIGHT_RECEIPT_CAPTURE_INSECURE';
  END IF;
END;
$reporting_postflight$;

-- Final-review hardening -----------------------------------------------------
--
-- Split state is versioned at the parent because every mutation is serialized
-- by the parent row lock. The version is also exposed by panel_claims_view so
-- clients can reject stale split editors instead of silently overwriting them.
ALTER TABLE public.panel_claims
  ADD COLUMN portions_version bigint NOT NULL DEFAULT 0;

CREATE TABLE public.panel_claim_checkout_requests (
  idempotency_key uuid PRIMARY KEY,
  queue_entry_id uuid NOT NULL,
  request_fingerprint text NOT NULL,
  result jsonb,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT panel_claim_checkout_requests_queue_unique UNIQUE (queue_entry_id),
  CONSTRAINT panel_claim_checkout_requests_queue_fkey
    FOREIGN KEY (queue_entry_id) REFERENCES public.queue_entries(id) ON DELETE RESTRICT,
  CONSTRAINT panel_claim_checkout_requests_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE RESTRICT
);

ALTER TABLE public.panel_claim_checkout_requests OWNER TO postgres;
ALTER TABLE public.panel_claim_checkout_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.panel_claim_checkout_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.panel_claim_checkout_requests
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE private.panel_claim_split_correction_context (
  transaction_id bigint NOT NULL,
  panel_claim_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT panel_claim_split_correction_context_pkey
    PRIMARY KEY (transaction_id, panel_claim_id)
);

ALTER TABLE private.panel_claim_split_correction_context OWNER TO postgres;
REVOKE ALL ON TABLE private.panel_claim_split_correction_context
  FROM PUBLIC, anon, authenticated, service_role;

-- completed_bill_correction_guard is removed immediately before both supported
-- completed-bill correction paths reconcile the parent claim. Stage a
-- transaction-local capability for split and unsplit claims at that boundary;
-- direct parent amount updates never receive it.
CREATE FUNCTION private.stage_panel_claim_split_correction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_claim_id uuid;
BEGIN
  SELECT claim.id
    INTO v_claim_id
  FROM public.consultations AS consultation
  JOIN public.panel_claims AS claim
    ON claim.queue_entry_id = consultation.queue_entry_id
  WHERE consultation.id = OLD.consultation_id;

  IF v_claim_id IS NOT NULL THEN
    DELETE FROM private.panel_claim_split_correction_context AS context
    WHERE context.created_at < pg_catalog.now() - interval '1 day';

    INSERT INTO private.panel_claim_split_correction_context (
      transaction_id,
      panel_claim_id,
      actor_id,
      reason
    )
    VALUES (
      pg_catalog.txid_current(),
      v_claim_id,
      OLD.actor_id,
      'Completed bill or documentation fee correction'
    )
    ON CONFLICT (transaction_id, panel_claim_id) DO UPDATE
    SET actor_id = EXCLUDED.actor_id,
        reason = EXCLUDED.reason,
        created_at = pg_catalog.now();
  END IF;

  RETURN OLD;
END;
$function$;

ALTER FUNCTION private.stage_panel_claim_split_correction() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.stage_panel_claim_split_correction()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER stage_panel_claim_split_correction
  AFTER DELETE ON public.completed_bill_correction_guard
  FOR EACH ROW
  EXECUTE FUNCTION private.stage_panel_claim_split_correction();

CREATE FUNCTION private.rebalance_panel_claim_portions(
  p_panel_claim_id uuid,
  p_new_amount numeric,
  p_actor_id uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_old_values jsonb;
  v_new_values jsonb;
  v_old_cents bigint;
  v_new_cents bigint;
  v_minimum_cents bigint;
  v_remaining_cents bigint;
  v_reducible_cents bigint;
  v_take_cents bigint;
  v_portion record;
BEGIN
  IF p_new_amount IS NULL
     OR p_new_amount <= 0
     OR p_new_amount <> pg_catalog.trunc(p_new_amount, 2) THEN
    RAISE EXCEPTION 'INVALID_CLAIM_AMOUNT' USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.panel_claim_portions AS portion
  WHERE portion.panel_claim_id = p_panel_claim_id
  ORDER BY portion.portion_no
  FOR UPDATE;

  SELECT
    coalesce(
      pg_catalog.jsonb_agg(pg_catalog.to_jsonb(portion) ORDER BY portion.portion_no),
      '[]'::jsonb
    ),
    coalesce(pg_catalog.sum((portion.amount * 100)::bigint), 0),
    coalesce(
      pg_catalog.sum((greatest(portion.received_amount, 0.01) * 100)::bigint),
      0
    )
  INTO v_old_values, v_old_cents, v_minimum_cents
  FROM public.panel_claim_portions AS portion
  WHERE portion.panel_claim_id = p_panel_claim_id;

  IF v_old_values = '[]'::jsonb THEN
    RETURN;
  END IF;

  v_new_cents := (p_new_amount * 100)::bigint;
  IF v_new_cents < v_minimum_cents THEN
    RAISE EXCEPTION 'PANEL_SPLIT_CORRECTION_BELOW_RECEIPTS'
      USING ERRCODE = '23514';
  END IF;

  v_remaining_cents := v_new_cents - v_old_cents;

  IF v_remaining_cents > 0 THEN
    UPDATE public.panel_claim_portions AS portion
    SET amount = portion.amount + (v_remaining_cents::numeric / 100),
        updated_by = p_actor_id,
        updated_at = pg_catalog.now()
    WHERE portion.id = (
      SELECT candidate.id
      FROM public.panel_claim_portions AS candidate
      WHERE candidate.panel_claim_id = p_panel_claim_id
      ORDER BY candidate.portion_no DESC
      LIMIT 1
    );
  ELSIF v_remaining_cents < 0 THEN
    v_remaining_cents := -v_remaining_cents;

    FOR v_portion IN
      SELECT
        portion.id,
        (
          (portion.amount - greatest(portion.received_amount, 0.01)) * 100
        )::bigint AS reducible_cents
      FROM public.panel_claim_portions AS portion
      WHERE portion.panel_claim_id = p_panel_claim_id
      ORDER BY portion.portion_no DESC
    LOOP
      EXIT WHEN v_remaining_cents = 0;
      v_reducible_cents := greatest(v_portion.reducible_cents, 0);
      v_take_cents := least(v_remaining_cents, v_reducible_cents);

      IF v_take_cents > 0 THEN
        UPDATE public.panel_claim_portions AS portion
        SET amount = portion.amount - (v_take_cents::numeric / 100),
            updated_by = p_actor_id,
            updated_at = pg_catalog.now()
        WHERE portion.id = v_portion.id;
        v_remaining_cents := v_remaining_cents - v_take_cents;
      END IF;
    END LOOP;

    IF v_remaining_cents <> 0 THEN
      RAISE EXCEPTION 'PANEL_SPLIT_CORRECTION_BELOW_RECEIPTS'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(portion) ORDER BY portion.portion_no)
    INTO v_new_values
  FROM public.panel_claim_portions AS portion
  WHERE portion.panel_claim_id = p_panel_claim_id;

  INSERT INTO public.panel_claim_portion_audit (
    panel_claim_id,
    action,
    actor_id,
    old_values,
    new_values,
    reason
  )
  VALUES (
    p_panel_claim_id,
    'corrected',
    p_actor_id,
    v_old_values,
    v_new_values,
    nullif(pg_catalog.btrim(p_reason), '')
  );
END;
$function$;

ALTER FUNCTION private.rebalance_panel_claim_portions(uuid, numeric, uuid, text)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION private.rebalance_panel_claim_portions(uuid, numeric, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.guard_panel_claim_split_parent_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_has_split boolean;
  v_context_matches boolean := false;
  v_actor_id uuid;
  v_reason text;
  v_portion_amount numeric(12,2);
  v_portion_received numeric(12,2);
  v_last_reference text;
  v_last_received_date date;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.panel_claim_portions AS portion
    WHERE portion.panel_claim_id = OLD.id
  ) INTO v_has_split;

  SELECT context.actor_id, context.reason
    INTO v_actor_id, v_reason
  FROM private.panel_claim_split_correction_context AS context
  WHERE context.transaction_id = pg_catalog.txid_current()
    AND context.panel_claim_id = OLD.id;
  v_context_matches := FOUND;

  IF OLD.status IN ('received', 'rejected', 'cancelled')
     AND pg_catalog.to_jsonb(NEW) - ARRAY['updated_at', 'portions_version']::text[]
         IS DISTINCT FROM
         pg_catalog.to_jsonb(OLD) - ARRAY['updated_at', 'portions_version']::text[] THEN
    IF NOT (
      v_context_matches
      AND NEW.amount IS DISTINCT FROM OLD.amount
    ) THEN
      RAISE EXCEPTION 'TERMINAL_PANEL_CLAIM_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NOT v_has_split THEN
    IF v_context_matches AND NEW.amount IS DISTINCT FROM OLD.amount THEN
      NEW.updated_by := v_actor_id;
      IF OLD.status = 'received'
         AND coalesce(NEW.received_amount, 0) < NEW.amount THEN
        NEW.status := 'approved'::public.panel_claim_status;
      END IF;
      DELETE FROM private.panel_claim_split_correction_context AS context
      WHERE context.transaction_id = pg_catalog.txid_current()
        AND context.panel_claim_id = OLD.id;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.amount IS DISTINCT FROM OLD.amount THEN
    IF NOT v_context_matches THEN
      RAISE EXCEPTION 'SPLIT_PARENT_AMOUNT_REQUIRES_CORRECTION'
        USING ERRCODE = '23514';
    END IF;

    PERFORM private.rebalance_panel_claim_portions(
      OLD.id,
      NEW.amount,
      v_actor_id,
      v_reason
    );
    NEW.updated_by := v_actor_id;
    DELETE FROM private.panel_claim_split_correction_context AS context
    WHERE context.transaction_id = pg_catalog.txid_current()
      AND context.panel_claim_id = OLD.id;
  END IF;

  SELECT
    coalesce(pg_catalog.sum(portion.amount), 0)::numeric(12,2),
    coalesce(pg_catalog.sum(portion.received_amount), 0)::numeric(12,2)
  INTO v_portion_amount, v_portion_received
  FROM public.panel_claim_portions AS portion
  WHERE portion.panel_claim_id = OLD.id;

  SELECT receipt.payment_reference, receipt.received_date
    INTO v_last_reference, v_last_received_date
  FROM public.panel_claim_portion_receipts AS receipt
  WHERE receipt.panel_claim_id = OLD.id
  ORDER BY receipt.created_at DESC, receipt.id DESC
  LIMIT 1;

  IF v_portion_amount <> NEW.amount THEN
    RAISE EXCEPTION 'PORTION_PARENT_AMOUNT_MISMATCH' USING ERRCODE = '23514';
  END IF;
  IF v_portion_received <> coalesce(NEW.received_amount, 0) THEN
    RAISE EXCEPTION 'PORTION_PARENT_RECEIVED_MISMATCH' USING ERRCODE = '23514';
  END IF;

  IF NEW.payment_reference IS DISTINCT FROM v_last_reference
     OR NEW.received_date IS DISTINCT FROM v_last_received_date THEN
    RAISE EXCEPTION 'SPLIT_RECEIPTS_CONTROL_STATUS' USING ERRCODE = '23514';
  END IF;

  IF NEW.status IN ('rejected', 'cancelled') AND v_portion_received > 0 THEN
    RAISE EXCEPTION 'TERMINAL_PANEL_CLAIM_HAS_RECEIPTS' USING ERRCODE = '23514';
  END IF;

  IF v_portion_received = NEW.amount THEN
    NEW.status := 'received'::public.panel_claim_status;
  ELSIF NEW.status = 'received' THEN
    IF v_context_matches AND OLD.status = 'received' THEN
      NEW.status := 'approved'::public.panel_claim_status;
    ELSE
      RAISE EXCEPTION 'SPLIT_RECEIPTS_CONTROL_STATUS' USING ERRCODE = '23514';
    END IF;
  END IF;

  NEW.portions_version := OLD.portions_version + 1;
  RETURN NEW;
END;
$function$;

ALTER FUNCTION private.guard_panel_claim_split_parent_mutation() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.guard_panel_claim_split_parent_mutation()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER guard_panel_claim_split_parent_mutation
  BEFORE UPDATE ON public.panel_claims
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_panel_claim_split_parent_mutation();

CREATE FUNCTION private.assert_panel_claim_portions_integrity(
  p_panel_claim_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_claim public.panel_claims%ROWTYPE;
  v_count integer;
  v_amount numeric(12,2);
  v_received numeric(12,2);
  v_receipt_total numeric(12,2);
BEGIN
  SELECT claim.*
    INTO v_claim
  FROM public.panel_claims AS claim
  WHERE claim.id = p_panel_claim_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT
    pg_catalog.count(*)::integer,
    coalesce(pg_catalog.sum(portion.amount), 0)::numeric(12,2),
    coalesce(pg_catalog.sum(portion.received_amount), 0)::numeric(12,2)
  INTO v_count, v_amount, v_received
  FROM public.panel_claim_portions AS portion
  WHERE portion.panel_claim_id = p_panel_claim_id;

  IF v_count = 0 THEN
    RETURN;
  END IF;
  IF v_count < 2 THEN
    RAISE EXCEPTION 'AT_LEAST_TWO_PORTIONS_REQUIRED' USING ERRCODE = '23514';
  END IF;
  IF v_amount <> v_claim.amount THEN
    RAISE EXCEPTION 'PORTION_PARENT_AMOUNT_MISMATCH' USING ERRCODE = '23514';
  END IF;
  IF v_received <> coalesce(v_claim.received_amount, 0) THEN
    RAISE EXCEPTION 'PORTION_PARENT_RECEIVED_MISMATCH' USING ERRCODE = '23514';
  END IF;

  SELECT coalesce(pg_catalog.sum(receipt.amount), 0)::numeric(12,2)
    INTO v_receipt_total
  FROM public.panel_claim_portion_receipts AS receipt
  WHERE receipt.panel_claim_id = p_panel_claim_id;

  IF v_receipt_total <> v_received THEN
    RAISE EXCEPTION 'PORTION_RECEIPT_LEDGER_MISMATCH' USING ERRCODE = '23514';
  END IF;
  IF v_claim.status IN ('rejected', 'cancelled') AND v_received > 0 THEN
    RAISE EXCEPTION 'TERMINAL_PANEL_CLAIM_HAS_RECEIPTS' USING ERRCODE = '23514';
  END IF;
  IF (v_claim.status = 'received') IS DISTINCT FROM (v_received = v_claim.amount) THEN
    RAISE EXCEPTION 'SPLIT_RECEIPTS_CONTROL_STATUS' USING ERRCODE = '23514';
  END IF;
END;
$function$;

ALTER FUNCTION private.assert_panel_claim_portions_integrity(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.assert_panel_claim_portions_integrity(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.check_panel_claim_portions_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF TG_TABLE_NAME = 'panel_claims' THEN
    PERFORM private.assert_panel_claim_portions_integrity(NEW.id);
  ELSE
    IF TG_OP <> 'INSERT' THEN
      PERFORM private.assert_panel_claim_portions_integrity(OLD.panel_claim_id);
    END IF;
    IF TG_OP <> 'DELETE'
       AND (TG_OP = 'INSERT' OR NEW.panel_claim_id IS DISTINCT FROM OLD.panel_claim_id) THEN
      PERFORM private.assert_panel_claim_portions_integrity(NEW.panel_claim_id);
    END IF;
  END IF;
  RETURN NULL;
END;
$function$;

ALTER FUNCTION private.check_panel_claim_portions_integrity() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.check_panel_claim_portions_integrity()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE CONSTRAINT TRIGGER panel_claim_portions_integrity
  AFTER INSERT OR UPDATE OR DELETE ON public.panel_claim_portions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION private.check_panel_claim_portions_integrity();

CREATE CONSTRAINT TRIGGER panel_claim_parent_portions_integrity
  AFTER INSERT OR UPDATE OF amount, received_amount, status ON public.panel_claims
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION private.check_panel_claim_portions_integrity();

-- Retire the caller-authoritative checkout follow-up and require optimistic
-- concurrency for every editable split definition.
DROP FUNCTION public.set_checkout_panel_claim_portions(uuid, numeric, jsonb, text);
DROP FUNCTION public.replace_panel_claim_portions(uuid, jsonb, text);
DROP FUNCTION public.cancel_panel_claim_portions(uuid, text);

CREATE FUNCTION public.replace_panel_claim_portions(
  p_panel_claim_id uuid,
  p_portions jsonb,
  p_reason text,
  p_expected_version bigint
)
RETURNS SETOF public.panel_claim_portions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_claim public.panel_claims%ROWTYPE;
  v_claim_amount numeric(12,2);
  v_claim_cents bigint;
  v_portion_count integer;
  v_portion_total numeric;
  v_portion_cents bigint;
  v_invalid_amount boolean;
  v_old_values jsonb;
  v_new_values jsonb;
BEGIN
  IF NOT public.can_manage_panel_claim_portions(v_actor_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF p_panel_claim_id IS NULL THEN
    RAISE EXCEPTION 'PANEL_CLAIM_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT claim.*
    INTO v_claim
  FROM public.panel_claims AS claim
  WHERE claim.id = p_panel_claim_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PANEL_CLAIM_NOT_FOUND' USING ERRCODE = '22023';
  END IF;
  IF v_claim.status NOT IN ('pending', 'submitted', 'approved') THEN
    RAISE EXCEPTION 'PANEL_CLAIM_NOT_PAYABLE' USING ERRCODE = '23514';
  END IF;
  IF p_expected_version IS DISTINCT FROM v_claim.portions_version THEN
    RAISE EXCEPTION 'STALE_PANEL_CLAIM_PORTIONS' USING ERRCODE = '40001';
  END IF;
  IF p_portions IS NULL OR pg_catalog.jsonb_typeof(p_portions) <> 'array' THEN
    RAISE EXCEPTION 'PORTIONS_MUST_BE_ARRAY' USING ERRCODE = '22023';
  END IF;

  v_claim_amount := v_claim.amount::numeric(12,2);
  v_claim_cents := (v_claim_amount * 100)::bigint;
  IF v_claim_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_CLAIM_AMOUNT' USING ERRCODE = '22023';
  END IF;

  SELECT
    pg_catalog.count(*)::integer,
    pg_catalog.sum(candidate.amount),
    pg_catalog.sum((candidate.amount * 100)::bigint),
    coalesce(
      pg_catalog.bool_or(
        candidate.amount IS NULL
        OR candidate.amount <= 0
        OR candidate.amount <> pg_catalog.trunc(candidate.amount, 2)
      ),
      false
    )
  INTO v_portion_count, v_portion_total, v_portion_cents, v_invalid_amount
  FROM pg_catalog.jsonb_to_recordset(p_portions)
    AS candidate(amount numeric, remark text);

  IF v_portion_count < 2 THEN
    RAISE EXCEPTION 'AT_LEAST_TWO_PORTIONS_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF v_invalid_amount THEN
    RAISE EXCEPTION 'INVALID_PORTION_AMOUNT' USING ERRCODE = '22023';
  END IF;
  IF v_portion_total <> v_claim_amount
     OR v_portion_cents <> v_claim_cents
     OR (
       SELECT pg_catalog.sum(candidate.amount)
       FROM pg_catalog.jsonb_to_recordset(p_portions)
         AS candidate(amount numeric, remark text)
     ) <> v_claim_amount THEN
    RAISE EXCEPTION 'PORTION_TOTAL_MISMATCH' USING ERRCODE = '23514';
  END IF;

  IF coalesce(v_claim.received_amount, 0) > 0
     OR EXISTS (
       SELECT 1
       FROM public.panel_claim_portion_receipts AS receipt
       WHERE receipt.panel_claim_id = p_panel_claim_id
     ) THEN
    RAISE EXCEPTION 'PANEL_CLAIM_SPLIT_LOCKED' USING ERRCODE = '23514';
  END IF;

  SELECT coalesce(
    pg_catalog.jsonb_agg(pg_catalog.to_jsonb(portion) ORDER BY portion.portion_no),
    '[]'::jsonb
  )
    INTO v_old_values
  FROM public.panel_claim_portions AS portion
  WHERE portion.panel_claim_id = p_panel_claim_id;

  DELETE FROM public.panel_claim_portions AS portion
  WHERE portion.panel_claim_id = p_panel_claim_id;

  INSERT INTO public.panel_claim_portions (
    panel_claim_id,
    portion_no,
    amount,
    remark,
    created_by,
    updated_by
  )
  SELECT
    p_panel_claim_id,
    candidate.portion_no::integer,
    candidate.amount,
    nullif(pg_catalog.btrim(candidate.remark), ''),
    v_actor_id,
    v_actor_id
  FROM ROWS FROM (
    pg_catalog.jsonb_to_recordset(p_portions) AS (amount numeric, remark text)
  ) WITH ORDINALITY AS candidate(amount, remark, portion_no);

  UPDATE public.panel_claims AS claim
  SET received_amount = 0,
      status = v_claim.status,
      payment_reference = NULL,
      received_date = NULL,
      updated_by = v_actor_id,
      updated_at = pg_catalog.now()
  WHERE claim.id = p_panel_claim_id;

  SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(portion) ORDER BY portion.portion_no)
    INTO v_new_values
  FROM public.panel_claim_portions AS portion
  WHERE portion.panel_claim_id = p_panel_claim_id;

  INSERT INTO public.panel_claim_portion_audit (
    panel_claim_id,
    action,
    actor_id,
    old_values,
    new_values,
    reason
  )
  VALUES (
    p_panel_claim_id,
    CASE WHEN v_old_values = '[]'::jsonb THEN 'created' ELSE 'replaced' END,
    v_actor_id,
    v_old_values,
    v_new_values,
    nullif(pg_catalog.btrim(p_reason), '')
  );

  RETURN QUERY
  SELECT portion.*
  FROM public.panel_claim_portions AS portion
  WHERE portion.panel_claim_id = p_panel_claim_id
  ORDER BY portion.portion_no;
END;
$function$;

ALTER FUNCTION public.replace_panel_claim_portions(uuid, jsonb, text, bigint)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.replace_panel_claim_portions(uuid, jsonb, text, bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_panel_claim_portions(uuid, jsonb, text, bigint)
  TO authenticated, service_role;

CREATE FUNCTION public.cancel_panel_claim_portions(
  p_panel_claim_id uuid,
  p_reason text,
  p_expected_version bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_claim public.panel_claims%ROWTYPE;
  v_old_values jsonb;
BEGIN
  IF NOT public.can_manage_panel_claim_portions(v_actor_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  SELECT claim.*
    INTO v_claim
  FROM public.panel_claims AS claim
  WHERE claim.id = p_panel_claim_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PANEL_CLAIM_NOT_FOUND' USING ERRCODE = '22023';
  END IF;
  IF v_claim.status NOT IN ('pending', 'submitted', 'approved') THEN
    RAISE EXCEPTION 'PANEL_CLAIM_NOT_PAYABLE' USING ERRCODE = '23514';
  END IF;
  IF p_expected_version IS DISTINCT FROM v_claim.portions_version THEN
    RAISE EXCEPTION 'STALE_PANEL_CLAIM_PORTIONS' USING ERRCODE = '40001';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.panel_claim_portions AS portion
    WHERE portion.panel_claim_id = p_panel_claim_id
  ) THEN
    RAISE EXCEPTION 'PANEL_CLAIM_SPLIT_NOT_FOUND' USING ERRCODE = '22023';
  END IF;
  IF coalesce(v_claim.received_amount, 0) > 0
     OR EXISTS (
       SELECT 1
       FROM public.panel_claim_portion_receipts AS receipt
       WHERE receipt.panel_claim_id = p_panel_claim_id
     ) THEN
    RAISE EXCEPTION 'PANEL_CLAIM_SPLIT_LOCKED' USING ERRCODE = '23514';
  END IF;

  SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(portion) ORDER BY portion.portion_no)
    INTO v_old_values
  FROM public.panel_claim_portions AS portion
  WHERE portion.panel_claim_id = p_panel_claim_id;

  DELETE FROM public.panel_claim_portions AS portion
  WHERE portion.panel_claim_id = p_panel_claim_id;

  UPDATE public.panel_claims AS claim
  SET received_amount = 0,
      status = v_claim.status,
      payment_reference = NULL,
      received_date = NULL,
      portions_version = claim.portions_version + 1,
      updated_by = v_actor_id,
      updated_at = pg_catalog.now()
  WHERE claim.id = p_panel_claim_id;

  INSERT INTO public.panel_claim_portion_audit (
    panel_claim_id,
    action,
    actor_id,
    old_values,
    new_values,
    reason
  )
  VALUES (
    p_panel_claim_id,
    'cancelled',
    v_actor_id,
    v_old_values,
    '[]'::jsonb,
    nullif(pg_catalog.btrim(p_reason), '')
  );
END;
$function$;

ALTER FUNCTION public.cancel_panel_claim_portions(uuid, text, bigint) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.cancel_panel_claim_portions(uuid, text, bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_panel_claim_portions(uuid, text, bigint)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.record_panel_claim_portion_payment(
  p_portion_id uuid,
  p_amount numeric,
  p_received_date date,
  p_payment_reference text,
  p_remark text,
  p_idempotency_key uuid
)
RETURNS public.panel_claim_portions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_parent_id uuid;
  v_claim public.panel_claims%ROWTYPE;
  v_portion public.panel_claim_portions%ROWTYPE;
  v_before jsonb;
  v_existing_portion_id uuid;
  v_inserted_receipt_id uuid;
  v_parent_received numeric(12,2);
  v_parent_portion_total numeric(12,2);
BEGIN
  IF NOT public.can_manage_panel_claim_portions(v_actor_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF p_portion_id IS NULL THEN
    RAISE EXCEPTION 'PANEL_CLAIM_PORTION_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT portion.panel_claim_id
    INTO v_parent_id
  FROM public.panel_claim_portions AS portion
  WHERE portion.id = p_portion_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PANEL_CLAIM_PORTION_NOT_FOUND' USING ERRCODE = '22023';
  END IF;

  SELECT claim.*
    INTO v_claim
  FROM public.panel_claims AS claim
  WHERE claim.id = v_parent_id
  FOR UPDATE;

  SELECT portion.*
    INTO v_portion
  FROM public.panel_claim_portions AS portion
  WHERE portion.id = p_portion_id
    AND portion.panel_claim_id = v_parent_id
  FOR UPDATE;

  SELECT receipt.panel_claim_portion_id
    INTO v_existing_portion_id
  FROM public.panel_claim_portion_receipts AS receipt
  WHERE receipt.idempotency_key = p_idempotency_key;

  IF v_existing_portion_id IS NOT NULL THEN
    IF v_existing_portion_id <> p_portion_id THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_CONFLICT' USING ERRCODE = '23505';
    END IF;
    RETURN v_portion;
  END IF;

  IF v_claim.status NOT IN ('pending', 'submitted', 'approved') THEN
    RAISE EXCEPTION 'PANEL_CLAIM_NOT_PAYABLE' USING ERRCODE = '23514';
  END IF;
  IF p_amount IS NULL
     OR p_amount::text IN ('NaN', 'Infinity', '-Infinity')
     OR p_amount <= 0
     OR p_amount <> pg_catalog.trunc(p_amount, 2) THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_AMOUNT' USING ERRCODE = '22023';
  END IF;
  IF p_received_date IS NULL THEN
    RAISE EXCEPTION 'RECEIVED_DATE_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF p_payment_reference IS NULL OR pg_catalog.btrim(p_payment_reference) = '' THEN
    RAISE EXCEPTION 'PAYMENT_REFERENCE_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF p_amount > v_portion.amount - v_portion.received_amount THEN
    RAISE EXCEPTION 'PORTION_OVERPAYMENT' USING ERRCODE = '23514';
  END IF;

  SELECT
    coalesce(pg_catalog.sum(portion.amount), 0)::numeric(12,2),
    coalesce(pg_catalog.sum(portion.received_amount), 0)::numeric(12,2)
  INTO v_parent_portion_total, v_parent_received
  FROM public.panel_claim_portions AS portion
  WHERE portion.panel_claim_id = v_parent_id;

  IF v_parent_portion_total <> v_claim.amount THEN
    RAISE EXCEPTION 'PORTION_TOTAL_MISMATCH' USING ERRCODE = '23514';
  END IF;
  IF v_parent_received <> coalesce(v_claim.received_amount, 0) THEN
    RAISE EXCEPTION 'PORTION_PARENT_RECEIVED_MISMATCH' USING ERRCODE = '23514';
  END IF;

  v_before := pg_catalog.to_jsonb(v_portion);
  INSERT INTO public.panel_claim_portion_receipts (
    panel_claim_portion_id,
    panel_claim_id,
    amount,
    received_date,
    payment_reference,
    remark,
    idempotency_key,
    created_by
  )
  VALUES (
    p_portion_id,
    v_parent_id,
    p_amount,
    p_received_date,
    pg_catalog.btrim(p_payment_reference),
    nullif(pg_catalog.btrim(p_remark), ''),
    p_idempotency_key,
    v_actor_id
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_inserted_receipt_id;

  IF v_inserted_receipt_id IS NULL THEN
    SELECT receipt.panel_claim_portion_id
      INTO v_existing_portion_id
    FROM public.panel_claim_portion_receipts AS receipt
    WHERE receipt.idempotency_key = p_idempotency_key;
    IF v_existing_portion_id <> p_portion_id THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_CONFLICT' USING ERRCODE = '23505';
    END IF;
    SELECT portion.* INTO v_portion
    FROM public.panel_claim_portions AS portion
    WHERE portion.id = p_portion_id;
    RETURN v_portion;
  END IF;

  UPDATE public.panel_claim_portions AS portion
  SET received_amount = portion.received_amount + p_amount,
      payment_reference = pg_catalog.btrim(p_payment_reference),
      received_date = p_received_date,
      remark = CASE
        WHEN p_remark IS NULL THEN portion.remark
        ELSE nullif(pg_catalog.btrim(p_remark), '')
      END,
      updated_by = v_actor_id,
      updated_at = pg_catalog.now()
  WHERE portion.id = p_portion_id
  RETURNING portion.* INTO v_portion;

  SELECT coalesce(pg_catalog.sum(portion.received_amount), 0)::numeric(12,2)
    INTO v_parent_received
  FROM public.panel_claim_portions AS portion
  WHERE portion.panel_claim_id = v_parent_id;

  UPDATE public.panel_claims AS claim
  SET received_amount = v_parent_received,
      status = CASE
        WHEN v_parent_received = claim.amount THEN 'received'::public.panel_claim_status
        ELSE claim.status
      END,
      payment_reference = pg_catalog.btrim(p_payment_reference),
      received_date = p_received_date,
      updated_by = v_actor_id,
      updated_at = pg_catalog.now()
  WHERE claim.id = v_parent_id;

  INSERT INTO public.panel_claim_portion_audit (
    panel_claim_id,
    action,
    actor_id,
    old_values,
    new_values,
    reason
  )
  VALUES (
    v_parent_id,
    'payment_recorded',
    v_actor_id,
    v_before,
    pg_catalog.to_jsonb(v_portion),
    nullif(pg_catalog.btrim(p_remark), '')
  );

  RETURN v_portion;
END;
$function$;

ALTER FUNCTION public.record_panel_claim_portion_payment(uuid, numeric, date, text, text, uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.record_panel_claim_portion_payment(uuid, numeric, date, text, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_panel_claim_portion_payment(uuid, numeric, date, text, text, uuid)
  TO authenticated, service_role;

DROP FUNCTION public.checkout_visit(
  uuid, uuid, numeric, numeric, text, text, uuid, jsonb, text
);

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

  IF v_qe.clinic_status = 'completed' THEN
    RAISE EXCEPTION 'ALREADY_COMPLETED' USING ERRCODE = '23514';
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
      item.price * CASE
        WHEN item.item_id IS NOT NULL
          THEN coalesce(item.dispensed_qty, item.quantity)
        ELSE item.quantity
      END
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

CREATE FUNCTION public.update_panel_claim_workflow(
  p_panel_claim_id uuid,
  p_status public.panel_claim_status,
  p_submitted_date date,
  p_approved_amount numeric,
  p_payment_reference text,
  p_received_date date,
  p_received_amount numeric,
  p_remarks text,
  p_gl_document_url text,
  p_due_date date
)
RETURNS public.panel_claims
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_claim public.panel_claims%ROWTYPE;
  v_result public.panel_claims%ROWTYPE;
  v_has_split boolean;
  v_status public.panel_claim_status;
  v_received numeric(12,2);
  v_reference text;
  v_received_date date;
BEGIN
  IF NOT public.is_finance_admin() THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  SELECT claim.*
    INTO v_claim
  FROM public.panel_claims AS claim
  WHERE claim.id = p_panel_claim_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PANEL_CLAIM_NOT_FOUND' USING ERRCODE = '22023';
  END IF;
  IF v_claim.status IN ('received', 'rejected', 'cancelled') THEN
    RAISE EXCEPTION 'TERMINAL_PANEL_CLAIM_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.panel_claim_portions AS portion
    WHERE portion.panel_claim_id = p_panel_claim_id
  ) INTO v_has_split;

  v_status := coalesce(p_status, v_claim.status);
  IF v_has_split THEN
    SELECT coalesce(pg_catalog.sum(portion.received_amount), 0)::numeric(12,2)
      INTO v_received
    FROM public.panel_claim_portions AS portion
    WHERE portion.panel_claim_id = p_panel_claim_id;

    SELECT receipt.payment_reference, receipt.received_date
      INTO v_reference, v_received_date
    FROM public.panel_claim_portion_receipts AS receipt
    WHERE receipt.panel_claim_id = p_panel_claim_id
    ORDER BY receipt.created_at DESC, receipt.id DESC
    LIMIT 1;

    IF (p_received_amount IS NOT NULL AND p_received_amount <> v_received)
       OR (p_payment_reference IS NOT NULL AND p_payment_reference IS DISTINCT FROM v_reference)
       OR (p_received_date IS NOT NULL AND p_received_date IS DISTINCT FROM v_received_date) THEN
      RAISE EXCEPTION 'SPLIT_RECEIPTS_CONTROL_STATUS' USING ERRCODE = '23514';
    END IF;
    IF v_status IN ('rejected', 'cancelled') AND v_received > 0 THEN
      RAISE EXCEPTION 'SPLIT_RECEIPTS_CONTROL_STATUS' USING ERRCODE = '23514';
    END IF;
    IF v_status = 'received' AND v_received <> v_claim.amount THEN
      RAISE EXCEPTION 'SPLIT_RECEIPTS_CONTROL_STATUS' USING ERRCODE = '23514';
    END IF;
    IF v_received = v_claim.amount THEN
      v_status := 'received'::public.panel_claim_status;
    END IF;
  ELSE
    v_received := coalesce(p_received_amount, v_claim.received_amount, 0);
    v_reference := CASE
      WHEN p_payment_reference IS NULL THEN v_claim.payment_reference
      ELSE nullif(pg_catalog.btrim(p_payment_reference), '')
    END;
    v_received_date := coalesce(p_received_date, v_claim.received_date);

    IF v_received < 0 OR v_received > v_claim.amount THEN
      RAISE EXCEPTION 'INVALID_RECEIVED_AMOUNT' USING ERRCODE = '23514';
    END IF;
    IF v_status = 'received' AND v_received <> v_claim.amount THEN
      RAISE EXCEPTION 'RECEIVED_AMOUNT_MUST_EQUAL_CLAIM' USING ERRCODE = '23514';
    END IF;
    IF v_status = 'received' AND v_received_date IS NULL THEN
      v_received_date := pg_catalog.timezone('Asia/Kuala_Lumpur', pg_catalog.now())::date;
    END IF;
  END IF;

  IF p_approved_amount IS NOT NULL
     AND (p_approved_amount < 0 OR p_approved_amount > v_claim.amount) THEN
    RAISE EXCEPTION 'INVALID_APPROVED_AMOUNT' USING ERRCODE = '23514';
  END IF;

  UPDATE public.panel_claims AS claim
  SET status = v_status,
      submitted_date = CASE
        WHEN v_status = 'submitted'
          THEN coalesce(
            p_submitted_date,
            claim.submitted_date,
            pg_catalog.timezone('Asia/Kuala_Lumpur', pg_catalog.now())::date
          )
        ELSE coalesce(p_submitted_date, claim.submitted_date)
      END,
      approved_amount = p_approved_amount,
      payment_reference = v_reference,
      received_date = v_received_date,
      received_amount = v_received,
      remarks = p_remarks,
      gl_document_url = p_gl_document_url,
      due_date = p_due_date,
      updated_by = v_actor_id,
      updated_at = pg_catalog.now()
  WHERE claim.id = p_panel_claim_id
  RETURNING claim.* INTO v_result;

  RETURN v_result;
END;
$function$;

ALTER FUNCTION public.update_panel_claim_workflow(
  uuid, public.panel_claim_status, date, numeric, text, date, numeric, text, text, date
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.update_panel_claim_workflow(
  uuid, public.panel_claim_status, date, numeric, text, date, numeric, text, text, date
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_panel_claim_workflow(
  uuid, public.panel_claim_status, date, numeric, text, date, numeric, text, text, date
) TO authenticated, service_role;

CREATE FUNCTION public.bulk_submit_panel_claims(
  p_panel_claim_ids uuid[],
  p_submitted_date date
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_submitted_date date := coalesce(
    p_submitted_date,
    pg_catalog.timezone('Asia/Kuala_Lumpur', pg_catalog.now())::date
  );
  v_updated_count integer := 0;
BEGIN
  IF NOT public.is_finance_admin() THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF p_panel_claim_ids IS NULL OR pg_catalog.cardinality(p_panel_claim_ids) = 0 THEN
    RETURN 0;
  END IF;

  UPDATE public.panel_claims AS claim
  SET status = 'submitted'::public.panel_claim_status,
      submitted_date = v_submitted_date,
      updated_by = v_actor_id,
      updated_at = pg_catalog.now()
  WHERE claim.id = ANY(p_panel_claim_ids)
    AND claim.status IN ('pending', 'submitted', 'approved');

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN v_updated_count;
END;
$function$;

ALTER FUNCTION public.bulk_submit_panel_claims(uuid[], date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.bulk_submit_panel_claims(uuid[], date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_submit_panel_claims(uuid[], date)
  TO authenticated, service_role;

-- Keep parent writes finance-admin-only. The purchaser policy below grants the
-- read path needed for portion work without activating legacy broad mutations.
DROP POLICY IF EXISTS panel_claims_ops_insert ON public.panel_claims;
DROP POLICY IF EXISTS panel_claims_ops_update ON public.panel_claims;
DROP POLICY IF EXISTS panel_claims_ops_delete ON public.panel_claims;
DROP POLICY IF EXISTS panel_claims_finance_admin_insert ON public.panel_claims;
DROP POLICY IF EXISTS panel_claims_finance_admin_update ON public.panel_claims;
DROP POLICY IF EXISTS panel_claims_finance_admin_delete ON public.panel_claims;

CREATE POLICY panel_claims_finance_admin_insert
  ON public.panel_claims
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_finance_admin());

CREATE POLICY panel_claims_finance_admin_update
  ON public.panel_claims
  FOR UPDATE
  TO authenticated
  USING (public.is_finance_admin())
  WITH CHECK (public.is_finance_admin());

CREATE POLICY panel_claims_finance_admin_delete
  ON public.panel_claims
  FOR DELETE
  TO authenticated
  USING (public.is_finance_admin());

-- user_roles RLS limits this subquery to the caller's own role row.
DROP POLICY IF EXISTS panel_claims_purchaser_read ON public.panel_claims;
CREATE POLICY panel_claims_purchaser_read
  ON public.panel_claims
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles AS user_role
      WHERE user_role.user_id = auth.uid()
        AND user_role.role::text = 'purchaser'
    )
  );

CREATE OR REPLACE VIEW public.panel_claims_view
WITH (security_invoker = true)
AS
SELECT
  claim.id,
  claim.claim_no,
  claim.panel_id,
  claim.patient_id,
  claim.queue_entry_id,
  claim.amount,
  claim.received_amount,
  claim.status,
  claim.claim_date,
  claim.due_date,
  claim.submitted_date,
  claim.approved_amount,
  claim.write_off_amount,
  claim.payment_reference,
  claim.received_date,
  claim.gl_document_url,
  claim.remarks,
  claim.updated_by,
  claim.created_at,
  claim.updated_at,
  (
    claim.due_date IS NOT NULL
    AND claim.due_date < CURRENT_DATE
    AND claim.status IN ('pending', 'submitted', 'approved')
  ) AS is_overdue,
  claim.portions_version
FROM public.panel_claims AS claim;

ALTER VIEW public.panel_claims_view OWNER TO postgres;
GRANT SELECT ON public.panel_claims_view TO authenticated, service_role;

DO $hardening_postflight$
DECLARE
  v_claim_id uuid;
  v_function regprocedure;
BEGIN
  IF to_regprocedure(
       'public.set_checkout_panel_claim_portions(uuid,numeric,jsonb,text)'
     ) IS NOT NULL
     OR to_regprocedure(
       'public.replace_panel_claim_portions(uuid,jsonb,text)'
     ) IS NOT NULL
     OR to_regprocedure(
       'public.cancel_panel_claim_portions(uuid,text)'
     ) IS NOT NULL THEN
    RAISE EXCEPTION 'POSTFLIGHT_LEGACY_SPLIT_RPC_PRESENT';
  END IF;

  FOREACH v_function IN ARRAY ARRAY[
    to_regprocedure('public.replace_panel_claim_portions(uuid,jsonb,text,bigint)'),
    to_regprocedure('public.cancel_panel_claim_portions(uuid,text,bigint)'),
    to_regprocedure(
      'public.record_panel_claim_portion_payment(uuid,numeric,date,text,text,uuid)'
    ),
    to_regprocedure(
      'public.checkout_visit(uuid,uuid,numeric,numeric,text,text,uuid,jsonb,text,numeric,jsonb,uuid)'
    ),
    to_regprocedure(
      'public.update_panel_claim_workflow(uuid,panel_claim_status,date,numeric,text,date,numeric,text,text,date)'
    ),
    to_regprocedure('public.bulk_submit_panel_claims(uuid[],date)')
  ]
  LOOP
    IF v_function IS NULL THEN
      RAISE EXCEPTION 'POSTFLIGHT_HARDENED_FUNCTION_MISSING';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS procedure
      WHERE procedure.oid = v_function
        AND (
          NOT procedure.prosecdef
          OR pg_catalog.pg_get_userbyid(procedure.proowner) <> 'postgres'
          OR NOT coalesce(procedure.proconfig, '{}'::text[])
            @> ARRAY['search_path=pg_catalog']::text[]
        )
    ) THEN
      RAISE EXCEPTION 'POSTFLIGHT_HARDENED_FUNCTION_INSECURE';
    END IF;
  END LOOP;

  IF pg_catalog.has_function_privilege(
       'public',
       'public.bulk_submit_panel_claims(uuid[],date)',
       'EXECUTE'
     ) OR pg_catalog.has_function_privilege(
       'anon',
       'public.bulk_submit_panel_claims(uuid[],date)',
       'EXECUTE'
     ) OR NOT pg_catalog.has_function_privilege(
       'authenticated',
       'public.bulk_submit_panel_claims(uuid[],date)',
       'EXECUTE'
     ) OR NOT pg_catalog.has_function_privilege(
       'service_role',
       'public.bulk_submit_panel_claims(uuid[],date)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'POSTFLIGHT_BULK_SUBMIT_PRIVILEGE';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'public.panel_claim_portions'::regclass
      AND tgname = 'panel_claim_portions_integrity'
      AND tgdeferrable
      AND tginitdeferred
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'public.completed_bill_correction_guard'::regclass
      AND tgname = 'stage_panel_claim_split_correction'
      AND tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION 'POSTFLIGHT_INTEGRITY_TRIGGER_MISSING';
  END IF;

  IF pg_catalog.has_table_privilege(
       'authenticated',
       'public.panel_claim_checkout_requests',
       'SELECT,INSERT,UPDATE,DELETE'
     ) OR pg_catalog.has_table_privilege(
       'service_role',
       'public.panel_claim_checkout_requests',
       'SELECT,INSERT,UPDATE,DELETE'
     ) THEN
    RAISE EXCEPTION 'POSTFLIGHT_CHECKOUT_REQUEST_PRIVILEGE';
  END IF;

  FOR v_claim_id IN
    SELECT DISTINCT portion.panel_claim_id
    FROM public.panel_claim_portions AS portion
  LOOP
    PERFORM private.assert_panel_claim_portions_integrity(v_claim_id);
  END LOOP;
END;
$hardening_postflight$;

NOTIFY pgrst, 'reload schema';
