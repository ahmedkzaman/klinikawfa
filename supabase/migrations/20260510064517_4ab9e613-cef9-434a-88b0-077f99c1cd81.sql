-- ============================================================
-- Smart Pharmacy: Batch Tracking, FEFO & Partial Dispensing
-- ============================================================

-- ---------- 1. inventory_item_batches ----------
CREATE TABLE public.inventory_item_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  batch_number text NOT NULL,
  expiry_date date NOT NULL,
  quantity_initial integer NOT NULL CHECK (quantity_initial >= 0),
  quantity_remaining integer NOT NULL CHECK (quantity_remaining >= 0),
  cost_price numeric(10,2),
  received_at timestamptz NOT NULL DEFAULT now(),
  received_by uuid,
  po_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_iib_item_expiry_active
  ON public.inventory_item_batches (inventory_item_id, expiry_date ASC)
  WHERE quantity_remaining > 0;

CREATE INDEX idx_iib_item ON public.inventory_item_batches (inventory_item_id);

CREATE TRIGGER trg_iib_updated_at
  BEFORE UPDATE ON public.inventory_item_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.inventory_item_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_can_view_batches" ON public.inventory_item_batches
  FOR SELECT TO authenticated
  USING (public.is_staff_or_admin(auth.uid()));

-- Writes go through SECURITY DEFINER RPCs only.

-- ---------- 2. inventory_transactions ----------
CREATE TABLE public.inventory_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  batch_id uuid REFERENCES public.inventory_item_batches(id) ON DELETE SET NULL,
  transaction_type text NOT NULL CHECK (transaction_type IN
    ('restock','dispense','adjustment','return','write-off','expire','owe_slip_fulfilled')),
  qty_change integer NOT NULL,
  consultation_item_id uuid,
  consultation_id uuid REFERENCES public.consultations(id) ON DELETE SET NULL,
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  reason_code text,
  notes text,
  performed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_invtx_item_created ON public.inventory_transactions (inventory_item_id, created_at DESC);
CREATE INDEX idx_invtx_consultation ON public.inventory_transactions (consultation_id);
CREATE INDEX idx_invtx_batch ON public.inventory_transactions (batch_id);

ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_can_view_invtx" ON public.inventory_transactions
  FOR SELECT TO authenticated
  USING (public.is_staff_or_admin(auth.uid()));

-- ---------- 3. pharmacy_owe_slips ----------
CREATE TABLE public.pharmacy_owe_slips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_item_id uuid NOT NULL UNIQUE,
  consultation_id uuid REFERENCES public.consultations(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  qty_owed integer NOT NULL CHECK (qty_owed > 0),
  qty_fulfilled integer NOT NULL DEFAULT 0 CHECK (qty_fulfilled >= 0),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','partially_fulfilled','fulfilled','cancelled')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  closed_at timestamptz,
  closed_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_owe_status ON public.pharmacy_owe_slips (status);
CREATE INDEX idx_owe_item ON public.pharmacy_owe_slips (inventory_item_id) WHERE status IN ('open','partially_fulfilled');
CREATE INDEX idx_owe_patient ON public.pharmacy_owe_slips (patient_id);

CREATE TRIGGER trg_owe_updated_at
  BEFORE UPDATE ON public.pharmacy_owe_slips
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.pharmacy_owe_slips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_can_view_owe" ON public.pharmacy_owe_slips
  FOR SELECT TO authenticated
  USING (public.is_staff_or_admin(auth.uid()));

-- ---------- 4. restock_requests ----------
CREATE TABLE public.restock_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  requested_by uuid,
  reason text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  closed_by uuid
);

CREATE INDEX idx_restock_item_open ON public.restock_requests (inventory_item_id) WHERE status = 'open';

ALTER TABLE public.restock_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_view_restock" ON public.restock_requests
  FOR SELECT TO authenticated USING (public.is_staff_or_admin(auth.uid()));

CREATE POLICY "staff_insert_restock" ON public.restock_requests
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff_or_admin(auth.uid()) AND requested_by = auth.uid());

CREATE POLICY "admin_update_restock" ON public.restock_requests
  FOR UPDATE TO authenticated USING (public.is_ops_or_admin(auth.uid()));

