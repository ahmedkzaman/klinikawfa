-- Guarded completed-bill correction boundary.
--
-- Completed financial records may only be changed through correct_completed_bill.
-- The RPC keeps checkout, completion, dispensing, and inventory history untouched.

ALTER TABLE public.consultation_items
  ADD COLUMN billing_adjustment_kind text NULL,
  ADD COLUMN clinic_charge_type_id uuid NULL
    REFERENCES public.clinic_charge_types(id);

ALTER TABLE public.consultation_items
  ADD CONSTRAINT consultation_items_billing_adjustment_kind_check
    CHECK (
      billing_adjustment_kind IS NULL
      OR billing_adjustment_kind IN ('other_charge', 'discount', 'tax')
    ),
  ADD CONSTRAINT consultation_items_charge_type_metadata_check
    CHECK (
      (billing_adjustment_kind = 'other_charge' AND clinic_charge_type_id IS NOT NULL)
      OR (billing_adjustment_kind IS DISTINCT FROM 'other_charge' AND clinic_charge_type_id IS NULL)
    );

CREATE INDEX consultation_items_clinic_charge_type_id_idx
  ON public.consultation_items (clinic_charge_type_id)
  WHERE clinic_charge_type_id IS NOT NULL;

CREATE TABLE public.completed_bill_correction_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_entry_id uuid NOT NULL REFERENCES public.queue_entries(id),
  consultation_id uuid NOT NULL REFERENCES public.consultations(id),
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  reason text NOT NULL CHECK (length(trim(reason)) >= 3),
  before_state jsonb NOT NULL,
  after_state jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX completed_bill_correction_audit_queue_created_idx
  ON public.completed_bill_correction_audit (queue_entry_id, created_at DESC);
CREATE INDEX completed_bill_correction_audit_consultation_created_idx
  ON public.completed_bill_correction_audit (consultation_id, created_at DESC);

