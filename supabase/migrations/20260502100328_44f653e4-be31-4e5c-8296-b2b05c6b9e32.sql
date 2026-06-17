-- ============ corporate_clients ============
CREATE TABLE public.corporate_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.corporate_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "corporate_clients_auth_select" ON public.corporate_clients
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "corporate_clients_auth_insert" ON public.corporate_clients
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "corporate_clients_auth_update" ON public.corporate_clients
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "corporate_clients_auth_delete" ON public.corporate_clients
  FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_corporate_clients_updated_at
  BEFORE UPDATE ON public.corporate_clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ invoice number sequence ============
CREATE SEQUENCE IF NOT EXISTS public.client_invoice_seq START 1;

-- ============ client_invoices ============
CREATE TABLE public.client_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no TEXT NOT NULL UNIQUE,
  client_id UUID NOT NULL REFERENCES public.corporate_clients(id),
  issue_date DATE NOT NULL DEFAULT current_date,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'Draft'
    CHECK (status IN ('Draft','Issued','Paid','Cancelled')),
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  payment_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_invoices_client ON public.client_invoices(client_id);

ALTER TABLE public.client_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_invoices_auth_select" ON public.client_invoices
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "client_invoices_auth_insert" ON public.client_invoices
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "client_invoices_auth_update" ON public.client_invoices
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "client_invoices_auth_delete" ON public.client_invoices
  FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_client_invoices_updated_at
  BEFORE UPDATE ON public.client_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-assign invoice_no via sequence (race-free)
CREATE OR REPLACE FUNCTION public.assign_client_invoice_no()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.invoice_no IS NULL OR NEW.invoice_no = '' THEN
    NEW.invoice_no := 'INV-AR-' ||
      to_char(COALESCE(NEW.issue_date, current_date), 'YYYYMMDD') ||
      '-' || lpad(nextval('public.client_invoice_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_assign_client_invoice_no
  BEFORE INSERT ON public.client_invoices
  FOR EACH ROW EXECUTE FUNCTION public.assign_client_invoice_no();

-- ============ client_invoice_items ============
CREATE TABLE public.client_invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.client_invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_price NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_invoice_items_invoice ON public.client_invoice_items(invoice_id);

ALTER TABLE public.client_invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_invoice_items_auth_select" ON public.client_invoice_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "client_invoice_items_auth_insert" ON public.client_invoice_items
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "client_invoice_items_auth_update" ON public.client_invoice_items
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "client_invoice_items_auth_delete" ON public.client_invoice_items
  FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_client_invoice_items_updated_at
  BEFORE UPDATE ON public.client_invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ recompute invoice total ============
CREATE OR REPLACE FUNCTION public.recalc_client_invoice_total(_invoice_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total NUMERIC(12,2);
BEGIN
  SELECT COALESCE(SUM(total_price), 0) INTO v_total
  FROM public.client_invoice_items
  WHERE invoice_id = _invoice_id;

  UPDATE public.client_invoices
  SET total_amount = v_total, updated_at = now()
  WHERE id = _invoice_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_recalc_client_invoice_total()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalc_client_invoice_total(OLD.invoice_id);
    RETURN OLD;
  ELSE
    PERFORM public.recalc_client_invoice_total(NEW.invoice_id);
    IF TG_OP = 'UPDATE' AND OLD.invoice_id <> NEW.invoice_id THEN
      PERFORM public.recalc_client_invoice_total(OLD.invoice_id);
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

CREATE TRIGGER trg_recalc_client_invoice_total
  AFTER INSERT OR UPDATE OR DELETE ON public.client_invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_client_invoice_total();

-- ============ atomic items save RPC ============
CREATE OR REPLACE FUNCTION public.save_client_invoice_items(
  _invoice_id UUID,
  _items JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.client_invoice_items WHERE invoice_id = _invoice_id;

  INSERT INTO public.client_invoice_items (invoice_id, description, quantity, unit_price)
  SELECT _invoice_id,
         (i->>'description')::text,
         COALESCE((i->>'quantity')::numeric, 1),
         COALESCE((i->>'unit_price')::numeric, 0)
  FROM jsonb_array_elements(_items) AS i
  WHERE COALESCE(trim(i->>'description'), '') <> '';
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_client_invoice_items(UUID, JSONB) TO authenticated;

-- ============ SST number on clinic_settings ============
ALTER TABLE public.clinic_settings ADD COLUMN IF NOT EXISTS sst_number TEXT;