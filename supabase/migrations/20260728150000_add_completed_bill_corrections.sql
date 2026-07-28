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

-- PostgreSQL POSIX character classes depend on the database locale for
-- non-ASCII characters. Build the Unicode whitespace set explicitly so the
-- stored reason invariant is identical under C and Unicode-aware collations.
CREATE OR REPLACE FUNCTION public.normalize_completed_bill_correction_reason(
  _reason text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_temp
AS $function$
  SELECT btrim(
    regexp_replace(
      coalesce(_reason, ''),
      '['
        || chr(9) || chr(10) || chr(11) || chr(12) || chr(13) || chr(32)
        || chr(133) || chr(160) || chr(5760)
        || chr(8192) || chr(8193) || chr(8194) || chr(8195)
        || chr(8196) || chr(8197) || chr(8198) || chr(8199)
        || chr(8200) || chr(8201) || chr(8202)
        || chr(8232) || chr(8233) || chr(8239) || chr(8287)
        || chr(12288) || chr(65279)
        || ']+',
      ' ',
      'g'
    )
  );
$function$;

ALTER FUNCTION public.normalize_completed_bill_correction_reason(text)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION
  public.normalize_completed_bill_correction_reason(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION
  public.normalize_completed_bill_correction_reason(text) FROM anon;
REVOKE ALL ON FUNCTION
  public.normalize_completed_bill_correction_reason(text) FROM authenticated;

CREATE TABLE public.completed_bill_correction_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_entry_id uuid NOT NULL REFERENCES public.queue_entries(id),
  consultation_id uuid NOT NULL REFERENCES public.consultations(id),
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  reason text NOT NULL CHECK (
    length(public.normalize_completed_bill_correction_reason(reason)) >= 3
    AND reason = public.normalize_completed_bill_correction_reason(reason)
  ),
  before_state jsonb NOT NULL,
  after_state jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX completed_bill_correction_audit_queue_created_idx
  ON public.completed_bill_correction_audit (queue_entry_id, created_at DESC);
CREATE INDEX completed_bill_correction_audit_consultation_created_idx
  ON public.completed_bill_correction_audit (consultation_id, created_at DESC);

ALTER TABLE public.completed_bill_correction_audit ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.completed_bill_correction_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.completed_bill_correction_audit TO authenticated;

CREATE POLICY "completed_bill_correction_audit_admin_read"
  ON public.completed_bill_correction_audit
  FOR SELECT TO authenticated
  USING (public.is_ops_or_admin(auth.uid()));

-- This owner-only table is a capability scoped to one database transaction,
-- backend, consultation, and authenticated actor. Client roles cannot create a
-- guard row, so another SECURITY DEFINER path cannot impersonate this RPC.
CREATE TABLE public.completed_bill_correction_guard (
  transaction_id bigint NOT NULL,
  backend_pid integer NOT NULL,
  consultation_id uuid NOT NULL REFERENCES public.consultations(id),
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  PRIMARY KEY (
    transaction_id,
    backend_pid,
    consultation_id,
    actor_id
  )
);

ALTER TABLE public.completed_bill_correction_guard ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.completed_bill_correction_guard FROM PUBLIC, anon, authenticated;

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

-- Every consultation-item statement, checkout, and completed-bill correction
-- takes this transaction lock before any row lock. A statement-level trigger is
-- necessary because a row-level BEFORE trigger runs after UPDATE has locked the
-- item row, which would invert checkout's queue-first order. The fixed key
-- serializes this rare financial boundary globally and avoids key collisions.
CREATE OR REPLACE FUNCTION public.lock_completed_bill_item_mutation_boundary()
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT pg_advisory_xact_lock(17291, 20260728);
$function$;

ALTER FUNCTION public.lock_completed_bill_item_mutation_boundary()
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.lock_completed_bill_item_mutation_boundary()
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lock_completed_bill_item_mutation_boundary()
  FROM anon;
REVOKE ALL ON FUNCTION public.lock_completed_bill_item_mutation_boundary()
  FROM authenticated;

CREATE OR REPLACE FUNCTION public.serialize_consultation_item_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  PERFORM public.lock_completed_bill_item_mutation_boundary();
  RETURN NULL;
END;
$function$;

ALTER FUNCTION public.serialize_consultation_item_mutation() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.serialize_consultation_item_mutation()
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.serialize_consultation_item_mutation()
  FROM anon;
REVOKE ALL ON FUNCTION public.serialize_consultation_item_mutation()
  FROM authenticated;

DROP TRIGGER IF EXISTS serialize_consultation_item_mutation
  ON public.consultation_items;
CREATE TRIGGER serialize_consultation_item_mutation
  BEFORE INSERT OR UPDATE ON public.consultation_items
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.serialize_consultation_item_mutation();

-- Checkout historically locked the queue before inserting optional item rows.
-- Acquire the shared statement boundary first so checkout and every item writer
-- cannot interleave. Parent locks inside the row guard remain queue then
-- consultation, matching checkout and correction.
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

-- The compact billing dialog has no item-creation payload, so keep its active
-- checkout path narrow: lock the complete visit, record exactly one tender
-- row (including the existing zero-amount panel marker), and complete both
-- parents in the same transaction.
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
  IF NOT public.is_staff_or_admin(auth.uid()) THEN
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

  -- Global statement boundary first, then the same deterministic parent/item/
  -- payment order used by the other completed-bill mutation paths.
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

-- Existing SECURITY DEFINER dispensary helpers bypass RLS. This table trigger
-- therefore makes the correction guard the mandatory boundary for every
-- completed consultation-item insert or update, regardless of the calling path.
CREATE OR REPLACE FUNCTION public.guard_completed_bill_item_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_queue_entry_id uuid;
  v_consultation_status text;
  v_queue_status text;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.consultation_id IS DISTINCT FROM NEW.consultation_id THEN
    RAISE EXCEPTION 'CONSULTATION_ITEM_REPARENT_FORBIDDEN'
      USING ERRCODE = '42501';
  END IF;

  -- Resolve without deleted filters: soft deletion must never reopen a
  -- completed bill to legacy SECURITY DEFINER helpers.
  SELECT c.queue_entry_id
    INTO v_queue_entry_id
  FROM public.consultations c
  WHERE c.id = NEW.consultation_id;
  IF NOT FOUND OR v_queue_entry_id IS NULL THEN
    RAISE EXCEPTION 'CONSULTATION_ITEM_PARENT_STATE_UNRESOLVED'
      USING ERRCODE = '23503';
  END IF;

  -- Parent lock order is queue then consultation, matching checkout and the
  -- correction RPC. The statement advisory lock was already taken before the
  -- item row, so this cannot deadlock against their parent-first row locks.
  SELECT qe.clinic_status
    INTO v_queue_status
  FROM public.queue_entries qe
  WHERE qe.id = v_queue_entry_id
  FOR UPDATE;
  IF NOT FOUND OR v_queue_status IS NULL THEN
    RAISE EXCEPTION 'CONSULTATION_ITEM_PARENT_STATE_UNRESOLVED'
      USING ERRCODE = '23503';
  END IF;

  SELECT c.status
    INTO v_consultation_status
  FROM public.consultations c
  WHERE c.id = NEW.consultation_id
    AND c.queue_entry_id = v_queue_entry_id
  FOR UPDATE;
  IF NOT FOUND OR v_consultation_status IS NULL THEN
    RAISE EXCEPTION 'CONSULTATION_ITEM_PARENT_STATE_UNRESOLVED'
      USING ERRCODE = '23503';
  END IF;

  IF v_consultation_status = 'completed'
     OR v_queue_status = 'completed' THEN
    IF v_consultation_status IS DISTINCT FROM 'completed'
       OR v_queue_status IS DISTINCT FROM 'completed'
       OR NOT public.can_correct_completed_bill(auth.uid())
       OR NOT EXISTS (
         SELECT 1
         FROM public.completed_bill_correction_guard guard_row
         WHERE guard_row.transaction_id = txid_current()
           AND guard_row.backend_pid = pg_backend_pid()
           AND guard_row.consultation_id = NEW.consultation_id
           AND guard_row.actor_id = auth.uid()
       ) THEN
      RAISE EXCEPTION 'COMPLETED_BILL_CORRECTION_REQUIRED'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

ALTER FUNCTION public.guard_completed_bill_item_mutation() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.guard_completed_bill_item_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_completed_bill_item_mutation() FROM anon;
REVOKE ALL ON FUNCTION public.guard_completed_bill_item_mutation()
  FROM authenticated;

DROP TRIGGER IF EXISTS guard_completed_bill_item_mutation
  ON public.consultation_items;
CREATE TRIGGER guard_completed_bill_item_mutation
  BEFORE INSERT OR UPDATE ON public.consultation_items
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_completed_bill_item_mutation();

-- The legacy allocation trigger predates completed-bill corrections. A guarded
-- correction must not reserve/release inventory that checkout already committed.
CREATE OR REPLACE FUNCTION public.trg_consultation_items_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_item_id uuid;
  v_old_item_id uuid;
  v_diff integer;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.completed_bill_correction_guard guard_row
    JOIN public.consultations c
      ON c.id = guard_row.consultation_id
    JOIN public.queue_entries qe ON qe.id = c.queue_entry_id
    WHERE guard_row.transaction_id = txid_current()
      AND guard_row.backend_pid = pg_backend_pid()
      AND guard_row.consultation_id = NEW.consultation_id
      AND guard_row.actor_id = auth.uid()
      AND public.can_correct_completed_bill(auth.uid())
      AND c.status = 'completed'
      AND qe.clinic_status = 'completed'
  ) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.deleted_at IS NULL THEN
      v_item_id := public._resolve_inventory_item_id(NEW.item_name);
      IF v_item_id IS NOT NULL THEN
        PERFORM public.reserve_inventory(v_item_id, NEW.quantity);
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      v_item_id := public._resolve_inventory_item_id(OLD.item_name);
      IF v_item_id IS NOT NULL THEN
        PERFORM public.release_inventory(v_item_id, OLD.quantity);
      END IF;
      RETURN NEW;
    END IF;

    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NULL THEN
      IF OLD.item_name = NEW.item_name THEN
        v_item_id := public._resolve_inventory_item_id(NEW.item_name);
        IF v_item_id IS NOT NULL THEN
          v_diff := NEW.quantity - OLD.quantity;
          IF v_diff > 0 THEN
            PERFORM public.reserve_inventory(v_item_id, v_diff);
          ELSIF v_diff < 0 THEN
            PERFORM public.release_inventory(v_item_id, -v_diff);
          END IF;
        END IF;
      ELSE
        v_old_item_id := public._resolve_inventory_item_id(OLD.item_name);
        IF v_old_item_id IS NOT NULL THEN
          PERFORM public.release_inventory(v_old_item_id, OLD.quantity);
        END IF;
        v_item_id := public._resolve_inventory_item_id(NEW.item_name);
        IF v_item_id IS NOT NULL THEN
          PERFORM public.reserve_inventory(v_item_id, NEW.quantity);
        END IF;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$;

ALTER FUNCTION public.trg_consultation_items_inventory() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.trg_consultation_items_inventory() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_consultation_items_inventory() FROM anon;
REVOKE ALL ON FUNCTION public.trg_consultation_items_inventory() FROM authenticated;

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
  v_reason text;
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
  v_reason := public.normalize_completed_bill_correction_reason(p_reason);
  IF length(v_reason) < 3 THEN
    RAISE EXCEPTION 'CORRECTION_REASON_REQUIRED' USING ERRCODE = '22023';
  END IF;

  PERFORM public.lock_completed_bill_item_mutation_boundary();

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

  -- UUID text is case-insensitive after casting; duplicate and coverage checks
  -- must therefore operate on canonical UUID values, not raw JSON strings.
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT (element->>'id')::uuid AS id
      FROM jsonb_array_elements(p_payments) element
      GROUP BY (element->>'id')::uuid
      HAVING count(*) > 1
    ) duplicates
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_PAYMENT_ID' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)
    INTO v_existing_count
  FROM public.payments p
  WHERE p.queue_entry_id = p_queue_entry_id
    AND p.deleted_at IS NULL;
  IF v_existing_count <> jsonb_array_length(p_payments)
     OR EXISTS (
       SELECT 1
       FROM public.payments p
       WHERE p.queue_entry_id = p_queue_entry_id
         AND p.deleted_at IS NULL
         AND NOT EXISTS (
           SELECT 1
           FROM jsonb_array_elements(p_payments) element
           WHERE (element->>'id')::uuid = p.id
         )
     ) THEN
    RAISE EXCEPTION 'PAYMENT_SET_MISMATCH' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.completed_bill_correction_guard (
    transaction_id,
    backend_pid,
    consultation_id,
    actor_id
  )
  VALUES (
    txid_current(),
    pg_backend_pid(),
    v_consultation_id,
    auth.uid()
  );

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

  DELETE FROM public.completed_bill_correction_guard
  WHERE transaction_id = txid_current()
    AND backend_pid = pg_backend_pid()
    AND consultation_id = v_consultation_id
    AND actor_id = auth.uid();

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
          'Completed bill corrected: ' || v_reason
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
    v_reason,
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
    AND billing_adjustment_kind IS NULL
    AND clinic_charge_type_id IS NULL
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
    billing_adjustment_kind IS NULL
    AND clinic_charge_type_id IS NULL
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
  );