ALTER TABLE public.completed_bill_correction_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "completed_bill_correction_audit_admin_read"
  ON public.completed_bill_correction_audit
  FOR SELECT TO authenticated
  USING (public.is_ops_or_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.prevent_completed_bill_audit_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  RAISE EXCEPTION 'AUDIT_IMMUTABLE' USING ERRCODE = '42501';
END;
$function$;

CREATE TRIGGER prevent_completed_bill_correction_audit_change
  BEFORE UPDATE OR DELETE ON public.completed_bill_correction_audit
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_completed_bill_audit_change();

REVOKE ALL ON FUNCTION public.prevent_completed_bill_audit_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_completed_bill_audit_change() FROM anon;
REVOKE ALL ON FUNCTION public.prevent_completed_bill_audit_change() FROM authenticated;

CREATE OR REPLACE FUNCTION public.can_correct_completed_bill(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT _user_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.user_roles ur
       WHERE ur.user_id = _user_id
         AND ur.role::text IN (
           'ops_staff', 'operations', 'staff',
           'admin', 'special_admin', 'doctor_admin'
         )
     );
$function$;

ALTER FUNCTION public.can_correct_completed_bill(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.can_correct_completed_bill(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_correct_completed_bill(uuid) TO authenticated;

-- One deterministic state builder is shared by the context and mutation RPCs. It is
-- not client-callable; callers only receive it after the role/visit guards.
CREATE OR REPLACE FUNCTION public.completed_bill_correction_state(
  p_queue_entry_id uuid,
  p_consultation_id uuid
)
RETURNS jsonb
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  WITH item_state AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', ci.id,
          'item_name', ci.item_name,
          'quantity', ci.quantity,
          'price', ci.price,
          'item_id', ci.item_id,
          'service_id', ci.service_id,
          'package_id', ci.package_id,
          'dispensed_qty', ci.dispensed_qty,
          'adjustment_kind', ci.billing_adjustment_kind,
          'charge_type_id', ci.clinic_charge_type_id
        )
        ORDER BY ci.id
      ),
      '[]'::jsonb
    ) AS items
    FROM public.consultation_items ci
    WHERE ci.consultation_id = p_consultation_id
      AND ci.deleted_at IS NULL
  ),
  payment_state AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'amount', p.amount,
          'payment_method', p.payment_method,
          'payment_type', p.payment_type,
          'notes', p.notes
        )
        ORDER BY p.id
      ),
      '[]'::jsonb
    ) AS payments
    FROM public.payments p
    WHERE p.queue_entry_id = p_queue_entry_id
      AND p.deleted_at IS NULL
  ),
  claim_state AS (
    SELECT to_jsonb(pc) AS panel_claim
    FROM public.panel_claims pc
    WHERE pc.queue_entry_id = p_queue_entry_id
    ORDER BY pc.id
    LIMIT 1
  ),
  totals AS (
    SELECT
      COALESCE(
        SUM(round(ci.price * ci.quantity, 2))
          FILTER (
            WHERE ci.billing_adjustment_kind IS NULL
               OR ci.billing_adjustment_kind = 'other_charge'
          ),
        0
      )::numeric AS subtotal,
      GREATEST(
        -COALESCE(
          SUM(round(ci.price * ci.quantity, 2))
            FILTER (WHERE ci.billing_adjustment_kind = 'discount'),
          0
        ),
        0
      )::numeric AS discount_rm,
      GREATEST(
        COALESCE(
          SUM(round(ci.price * ci.quantity, 2))
            FILTER (WHERE ci.billing_adjustment_kind = 'tax'),
          0
        ),
        0
      )::numeric AS tax_rm,
      COALESCE(SUM(round(ci.price * ci.quantity, 2)), 0)::numeric AS total
    FROM public.consultation_items ci
    WHERE ci.consultation_id = p_consultation_id
      AND ci.deleted_at IS NULL
  ),
  paid_state AS (
    SELECT COALESCE(SUM(p.amount), 0)::numeric AS paid
    FROM public.payments p
    WHERE p.queue_entry_id = p_queue_entry_id
      AND p.deleted_at IS NULL
  )
  SELECT jsonb_build_object(
    'items', item_state.items,
    'payments', payment_state.payments,
    'panel_claim', claim_state.panel_claim,
    'subtotal', round(totals.subtotal, 2),
    'discount_rm', round(totals.discount_rm, 2),
    'tax_rm', round(totals.tax_rm, 2),
    'tax_pct', CASE
      WHEN totals.subtotal > totals.discount_rm THEN
        round(
          totals.tax_rm * 100 / (totals.subtotal - totals.discount_rm),
          4
        )
      ELSE 0
    END,
    'total', round(totals.total, 2),
    'paid', round(paid_state.paid, 2),
    'outstanding', GREATEST(round(totals.total - paid_state.paid, 2), 0),
    'credit_due', GREATEST(round(paid_state.paid - totals.total, 2), 0),
    'panel_credit_due', GREATEST(
      round(
        COALESCE((claim_state.panel_claim->>'received_amount')::numeric, 0)
        - COALESCE((claim_state.panel_claim->>'amount')::numeric, 0),
        2
      ),
      0
    ),
    'status', CASE
      WHEN totals.total > paid_state.paid THEN 'outstanding'
      WHEN paid_state.paid > totals.total THEN 'credit_due'
      ELSE 'paid'
    END
  )
  FROM item_state
  CROSS JOIN payment_state
  CROSS JOIN totals
  CROSS JOIN paid_state
  LEFT JOIN claim_state ON true;
$function$;

