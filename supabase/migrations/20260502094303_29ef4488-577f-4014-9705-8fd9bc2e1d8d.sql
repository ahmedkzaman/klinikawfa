-- ============================================================
-- Phase 2C: ERP Completion schema
-- vendor_invoices, clinic_packages, clinic_package_items, inventory_adjustments
-- ============================================================

-- ---------------- vendor_invoices ----------------
CREATE TABLE public.vendor_invoices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no    text NOT NULL,
  supplier_id   uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  po_id         uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  amount        numeric(12,2) NOT NULL DEFAULT 0,
  due_date      date,
  status        text NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','Paid','Overdue')),
  payment_ref   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX vendor_invoices_supplier_idx ON public.vendor_invoices(supplier_id);
CREATE INDEX vendor_invoices_po_idx       ON public.vendor_invoices(po_id);
CREATE INDEX vendor_invoices_status_idx   ON public.vendor_invoices(status);

ALTER TABLE public.vendor_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vendor_invoices_read"
  ON public.vendor_invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "vendor_invoices_ops_insert"
  ON public.vendor_invoices FOR INSERT TO authenticated
  WITH CHECK (public.is_ops_or_admin(auth.uid()));
CREATE POLICY "vendor_invoices_ops_update"
  ON public.vendor_invoices FOR UPDATE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()))
  WITH CHECK (public.is_ops_or_admin(auth.uid()));
CREATE POLICY "vendor_invoices_ops_delete"
  ON public.vendor_invoices FOR DELETE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()));

CREATE TRIGGER set_vendor_invoices_updated_at
  BEFORE UPDATE ON public.vendor_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------- clinic_packages ----------------
CREATE TABLE public.clinic_packages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  description  text,
  total_price  numeric(12,2) NOT NULL DEFAULT 0,
  status       text NOT NULL DEFAULT 'active',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.clinic_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clinic_packages_read"
  ON public.clinic_packages FOR SELECT TO authenticated USING (true);
CREATE POLICY "clinic_packages_ops_insert"
  ON public.clinic_packages FOR INSERT TO authenticated
  WITH CHECK (public.is_ops_or_admin(auth.uid()));
CREATE POLICY "clinic_packages_ops_update"
  ON public.clinic_packages FOR UPDATE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()))
  WITH CHECK (public.is_ops_or_admin(auth.uid()));
CREATE POLICY "clinic_packages_ops_delete"
  ON public.clinic_packages FOR DELETE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()));

CREATE TRIGGER set_clinic_packages_updated_at
  BEFORE UPDATE ON public.clinic_packages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------- clinic_package_items ----------------
CREATE TABLE public.clinic_package_items (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id         uuid NOT NULL REFERENCES public.clinic_packages(id) ON DELETE CASCADE,
  inventory_item_id  uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  quantity           integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX clinic_package_items_pkg_idx  ON public.clinic_package_items(package_id);
CREATE INDEX clinic_package_items_item_idx ON public.clinic_package_items(inventory_item_id);

ALTER TABLE public.clinic_package_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clinic_package_items_read"
  ON public.clinic_package_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "clinic_package_items_ops_insert"
  ON public.clinic_package_items FOR INSERT TO authenticated
  WITH CHECK (public.is_ops_or_admin(auth.uid()));
CREATE POLICY "clinic_package_items_ops_update"
  ON public.clinic_package_items FOR UPDATE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()))
  WITH CHECK (public.is_ops_or_admin(auth.uid()));
CREATE POLICY "clinic_package_items_ops_delete"
  ON public.clinic_package_items FOR DELETE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()));

CREATE TRIGGER set_clinic_package_items_updated_at
  BEFORE UPDATE ON public.clinic_package_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------- inventory_adjustments ----------------
CREATE TABLE public.inventory_adjustments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  previous_stock    integer NOT NULL,
  new_stock         integer NOT NULL,
  variance          integer GENERATED ALWAYS AS (new_stock - previous_stock) STORED,
  reason            text,
  adjusted_by       uuid NOT NULL DEFAULT auth.uid(),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX inventory_adjustments_item_idx    ON public.inventory_adjustments(inventory_item_id);
CREATE INDEX inventory_adjustments_created_idx ON public.inventory_adjustments(created_at DESC);

ALTER TABLE public.inventory_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inventory_adjustments_read"
  ON public.inventory_adjustments FOR SELECT TO authenticated USING (true);
CREATE POLICY "inventory_adjustments_ops_insert"
  ON public.inventory_adjustments FOR INSERT TO authenticated
  WITH CHECK (
    public.is_ops_or_admin(auth.uid())
    AND adjusted_by = auth.uid()
  );
-- No UPDATE / DELETE policies → audit log is immutable.