DROP POLICY IF EXISTS "consultation_items_staff_insert"
  ON public.consultation_items;
DROP POLICY IF EXISTS "consultation_items_ops_insert"
  ON public.consultation_items;
CREATE POLICY "consultation_items_noncompleted_insert"
  ON public.consultation_items
  FOR INSERT TO authenticated
  WITH CHECK (
    billing_adjustment_kind IS NULL
    AND clinic_charge_type_id IS NULL
    AND public.is_staff_or_clinical(auth.uid())
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
  v_checkout oid :=
    to_regprocedure(
      'public.checkout_visit(uuid,uuid,numeric,numeric,text,text,uuid,jsonb,text)'
    );
  v_active_payment_checkout oid :=
    to_regprocedure(
      'public.record_payment_and_complete_visit(uuid,uuid,text,text,numeric,text)'
    );
  v_boundary_lock oid :=
    to_regprocedure('public.lock_completed_bill_item_mutation_boundary()');
  v_item_serializer oid :=
    to_regprocedure('public.serialize_consultation_item_mutation()');
  v_item_guard oid :=
    to_regprocedure('public.guard_completed_bill_item_mutation()');
  v_inventory_trigger oid :=
    to_regprocedure('public.trg_consultation_items_inventory()');
  v_context_config text[];
  v_correction_config text[];
  v_active_payment_checkout_config text[];
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

  IF v_context IS NULL
     OR v_correction IS NULL
     OR v_checkout IS NULL
     OR v_active_payment_checkout IS NULL THEN
    RAISE EXCEPTION 'POSTFLIGHT_CORRECTION_RPC_MISSING';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'completed_bill_correction_guard'
      AND c.relrowsecurity
  ) OR has_table_privilege(
    'anon',
    'public.completed_bill_correction_guard',
    'SELECT, INSERT, UPDATE, DELETE, TRUNCATE'
  ) OR has_table_privilege(
    'authenticated',
    'public.completed_bill_correction_guard',
    'SELECT, INSERT, UPDATE, DELETE, TRUNCATE'
  ) THEN
    RAISE EXCEPTION 'POSTFLIGHT_CORRECTION_GUARD_EXPOSED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class c
    CROSS JOIN LATERAL aclexplode(
      COALESCE(c.relacl, acldefault('r', c.relowner))
    ) acl
    WHERE c.oid = 'public.completed_bill_correction_audit'::regclass
      AND acl.grantee = 0
      AND acl.privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
  ) OR has_table_privilege(
    'anon',
    'public.completed_bill_correction_audit',
    'INSERT'
  ) OR has_table_privilege(
    'anon',
    'public.completed_bill_correction_audit',
    'UPDATE'
  ) OR has_table_privilege(
    'anon',
    'public.completed_bill_correction_audit',
    'DELETE'
  ) OR has_table_privilege(
    'anon',
    'public.completed_bill_correction_audit',
    'TRUNCATE'
  ) OR has_table_privilege(
    'authenticated',
    'public.completed_bill_correction_audit',
    'INSERT'
  ) OR has_table_privilege(
    'authenticated',
    'public.completed_bill_correction_audit',
    'UPDATE'
  ) OR has_table_privilege(
    'authenticated',
    'public.completed_bill_correction_audit',
    'DELETE'
  ) OR has_table_privilege(
    'authenticated',
    'public.completed_bill_correction_audit',
    'TRUNCATE'
  ) THEN
    RAISE EXCEPTION 'POSTFLIGHT_AUDIT_MUTATION_PRIVILEGE';
  END IF;

  IF NOT has_table_privilege(
    'authenticated',
    'public.completed_bill_correction_audit',
    'SELECT'
  ) THEN
    RAISE EXCEPTION 'POSTFLIGHT_AUDIT_SELECT_MISSING';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    CROSS JOIN LATERAL aclexplode(
      COALESCE(p.proacl, acldefault('f', p.proowner))
    ) acl
    WHERE p.oid IN (v_context, v_correction, v_active_payment_checkout)
      AND acl.grantee = 0
      AND acl.privilege_type = 'EXECUTE'
  ) OR has_function_privilege('anon', v_context, 'EXECUTE')
     OR has_function_privilege('anon', v_correction, 'EXECUTE')
     OR has_function_privilege(
       'anon',
       v_active_payment_checkout,
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'POSTFLIGHT_PUBLIC_RPC_EXECUTE';
  END IF;

  IF NOT has_function_privilege('authenticated', v_context, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_correction, 'EXECUTE')
     OR NOT has_function_privilege(
       'authenticated',
       v_active_payment_checkout,
       'EXECUTE'
     ) THEN
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

  SELECT p.proconfig
    INTO v_active_payment_checkout_config
  FROM pg_proc p
  WHERE p.oid = v_active_payment_checkout
    AND p.prosecdef;
  IF NOT FOUND
     OR NOT (
       'search_path=public, pg_temp' = ANY(
         COALESCE(v_active_payment_checkout_config, ARRAY[]::text[])
       )
     )
     OR pg_get_functiondef(v_active_payment_checkout) NOT ILIKE
       '%lock_completed_bill_item_mutation_boundary()%'
     OR strpos(
       lower(pg_get_functiondef(v_active_payment_checkout)),
       'lock_completed_bill_item_mutation_boundary()'
     ) > strpos(
       lower(pg_get_functiondef(v_active_payment_checkout)),
       'insert into public.payments'
     ) THEN
    RAISE EXCEPTION 'POSTFLIGHT_ACTIVE_PAYMENT_CHECKOUT_NOT_HARDENED';
  END IF;

  IF v_inventory_trigger IS NULL
     OR pg_get_functiondef(v_inventory_trigger) NOT ILIKE
       '%completed_bill_correction_guard%'
     OR pg_get_functiondef(v_inventory_trigger) NOT ILIKE
       '%can_correct_completed_bill(auth.uid())%'
     OR pg_get_functiondef(v_inventory_trigger) ILIKE '%c.deleted_at%'
     OR pg_get_functiondef(v_inventory_trigger) ILIKE '%qe.deleted_at%'
     OR NOT EXISTS (
       SELECT 1
       FROM pg_trigger t
       WHERE t.tgrelid = 'public.consultation_items'::regclass
         AND t.tgname = 'consultation_items_inventory_aiu'
         AND t.tgfoid = v_inventory_trigger
         AND NOT t.tgisinternal
         AND t.tgenabled <> 'D'
     ) THEN
    RAISE EXCEPTION 'POSTFLIGHT_INVENTORY_GUARD_MISSING';
  END IF;

  IF v_boundary_lock IS NULL
     OR pg_get_functiondef(v_boundary_lock) NOT ILIKE
       '%pg_advisory_xact_lock(17291, 20260728)%'
     OR v_item_serializer IS NULL
     OR pg_get_functiondef(v_item_serializer) NOT ILIKE
       '%lock_completed_bill_item_mutation_boundary()%'
     OR pg_get_functiondef(v_checkout) NOT ILIKE
       '%lock_completed_bill_item_mutation_boundary()%'
     OR pg_get_functiondef(v_active_payment_checkout) NOT ILIKE
       '%lock_completed_bill_item_mutation_boundary()%'
     OR pg_get_functiondef(v_correction) NOT ILIKE
       '%lock_completed_bill_item_mutation_boundary()%'
     OR NOT EXISTS (
       SELECT 1
       FROM pg_trigger t
       WHERE t.tgrelid = 'public.consultation_items'::regclass
         AND t.tgname = 'serialize_consultation_item_mutation'
         AND t.tgfoid = v_item_serializer
         AND (t.tgtype & 1) = 0
         AND NOT t.tgisinternal
         AND t.tgenabled <> 'D'
     ) THEN
    RAISE EXCEPTION 'POSTFLIGHT_ITEM_MUTATION_SERIALIZATION_MISSING';
  END IF;

  IF v_item_guard IS NULL
     OR pg_get_functiondef(v_item_guard) NOT ILIKE
       '%COMPLETED_BILL_CORRECTION_REQUIRED%'
     OR pg_get_functiondef(v_item_guard) NOT ILIKE
       '%completed_bill_correction_guard%'
     OR pg_get_functiondef(v_item_guard) NOT ILIKE '%FOR UPDATE%'
     OR pg_get_functiondef(v_item_guard) ILIKE '%c.deleted_at%'
     OR pg_get_functiondef(v_item_guard) ILIKE '%qe.deleted_at%'
     OR NOT EXISTS (
       SELECT 1
       FROM pg_trigger t
       WHERE t.tgrelid = 'public.consultation_items'::regclass
         AND t.tgname = 'guard_completed_bill_item_mutation'
         AND t.tgfoid = v_item_guard
         AND NOT t.tgisinternal
         AND t.tgenabled <> 'D'
     ) THEN
    RAISE EXCEPTION 'POSTFLIGHT_COMPLETED_ITEM_GUARD_MISSING';
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

  IF EXISTS (
    SELECT 1
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = 'consultation_items'
      AND p.cmd = 'UPDATE'
      AND (
        p.qual IS NULL
        OR p.qual NOT ILIKE '%billing_adjustment_kind%'
        OR p.qual NOT ILIKE '%clinic_charge_type_id%'
        OR p.with_check IS NULL
        OR p.with_check NOT ILIKE '%billing_adjustment_kind%'
        OR p.with_check NOT ILIKE '%clinic_charge_type_id%'
      )
  ) OR EXISTS (
    SELECT 1
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = 'consultation_items'
      AND p.cmd = 'INSERT'
      AND (
        p.with_check IS NULL
        OR p.with_check NOT ILIKE '%billing_adjustment_kind%'
        OR p.with_check NOT ILIKE '%clinic_charge_type_id%'
      )
  ) THEN
    RAISE EXCEPTION 'POSTFLIGHT_RAW_ADJUSTMENT_POLICY';
  END IF;
END;
$postflight$;