ALTER FUNCTION public.completed_bill_correction_state(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.completed_bill_correction_state(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.completed_bill_correction_state(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.completed_bill_correction_state(uuid, uuid) FROM authenticated;

CREATE OR REPLACE FUNCTION public.get_completed_bill_correction_context(
  p_queue_entry_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_consultation_id uuid;
  v_consultation_count integer;
  v_state jsonb;
  v_editable_items jsonb;
  v_fingerprint text;
BEGIN
  IF NOT public.can_correct_completed_bill(auth.uid()) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.queue_entries qe
    WHERE qe.id = p_queue_entry_id
      AND qe.deleted_at IS NULL
      AND qe.clinic_status = 'completed'
  ) THEN
    RAISE EXCEPTION 'VISIT_NOT_COMPLETED' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)
    INTO v_consultation_count
  FROM public.consultations c
  WHERE c.queue_entry_id = p_queue_entry_id
    AND c.deleted_at IS NULL;

  IF v_consultation_count <> 1 THEN
    RAISE EXCEPTION 'CONSULTATION_NOT_UNIQUE' USING ERRCODE = '22023';
  END IF;

  SELECT c.id
    INTO v_consultation_id
  FROM public.consultations c
  WHERE c.queue_entry_id = p_queue_entry_id
    AND c.deleted_at IS NULL
  ORDER BY c.id
  LIMIT 1;

  IF NOT EXISTS (
    SELECT 1
    FROM public.consultations c
    WHERE c.id = v_consultation_id
      AND c.status = 'completed'
  ) THEN
    RAISE EXCEPTION 'VISIT_NOT_COMPLETED' USING ERRCODE = '22023';
  END IF;

  v_state := public.completed_bill_correction_state(
    p_queue_entry_id,
    v_consultation_id
  );
  v_fingerprint := md5(
    jsonb_build_object(
      'items', COALESCE(v_state->'items', '[]'::jsonb),
      'payments', COALESCE(v_state->'payments', '[]'::jsonb),
      'panel_claim', v_state->'panel_claim'
    )::text
  );
  SELECT COALESCE(jsonb_agg(element ORDER BY element->>'id'), '[]'::jsonb)
    INTO v_editable_items
  FROM jsonb_array_elements(v_state->'items') element
  WHERE element->>'adjustment_kind' IS NULL
     OR element->>'adjustment_kind' = 'other_charge';

  RETURN v_state || jsonb_build_object(
    'queue_entry_id', p_queue_entry_id,
    'consultation_id', v_consultation_id,
    'items', v_editable_items,
    'fingerprint', v_fingerprint
  );
END;
$function$;

ALTER FUNCTION public.get_completed_bill_correction_context(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_completed_bill_correction_context(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_completed_bill_correction_context(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_completed_bill_correction_context(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.correct_completed_bill(
  p_queue_entry_id uuid,
  p_expected_fingerprint text,
  p_reason text,
  p_items jsonb,
  p_payments jsonb,
  p_discount_rm numeric,
  p_tax_pct numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_consultation_id uuid;
  v_consultation_count integer;
  v_before_state jsonb;
  v_after_state jsonb;
  v_fingerprint text;
  v_new_fingerprint text;
  v_item jsonb;
  v_payment jsonb;
  v_item_id uuid;
  v_payment_id uuid;
  v_charge_type_id uuid;
  v_inventory_item_id uuid;
  v_existing_adjustment_kind text;
  v_existing_charge_type_id uuid;
  v_dispensed_qty numeric;
  v_quantity numeric;
  v_price numeric;
  v_amount numeric;
  v_payment_method text;
  v_charge_name text;
  v_existing_count integer;
  v_payload_existing_count integer;
  v_subtotal numeric;
  v_discount_rm numeric;
  v_tax_pct numeric;
  v_tax_rm numeric;
  v_total numeric;
  v_claim_id uuid;
  v_panel_eligible_total numeric;
  v_audit_id uuid;
BEGIN
  IF NOT public.can_correct_completed_bill(auth.uid()) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF length(trim(coalesce(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'CORRECTION_REASON_REQUIRED' USING ERRCODE = '22023';
  END IF;

  -- Lock the complete bill in one deterministic order.
  PERFORM 1
  FROM public.queue_entries qe
  WHERE qe.id = p_queue_entry_id
    AND qe.deleted_at IS NULL
    AND qe.clinic_status = 'completed'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VISIT_NOT_COMPLETED' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)
    INTO v_consultation_count
  FROM public.consultations c
  WHERE c.queue_entry_id = p_queue_entry_id
    AND c.deleted_at IS NULL;
  IF v_consultation_count <> 1 THEN
    RAISE EXCEPTION 'CONSULTATION_NOT_UNIQUE' USING ERRCODE = '22023';
  END IF;

  SELECT c.id
    INTO v_consultation_id
  FROM public.consultations c
  WHERE c.queue_entry_id = p_queue_entry_id
    AND c.deleted_at IS NULL
  ORDER BY c.id
  LIMIT 1;

  PERFORM 1
  FROM public.consultations c
  WHERE c.id = v_consultation_id
    AND c.status = 'completed'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VISIT_NOT_COMPLETED' USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.consultation_items ci
  WHERE ci.consultation_id = v_consultation_id
    AND ci.deleted_at IS NULL
  ORDER BY ci.id
  FOR UPDATE;

  PERFORM 1
  FROM public.payments p
  WHERE p.queue_entry_id = p_queue_entry_id
    AND p.deleted_at IS NULL
  ORDER BY p.id
  FOR UPDATE;

  PERFORM 1
  FROM public.panel_claims pc
  WHERE pc.queue_entry_id = p_queue_entry_id
  ORDER BY pc.id
  FOR UPDATE;

  v_before_state := public.completed_bill_correction_state(
    p_queue_entry_id,
    v_consultation_id
  );
  v_fingerprint := md5(
    jsonb_build_object(
      'items', COALESCE(v_before_state->'items', '[]'::jsonb),
      'payments', COALESCE(v_before_state->'payments', '[]'::jsonb),
      'panel_claim', v_before_state->'panel_claim'
    )::text
  );
  v_before_state := v_before_state || jsonb_build_object('fingerprint', v_fingerprint);

  IF p_expected_fingerprint IS NULL
     OR p_expected_fingerprint IS DISTINCT FROM v_fingerprint THEN
    RAISE EXCEPTION 'STALE_BILL' USING ERRCODE = '40001';
  END IF;

  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_payments) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'INVALID_CORRECTION_PAYLOAD' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) element
    WHERE jsonb_typeof(element) <> 'object'
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_payments) element
    WHERE jsonb_typeof(element) <> 'object'
  ) THEN
    RAISE EXCEPTION 'INVALID_CORRECTION_PAYLOAD' USING ERRCODE = '22023';
  END IF;

  IF p_discount_rm IS NULL
     OR p_discount_rm::text IN ('NaN', 'Infinity', '-Infinity')
     OR p_discount_rm < 0
     OR p_discount_rm > 99999999.99
     OR p_tax_pct IS NULL
     OR p_tax_pct::text IN ('NaN', 'Infinity', '-Infinity')
     OR p_tax_pct < 0
     OR p_tax_pct > 100 THEN
    RAISE EXCEPTION 'INVALID_FINANCIAL_BOUNDS' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT element->>'id' AS id
      FROM jsonb_array_elements(p_items) element
      WHERE element->>'id' IS NOT NULL
      GROUP BY element->>'id'
      HAVING count(*) > 1
    ) duplicates
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_ITEM_ID' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    IF jsonb_typeof(v_item->'quantity') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_item->'price') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_item->'remove') IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'INVALID_ITEM_STRUCTURE' USING ERRCODE = '22023';
    END IF;

    v_quantity := (v_item->>'quantity')::numeric;
    v_price := (v_item->>'price')::numeric;
    IF v_quantity::text IN ('NaN', 'Infinity', '-Infinity')
       OR v_price::text IN ('NaN', 'Infinity', '-Infinity')
       OR v_quantity < 0
       OR v_quantity > 1000000
       OR trunc(v_quantity) <> v_quantity
       OR v_price < 0
       OR v_price > 99999999.99 THEN
      RAISE EXCEPTION 'INVALID_ITEM_BOUNDS' USING ERRCODE = '22023';
    END IF;

    IF v_item->>'id' IS NULL THEN
      IF COALESCE((v_item->>'remove')::boolean, false)
         OR v_item->>'adjustment_kind' IS DISTINCT FROM 'other_charge'
         OR v_item->>'charge_type_id' IS NULL
         OR v_item->>'charge_type_id' !~
           '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
         OR v_quantity <= 0 THEN
        RAISE EXCEPTION 'INVALID_NEW_BILL_ITEM' USING ERRCODE = '22023';
      END IF;

      v_charge_type_id := (v_item->>'charge_type_id')::uuid;
      PERFORM 1
      FROM public.clinic_charge_types cct
      WHERE cct.id = v_charge_type_id
        AND cct.is_active;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'INVALID_CHARGE_TYPE' USING ERRCODE = '22023';
      END IF;
      CONTINUE;
    END IF;

    IF jsonb_typeof(v_item->'id') IS DISTINCT FROM 'string'
       OR v_item->>'id' !~
         '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
      RAISE EXCEPTION 'INVALID_ITEM_ID' USING ERRCODE = '22023';
    END IF;
    v_item_id := (v_item->>'id')::uuid;

    SELECT
      ci.item_id,
      COALESCE(ci.dispensed_qty, 0),
      ci.billing_adjustment_kind,
      ci.clinic_charge_type_id
    INTO
      v_inventory_item_id,
      v_dispensed_qty,
      v_existing_adjustment_kind,
      v_existing_charge_type_id
    FROM public.consultation_items ci
    WHERE ci.id = v_item_id
      AND ci.consultation_id = v_consultation_id
      AND ci.deleted_at IS NULL
      AND ci.billing_adjustment_kind IS DISTINCT FROM 'discount'
      AND ci.billing_adjustment_kind IS DISTINCT FROM 'tax';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ITEM_NOT_IN_VISIT' USING ERRCODE = '22023';
    END IF;

    IF v_item->>'adjustment_kind' IS DISTINCT FROM v_existing_adjustment_kind
       OR (
         v_item->>'charge_type_id' IS DISTINCT FROM
           CASE
             WHEN v_existing_charge_type_id IS NULL THEN NULL
             ELSE v_existing_charge_type_id::text
           END
       ) THEN
      RAISE EXCEPTION 'ITEM_METADATA_IMMUTABLE' USING ERRCODE = '22023';
    END IF;

    IF v_inventory_item_id IS NOT NULL
       AND v_dispensed_qty > 0
       AND (v_item->>'remove')::boolean THEN
      RAISE EXCEPTION 'DISPENSED_MEDICINE_REMOVE' USING ERRCODE = '22023';
    END IF;
    IF v_inventory_item_id IS NOT NULL
       AND v_quantity < v_dispensed_qty THEN
      RAISE EXCEPTION 'QUANTITY_BELOW_DISPENSED' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  SELECT count(*)
    INTO v_existing_count
  FROM public.consultation_items ci
  WHERE ci.consultation_id = v_consultation_id
    AND ci.deleted_at IS NULL
    AND ci.billing_adjustment_kind IS DISTINCT FROM 'discount'
    AND ci.billing_adjustment_kind IS DISTINCT FROM 'tax';
  SELECT count(*)
    INTO v_payload_existing_count
  FROM jsonb_array_elements(p_items) element
  WHERE element->>'id' IS NOT NULL;

  IF v_existing_count <> v_payload_existing_count
     OR EXISTS (
       SELECT 1
       FROM public.consultation_items ci
       WHERE ci.consultation_id = v_consultation_id
         AND ci.deleted_at IS NULL
         AND ci.billing_adjustment_kind IS DISTINCT FROM 'discount'
         AND ci.billing_adjustment_kind IS DISTINCT FROM 'tax'
         AND NOT EXISTS (
           SELECT 1
           FROM jsonb_array_elements(p_items) element
           WHERE element->>'id' = ci.id::text
         )
     ) THEN
    RAISE EXCEPTION 'ITEM_SET_MISMATCH' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT element->>'id' AS id
      FROM jsonb_array_elements(p_payments) element
      GROUP BY element->>'id'
      HAVING count(*) > 1
    ) duplicates
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_PAYMENT_ID' USING ERRCODE = '22023';
  END IF;

  FOR v_payment IN SELECT value FROM jsonb_array_elements(p_payments)
  LOOP
    IF jsonb_typeof(v_payment->'id') IS DISTINCT FROM 'string'
       OR v_payment->>'id' !~
         '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
       OR jsonb_typeof(v_payment->'amount') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_payment->'payment_method') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'INVALID_PAYMENT_STRUCTURE' USING ERRCODE = '22023';
    END IF;

    v_payment_id := (v_payment->>'id')::uuid;
    v_amount := (v_payment->>'amount')::numeric;
    v_payment_method := trim(v_payment->>'payment_method');
    IF v_amount::text IN ('NaN', 'Infinity', '-Infinity')
       OR v_amount < 0
       OR v_amount > 999999999.99
       OR v_payment_method NOT IN ('cash', 'qr_pay', 'card', 'transfer', 'panel') THEN
      RAISE EXCEPTION 'INVALID_PAYMENT_BOUNDS' USING ERRCODE = '22023';
    END IF;

    PERFORM 1
    FROM public.payments p
    WHERE p.id = v_payment_id
      AND p.queue_entry_id = p_queue_entry_id
      AND p.deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PAYMENT_NOT_IN_VISIT' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  SELECT count(*)
    INTO v_existing_count
  FROM public.payments p
  WHERE p.queue_entry_id = p_queue_entry_id
    AND p.deleted_at IS NULL;
  IF v_existing_count <> jsonb_array_length(p_payments) THEN
    RAISE EXCEPTION 'PAYMENT_SET_MISMATCH' USING ERRCODE = '22023';
  END IF;

  -- Existing item edits are deliberately limited to billing fields and a
  -- soft-delete marker. dispensed_qty and all clinical/inventory columns stay
  -- immutable through this boundary.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    IF v_item->>'id' IS NULL THEN
      CONTINUE;
    END IF;
    v_item_id := (v_item->>'id')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;
    v_price := round((v_item->>'price')::numeric, 2);

    IF (v_item->>'remove')::boolean THEN
      UPDATE public.consultation_items
      SET deleted_at = now(),
          deleted_by = auth.uid()
      WHERE id = v_item_id
        AND consultation_id = v_consultation_id
        AND deleted_at IS NULL;
    ELSE
      UPDATE public.consultation_items
      SET quantity = v_quantity::integer,
          price = v_price
      WHERE id = v_item_id
        AND consultation_id = v_consultation_id
        AND deleted_at IS NULL;
    END IF;
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    IF v_item->>'id' IS NOT NULL THEN
      CONTINUE;
    END IF;
    v_charge_type_id := (v_item->>'charge_type_id')::uuid;
    SELECT cct.name
      INTO STRICT v_charge_name
    FROM public.clinic_charge_types cct
    WHERE cct.id = v_charge_type_id
      AND cct.is_active;

    INSERT INTO public.consultation_items (
      consultation_id,
      item_name,
      quantity,
      price,
      unit_cost,
      billing_adjustment_kind,
      clinic_charge_type_id
    )
    VALUES (
      v_consultation_id,
      v_charge_name,
      (v_item->>'quantity')::integer,
      round((v_item->>'price')::numeric, 2),
      0,
      'other_charge',
      v_charge_type_id
    );
  END LOOP;

  UPDATE public.consultation_items
  SET deleted_at = now(),
      deleted_by = auth.uid()
  WHERE consultation_id = v_consultation_id
    AND deleted_at IS NULL
    AND billing_adjustment_kind IN ('discount', 'tax');

  SELECT COALESCE(SUM(round(ci.price * ci.quantity, 2)), 0)
    INTO v_subtotal
  FROM public.consultation_items ci
  WHERE ci.consultation_id = v_consultation_id
    AND ci.deleted_at IS NULL
    AND (
      ci.billing_adjustment_kind IS NULL
      OR ci.billing_adjustment_kind = 'other_charge'
    );

  v_discount_rm := LEAST(round(p_discount_rm, 2), round(v_subtotal, 2));
  v_tax_pct := round(p_tax_pct, 4);
  v_tax_rm := round((v_subtotal - v_discount_rm) * v_tax_pct / 100, 2);
  v_total := round(v_subtotal - v_discount_rm + v_tax_rm, 2);
  IF v_total > 99999999.99 THEN
    RAISE EXCEPTION 'BILL_TOTAL_OUT_OF_RANGE' USING ERRCODE = '22003';
  END IF;

  IF v_discount_rm > 0 THEN
    INSERT INTO public.consultation_items (
      consultation_id,
      item_name,
      quantity,
      price,
      unit_cost,
      billing_adjustment_kind
    )
    VALUES (
      v_consultation_id,
      'Discount',
      1,
      -v_discount_rm,
      0,
      'discount'
    );
  END IF;

  IF v_tax_rm > 0 THEN
    INSERT INTO public.consultation_items (
      consultation_id,
      item_name,
      quantity,
      price,
      unit_cost,
      billing_adjustment_kind
    )
    VALUES (
      v_consultation_id,
      'Tax',
      1,
      v_tax_rm,
      0,
      'tax'
    );
  END IF;

  FOR v_payment IN SELECT value FROM jsonb_array_elements(p_payments)
  LOOP
    v_payment_id := (v_payment->>'id')::uuid;
    v_amount := round((v_payment->>'amount')::numeric, 2);
    v_payment_method := trim(v_payment->>'payment_method');

    UPDATE public.payments
    SET amount = v_amount,
        payment_method = v_payment_method,
        notes = concat_ws(
          E'\n',
          nullif(notes, ''),
          'Completed bill corrected: ' || trim(p_reason)
        )
    WHERE id = v_payment_id
      AND queue_entry_id = p_queue_entry_id
      AND deleted_at IS NULL;
  END LOOP;

  -- The existing helper creates a missing panel claim, while this update
  -- intentionally reconciles every status and changes amount only.
  PERFORM public.ensure_panel_claim_for_queue(p_queue_entry_id);
  SELECT pc.id
    INTO v_claim_id
  FROM public.panel_claims pc
  WHERE pc.queue_entry_id = p_queue_entry_id
  ORDER BY pc.id
  LIMIT 1;
  v_panel_eligible_total := GREATEST(v_total, 0);
  IF v_claim_id IS NOT NULL THEN
    UPDATE public.panel_claims
    SET amount = v_panel_eligible_total
    WHERE id = v_claim_id
      AND queue_entry_id = p_queue_entry_id;
  END IF;

  v_after_state := public.completed_bill_correction_state(
    p_queue_entry_id,
    v_consultation_id
  );
  v_new_fingerprint := md5(
    jsonb_build_object(
      'items', COALESCE(v_after_state->'items', '[]'::jsonb),
      'payments', COALESCE(v_after_state->'payments', '[]'::jsonb),
      'panel_claim', v_after_state->'panel_claim'
    )::text
  );
  v_after_state := v_after_state || jsonb_build_object(
    'fingerprint',
    v_new_fingerprint
  );

  INSERT INTO public.completed_bill_correction_audit (
    queue_entry_id,
    consultation_id,
    actor_id,
    reason,
    before_state,
    after_state
  )
  VALUES (
    p_queue_entry_id,
    v_consultation_id,
    auth.uid(),
    trim(p_reason),
    v_before_state,
    v_after_state
  )
  RETURNING id INTO v_audit_id;

  RETURN v_after_state || jsonb_build_object('audit_id', v_audit_id);
END;
$function$;

ALTER FUNCTION public.correct_completed_bill(
  uuid, text, text, jsonb, jsonb, numeric, numeric
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.correct_completed_bill(
  uuid, text, text, jsonb, jsonb, numeric, numeric
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.correct_completed_bill(
  uuid, text, text, jsonb, jsonb, numeric, numeric
) FROM anon;
GRANT EXECUTE ON FUNCTION public.correct_completed_bill(
  uuid, text, text, jsonb, jsonb, numeric, numeric
) TO authenticated;

-- Raw edits remain available for normal in-progress clinical workflows, but a
-- completed visit can only pass through the audited correction RPC above.
DROP POLICY IF EXISTS "consultation_items_update_active"
  ON public.consultation_items;
DROP POLICY IF EXISTS "consultation_items_ops_update"
  ON public.consultation_items;
DROP POLICY IF EXISTS "consultation_items_staff_update_active"
  ON public.consultation_items;
CREATE POLICY "consultation_items_noncompleted_update"
  ON public.consultation_items
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND public.can_edit_dispensary_prices(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.consultations c
      JOIN public.queue_entries qe ON qe.id = c.queue_entry_id
      WHERE c.id = consultation_items.consultation_id
        AND c.deleted_at IS NULL
        AND qe.deleted_at IS NULL
        AND c.status <> 'completed'
        AND qe.clinic_status <> 'completed'
    )
  )
  WITH CHECK (
    public.can_edit_dispensary_prices(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.consultations c
      JOIN public.queue_entries qe ON qe.id = c.queue_entry_id
      WHERE c.id = consultation_items.consultation_id
        AND c.deleted_at IS NULL
        AND qe.deleted_at IS NULL
        AND c.status <> 'completed'
        AND qe.clinic_status <> 'completed'
    )
  );

DROP POLICY IF EXISTS "consultation_items_staff_insert"
  ON public.consultation_items;
DROP POLICY IF EXISTS "consultation_items_ops_insert"
  ON public.consultation_items;
CREATE POLICY "consultation_items_noncompleted_insert"
  ON public.consultation_items
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_staff_or_clinical(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.consultations c
      JOIN public.queue_entries qe ON qe.id = c.queue_entry_id
      WHERE c.id = consultation_items.consultation_id
        AND c.deleted_at IS NULL
        AND qe.deleted_at IS NULL
        AND c.status <> 'completed'
        AND qe.clinic_status <> 'completed'
    )
  );

DROP POLICY IF EXISTS "payments_update_active" ON public.payments;
DROP POLICY IF EXISTS "payments_ops_update" ON public.payments;
CREATE POLICY "payments_noncompleted_update"
  ON public.payments
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND public.is_staff_or_admin(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.queue_entries qe
      WHERE qe.id = payments.queue_entry_id
        AND qe.deleted_at IS NULL
        AND qe.clinic_status <> 'completed'
    )
  )
  WITH CHECK (
    public.is_staff_or_admin(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.queue_entries qe
      WHERE qe.id = payments.queue_entry_id
        AND qe.deleted_at IS NULL
        AND qe.clinic_status <> 'completed'
    )
  );

DO $postflight$
DECLARE
  v_context oid :=
    to_regprocedure('public.get_completed_bill_correction_context(uuid)');
  v_correction oid :=
    to_regprocedure(
      'public.correct_completed_bill(uuid,text,text,jsonb,jsonb,numeric,numeric)'
    );
  v_context_config text[];
  v_correction_config text[];
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'completed_bill_correction_audit'
      AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'POSTFLIGHT_AUDIT_RLS_DISABLED';
  END IF;

  IF v_context IS NULL OR v_correction IS NULL THEN
    RAISE EXCEPTION 'POSTFLIGHT_CORRECTION_RPC_MISSING';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    CROSS JOIN LATERAL aclexplode(
      COALESCE(p.proacl, acldefault('f', p.proowner))
    ) acl
    WHERE p.oid IN (v_context, v_correction)
      AND acl.grantee = 0
      AND acl.privilege_type = 'EXECUTE'
  ) OR has_function_privilege('anon', v_context, 'EXECUTE')
     OR has_function_privilege('anon', v_correction, 'EXECUTE') THEN
    RAISE EXCEPTION 'POSTFLIGHT_PUBLIC_RPC_EXECUTE';
  END IF;

  IF NOT has_function_privilege('authenticated', v_context, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_correction, 'EXECUTE') THEN
    RAISE EXCEPTION 'POSTFLIGHT_AUTHENTICATED_RPC_EXECUTE_MISSING';
  END IF;

  SELECT p.proconfig
    INTO v_correction_config
  FROM pg_proc p
  WHERE p.oid = v_correction
    AND p.prosecdef;
  IF NOT FOUND
     OR NOT (
       'search_path=public, pg_temp' = ANY(COALESCE(v_correction_config, ARRAY[]::text[]))
     ) THEN
    RAISE EXCEPTION 'POSTFLIGHT_CORRECTION_RPC_NOT_HARDENED';
  END IF;

  SELECT p.proconfig
    INTO v_context_config
  FROM pg_proc p
  WHERE p.oid = v_context
    AND p.prosecdef;
  IF NOT FOUND
     OR NOT (
       'search_path=public, pg_temp' = ANY(COALESCE(v_context_config, ARRAY[]::text[]))
     ) THEN
    RAISE EXCEPTION 'POSTFLIGHT_CONTEXT_RPC_NOT_HARDENED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename IN ('payments', 'consultation_items')
      AND p.cmd = 'UPDATE'
      AND (
        p.qual IS NULL
        OR p.qual NOT ILIKE '%clinic_status%'
        OR p.qual NOT ILIKE '%completed%'
      )
  ) THEN
    RAISE EXCEPTION 'POSTFLIGHT_RAW_COMPLETED_UPDATE_POLICY';
  END IF;
END;
$postflight$;