-- ---------- 5. consultation_items extensions ----------
ALTER TABLE public.consultation_items
  ADD COLUMN dispensed_qty integer,
  ADD COLUMN partial_reason text
    CHECK (partial_reason IS NULL OR partial_reason IN ('patient_request','out_of_stock')),
  ADD COLUMN is_partial boolean GENERATED ALWAYS AS
    (dispensed_qty IS NOT NULL AND dispensed_qty < quantity) STORED;

-- Enforce reason whenever partial
ALTER TABLE public.consultation_items
  ADD CONSTRAINT chk_ci_partial_reason
  CHECK (
    dispensed_qty IS NULL
    OR dispensed_qty >= quantity
    OR partial_reason IS NOT NULL
  );

-- ---------- 6. RPCs ----------

-- 6a. Add a batch
CREATE OR REPLACE FUNCTION public.add_inventory_batch(
  _item_id uuid,
  _batch_number text,
  _expiry date,
  _qty integer,
  _cost numeric DEFAULT NULL,
  _po_id uuid DEFAULT NULL,
  _notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_batch_id uuid;
BEGIN
  IF NOT public.is_staff_or_admin(auth.uid()) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF _qty IS NULL OR _qty <= 0 THEN
    RAISE EXCEPTION 'INVALID_QTY' USING ERRCODE = 'P0001';
  END IF;
  IF _expiry IS NULL THEN
    RAISE EXCEPTION 'EXPIRY_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.inventory_item_batches
    (inventory_item_id, batch_number, expiry_date,
     quantity_initial, quantity_remaining, cost_price, received_by, po_id, notes)
  VALUES (_item_id, _batch_number, _expiry, _qty, _qty, _cost, auth.uid(), _po_id, _notes)
  RETURNING id INTO v_batch_id;

  UPDATE public.inventory_items
     SET stock = COALESCE(stock,0) + _qty,
         updated_at = now(),
         nearest_expiry_date = (
           SELECT MIN(expiry_date) FROM public.inventory_item_batches
           WHERE inventory_item_id = _item_id AND quantity_remaining > 0
         ),
         latest_expiry_date = (
           SELECT MAX(expiry_date) FROM public.inventory_item_batches
           WHERE inventory_item_id = _item_id AND quantity_remaining > 0
         )
   WHERE id = _item_id;

  INSERT INTO public.inventory_transactions
    (inventory_item_id, batch_id, transaction_type, qty_change, performed_by, notes)
  VALUES (_item_id, v_batch_id, 'restock', _qty, auth.uid(), _notes);

  RETURN v_batch_id;
END $$;

-- 6b. Adjust a batch
CREATE OR REPLACE FUNCTION public.adjust_inventory_batch(
  _batch_id uuid,
  _delta integer,
  _reason text,
  _notes text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item uuid;
  v_new integer;
BEGIN
  IF NOT public.is_ops_or_admin(auth.uid()) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  SELECT inventory_item_id, quantity_remaining + _delta
    INTO v_item, v_new
  FROM public.inventory_item_batches
  WHERE id = _batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BATCH_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_new < 0 THEN
    RAISE EXCEPTION 'NEGATIVE_RESULT' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.inventory_item_batches
     SET quantity_remaining = v_new, updated_at = now()
   WHERE id = _batch_id;

  UPDATE public.inventory_items
     SET stock = GREATEST(COALESCE(stock,0) + _delta, 0),
         updated_at = now(),
         nearest_expiry_date = (
           SELECT MIN(expiry_date) FROM public.inventory_item_batches
           WHERE inventory_item_id = v_item AND quantity_remaining > 0
         )
   WHERE id = v_item;

  INSERT INTO public.inventory_transactions
    (inventory_item_id, batch_id, transaction_type, qty_change, reason_code, notes, performed_by)
  VALUES (v_item, _batch_id, 'adjustment', _delta, _reason, _notes, auth.uid());
END $$;

-- 6c. FEFO commit
CREATE OR REPLACE FUNCTION public.commit_inventory_fefo(
  _item_id uuid,
  _qty integer,
  _consultation_item_id uuid DEFAULT NULL,
  _consultation_id uuid DEFAULT NULL,
  _patient_id uuid DEFAULT NULL,
  _reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  remaining integer := COALESCE(_qty,0);
  taken integer := 0;
  b record;
  use_qty integer;
  has_batches boolean;
BEGIN
  IF remaining <= 0 THEN
    RETURN jsonb_build_object('dispensed',0,'shortfall',0);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('inv:'||_item_id::text));

  SELECT EXISTS (
    SELECT 1 FROM public.inventory_item_batches
    WHERE inventory_item_id = _item_id
  ) INTO has_batches;

  -- Fallback: items without batches use the legacy commit
  IF NOT has_batches THEN
    PERFORM public.commit_inventory(_item_id, remaining);
    INSERT INTO public.inventory_transactions
      (inventory_item_id, transaction_type, qty_change, consultation_item_id,
       consultation_id, patient_id, reason_code, performed_by, notes)
    VALUES (_item_id, 'dispense', remaining, _consultation_item_id,
            _consultation_id, _patient_id, _reason, auth.uid(), 'no_batch_fallback');
    RETURN jsonb_build_object('dispensed', remaining, 'shortfall', 0);
  END IF;

  FOR b IN
    SELECT id, quantity_remaining
      FROM public.inventory_item_batches
     WHERE inventory_item_id = _item_id
       AND quantity_remaining > 0
       AND expiry_date >= CURRENT_DATE
     ORDER BY expiry_date ASC, received_at ASC
     FOR UPDATE
  LOOP
    EXIT WHEN remaining <= 0;
    use_qty := LEAST(b.quantity_remaining, remaining);

    UPDATE public.inventory_item_batches
       SET quantity_remaining = quantity_remaining - use_qty,
           updated_at = now()
     WHERE id = b.id;

    INSERT INTO public.inventory_transactions
      (inventory_item_id, batch_id, transaction_type, qty_change,
       consultation_item_id, consultation_id, patient_id, reason_code, performed_by)
    VALUES (_item_id, b.id, 'dispense', use_qty,
            _consultation_item_id, _consultation_id, _patient_id, _reason, auth.uid());

    taken := taken + use_qty;
    remaining := remaining - use_qty;
  END LOOP;

  -- Sync master stock + nearest expiry
  UPDATE public.inventory_items
     SET stock = GREATEST(COALESCE(stock,0) - taken, 0),
         allocated_quantity = GREATEST(COALESCE(allocated_quantity,0) - taken, 0),
         updated_at = now(),
         nearest_expiry_date = (
           SELECT MIN(expiry_date) FROM public.inventory_item_batches
           WHERE inventory_item_id = _item_id AND quantity_remaining > 0
         )
   WHERE id = _item_id;

  RETURN jsonb_build_object('dispensed', taken, 'shortfall', remaining);
END $$;

-- 6d. Expire batches
CREATE OR REPLACE FUNCTION public.expire_inventory_batches()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  n integer := 0;
BEGIN
  IF NOT public.is_ops_or_admin(auth.uid()) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  FOR r IN
    SELECT id, inventory_item_id, quantity_remaining
      FROM public.inventory_item_batches
     WHERE expiry_date < CURRENT_DATE
       AND quantity_remaining > 0
     FOR UPDATE
  LOOP
    INSERT INTO public.inventory_transactions
      (inventory_item_id, batch_id, transaction_type, qty_change, reason_code, performed_by)
    VALUES (r.inventory_item_id, r.id, 'expire', -r.quantity_remaining, 'expired', auth.uid());

    UPDATE public.inventory_item_batches
       SET quantity_remaining = 0, updated_at = now()
     WHERE id = r.id;

    UPDATE public.inventory_items
       SET stock = GREATEST(COALESCE(stock,0) - r.quantity_remaining, 0),
           updated_at = now(),
           nearest_expiry_date = (
             SELECT MIN(expiry_date) FROM public.inventory_item_batches
             WHERE inventory_item_id = r.inventory_item_id AND quantity_remaining > 0
           )
     WHERE id = r.inventory_item_id;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- 6e. Fulfill an owe-slip (full or partial)
CREATE OR REPLACE FUNCTION public.fulfill_owe_slip(
  _slip_id uuid,
  _qty integer,
  _notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s record;
  result jsonb;
  new_total integer;
  new_status text;
BEGIN
  IF NOT public.is_staff_or_admin(auth.uid()) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF _qty IS NULL OR _qty <= 0 THEN
    RAISE EXCEPTION 'INVALID_QTY' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO s FROM public.pharmacy_owe_slips
   WHERE id = _slip_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SLIP_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF s.status IN ('fulfilled','cancelled') THEN
    RAISE EXCEPTION 'SLIP_CLOSED' USING ERRCODE = 'P0001';
  END IF;
  IF (s.qty_fulfilled + _qty) > s.qty_owed THEN
    RAISE EXCEPTION 'OVER_FULFILL' USING ERRCODE = 'P0001';
  END IF;

  result := public.commit_inventory_fefo(
    s.inventory_item_id, _qty,
    s.consultation_item_id, s.consultation_id, s.patient_id,
    'owe_slip_fulfilled');

  IF (result->>'shortfall')::int > 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_STOCK' USING ERRCODE = 'P0001';
  END IF;

  new_total := s.qty_fulfilled + _qty;
  new_status := CASE WHEN new_total >= s.qty_owed THEN 'fulfilled' ELSE 'partially_fulfilled' END;

  UPDATE public.pharmacy_owe_slips
     SET qty_fulfilled = new_total,
         status = new_status,
         notes = COALESCE(notes,'') || COALESCE(E'\n' || _notes, ''),
         closed_at = CASE WHEN new_status = 'fulfilled' THEN now() ELSE closed_at END,
         closed_by = CASE WHEN new_status = 'fulfilled' THEN auth.uid() ELSE closed_by END,
         updated_at = now()
   WHERE id = _slip_id;

  RETURN jsonb_build_object('status', new_status, 'qty_fulfilled', new_total);
END $$;

-- ---------- 7. Trigger refactor: consultations completion ----------
CREATE OR REPLACE FUNCTION public.trg_consultations_inventory()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  v_item_id uuid;
  v_qty integer;
  v_disp integer;
  v_short integer;
  fefo_result jsonb;
BEGIN
  -- Completion: commit using FEFO + dispensed_qty
  IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN
    FOR r IN
      SELECT id, item_name, quantity, dispensed_qty, partial_reason
        FROM public.consultation_items
       WHERE consultation_id = NEW.id AND deleted_at IS NULL
    LOOP
      v_item_id := public._resolve_inventory_item_id(r.item_name);
      IF v_item_id IS NULL THEN
        CONTINUE; -- non-inventory item
      END IF;

      v_qty  := r.quantity;
      v_disp := COALESCE(r.dispensed_qty, r.quantity);

      -- Release the full reservation first; FEFO will subtract the actual dispensed qty
      PERFORM public.release_inventory(v_item_id, v_qty);

      IF v_disp > 0 THEN
        fefo_result := public.commit_inventory_fefo(
          v_item_id, v_disp,
          r.id, NEW.id, NEW.patient_id, r.partial_reason);
        v_short := COALESCE((fefo_result->>'shortfall')::int, 0);
      ELSE
        v_short := 0;
      END IF;

      -- Owe slip when patient is short on stock
      IF (v_qty - v_disp + v_short) > 0
         AND COALESCE(r.partial_reason,'') = 'out_of_stock' THEN
        INSERT INTO public.pharmacy_owe_slips
          (consultation_item_id, consultation_id, patient_id,
           inventory_item_id, qty_owed, created_by)
        VALUES (r.id, NEW.id, NEW.patient_id, v_item_id,
                (v_qty - v_disp + v_short), auth.uid())
        ON CONFLICT (consultation_item_id) DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  -- Soft-delete consultation: release all still-active items
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    FOR r IN
      SELECT item_name, quantity FROM public.consultation_items
       WHERE consultation_id = NEW.id AND deleted_at IS NULL
    LOOP
      v_item_id := public._resolve_inventory_item_id(r.item_name);
      IF v_item_id IS NOT NULL THEN
        PERFORM public.release_inventory(v_item_id, r.quantity);
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END $$;

-- ---------- 8. Backfill LEGACY batch for existing items ----------
INSERT INTO public.inventory_item_batches
  (inventory_item_id, batch_number, expiry_date,
   quantity_initial, quantity_remaining, cost_price, received_at, notes)
SELECT
  i.id,
  'LEGACY',
  COALESCE(i.latest_expiry_date, i.nearest_expiry_date, CURRENT_DATE + INTERVAL '365 days')::date,
  GREATEST(COALESCE(i.stock,0), 0),
  GREATEST(COALESCE(i.stock,0), 0),
  i.cost_price,
  COALESCE(i.created_at, now()),
  'Auto-created legacy batch during batch-tracking migration'
FROM public.inventory_items i
WHERE NOT EXISTS (
  SELECT 1 FROM public.inventory_item_batches b WHERE b.inventory_item_id = i.id
);