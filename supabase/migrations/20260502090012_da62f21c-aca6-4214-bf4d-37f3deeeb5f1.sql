
-- =========================================================
-- SUPPLIERS
-- =========================================================
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_person text,
  phone text,
  email text,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER update_suppliers_updated_at
BEFORE UPDATE ON public.suppliers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view suppliers" ON public.suppliers
  FOR SELECT TO authenticated USING (public.is_staff_or_admin(auth.uid()));
CREATE POLICY "Staff can insert suppliers" ON public.suppliers
  FOR INSERT TO authenticated WITH CHECK (public.is_staff_or_admin(auth.uid()));
CREATE POLICY "Staff can update suppliers" ON public.suppliers
  FOR UPDATE TO authenticated USING (public.is_staff_or_admin(auth.uid())) WITH CHECK (public.is_staff_or_admin(auth.uid()));
CREATE POLICY "Staff can delete suppliers" ON public.suppliers
  FOR DELETE TO authenticated USING (public.is_staff_or_admin(auth.uid()));

-- =========================================================
-- PURCHASE ORDERS
-- =========================================================
CREATE TABLE public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number text NOT NULL UNIQUE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  order_date date NOT NULL DEFAULT current_date,
  expected_date date,
  status text NOT NULL DEFAULT 'Draft',
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  received_at timestamptz,
  received_by uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_purchase_orders_supplier_id ON public.purchase_orders(supplier_id);
CREATE INDEX idx_purchase_orders_status ON public.purchase_orders(status);

CREATE TRIGGER update_purchase_orders_updated_at
BEFORE UPDATE ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Validation trigger for status (avoid CHECK so we can evolve it)
CREATE OR REPLACE FUNCTION public.trg_validate_po_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status NOT IN ('Draft','Sent','Received','Cancelled') THEN
    RAISE EXCEPTION 'INVALID_PO_STATUS: %', NEW.status USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_purchase_orders_validate_status
BEFORE INSERT OR UPDATE ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.trg_validate_po_status();

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view POs" ON public.purchase_orders
  FOR SELECT TO authenticated USING (public.is_staff_or_admin(auth.uid()));
CREATE POLICY "Staff can insert POs" ON public.purchase_orders
  FOR INSERT TO authenticated WITH CHECK (public.is_staff_or_admin(auth.uid()));
CREATE POLICY "Staff can update POs" ON public.purchase_orders
  FOR UPDATE TO authenticated USING (public.is_staff_or_admin(auth.uid())) WITH CHECK (public.is_staff_or_admin(auth.uid()));
CREATE POLICY "Staff can delete POs" ON public.purchase_orders
  FOR DELETE TO authenticated USING (public.is_staff_or_admin(auth.uid()));

-- =========================================================
-- PURCHASE ORDER ITEMS
-- =========================================================
CREATE TABLE public.purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  order_qty integer NOT NULL CHECK (order_qty > 0),
  received_qty integer NOT NULL DEFAULT 0,
  unit_cost numeric(12,2) NOT NULL DEFAULT 0,
  total_price numeric(14,2) GENERATED ALWAYS AS (order_qty * unit_cost) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_purchase_order_items_po_id ON public.purchase_order_items(po_id);
CREATE INDEX idx_purchase_order_items_inventory_item_id ON public.purchase_order_items(inventory_item_id);

CREATE TRIGGER update_purchase_order_items_updated_at
BEFORE UPDATE ON public.purchase_order_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view PO items" ON public.purchase_order_items
  FOR SELECT TO authenticated USING (public.is_staff_or_admin(auth.uid()));
CREATE POLICY "Staff can insert PO items" ON public.purchase_order_items
  FOR INSERT TO authenticated WITH CHECK (public.is_staff_or_admin(auth.uid()));
CREATE POLICY "Staff can update PO items" ON public.purchase_order_items
  FOR UPDATE TO authenticated USING (public.is_staff_or_admin(auth.uid())) WITH CHECK (public.is_staff_or_admin(auth.uid()));
CREATE POLICY "Staff can delete PO items" ON public.purchase_order_items
  FOR DELETE TO authenticated USING (public.is_staff_or_admin(auth.uid()));

-- =========================================================
-- HELPERS
-- =========================================================

-- Generate next PO number for today: PO-YYYYMMDD-####
CREATE OR REPLACE FUNCTION public.generate_po_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq int;
BEGIN
  SELECT COUNT(*) + 1 INTO v_seq
  FROM public.purchase_orders
  WHERE order_date = current_date;
  RETURN 'PO-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(v_seq::text, 4, '0');
END;
$$;

-- Recompute total_amount for a PO based on its line items
CREATE OR REPLACE FUNCTION public.recalc_po_total(_po_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total numeric(12,2);
BEGIN
  SELECT COALESCE(SUM(total_price), 0) INTO v_total
  FROM public.purchase_order_items
  WHERE po_id = _po_id;

  UPDATE public.purchase_orders
     SET total_amount = v_total,
         updated_at = now()
   WHERE id = _po_id;
END;
$$;

-- Trigger keeps total_amount in sync as line items change
CREATE OR REPLACE FUNCTION public.trg_recalc_po_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalc_po_total(OLD.po_id);
    RETURN OLD;
  ELSE
    PERFORM public.recalc_po_total(NEW.po_id);
    IF TG_OP = 'UPDATE' AND OLD.po_id <> NEW.po_id THEN
      PERFORM public.recalc_po_total(OLD.po_id);
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

CREATE TRIGGER trg_po_items_recalc_total
AFTER INSERT OR UPDATE OR DELETE ON public.purchase_order_items
FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_po_total();

-- =========================================================
-- RECEIVE GOODS RPC (atomic)
-- =========================================================
CREATE OR REPLACE FUNCTION public.receive_purchase_order(_po_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  r record;
BEGIN
  IF NOT public.is_staff_or_admin(auth.uid()) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  SELECT status INTO v_status
  FROM public.purchase_orders
  WHERE id = _po_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF v_status <> 'Sent' THEN
    RAISE EXCEPTION 'PO_NOT_SENT' USING ERRCODE = 'P0001';
  END IF;

  FOR r IN
    SELECT id, inventory_item_id, order_qty
    FROM public.purchase_order_items
    WHERE po_id = _po_id
  LOOP
    UPDATE public.inventory_items
       SET stock = COALESCE(stock, 0) + r.order_qty,
           updated_at = now()
     WHERE id = r.inventory_item_id;

    UPDATE public.purchase_order_items
       SET received_qty = r.order_qty,
           updated_at = now()
     WHERE id = r.id;
  END LOOP;

  UPDATE public.purchase_orders
     SET status = 'Received',
         received_at = now(),
         received_by = auth.uid(),
         updated_at = now()
   WHERE id = _po_id;
END;
$$;
