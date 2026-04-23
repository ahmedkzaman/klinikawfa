-- 1. Table
CREATE TABLE IF NOT EXISTS public.payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('cash','card','ewallet','bank_transfer','panel','insurance','other')),
  provider_id uuid NULL REFERENCES public.insurance_providers(id) ON DELETE SET NULL,
  account_details text NULL,
  surcharge_percentage numeric(5,2) NOT NULL DEFAULT 0,
  display_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Index
CREATE INDEX IF NOT EXISTS payment_methods_status_order_idx
  ON public.payment_methods (status, display_order);

-- 3. updated_at trigger
DROP TRIGGER IF EXISTS trg_payment_methods_updated_at ON public.payment_methods;
CREATE TRIGGER trg_payment_methods_updated_at
  BEFORE UPDATE ON public.payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. RLS
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_methods_authenticated_select"
  ON public.payment_methods FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "payment_methods_ops_insert"
  ON public.payment_methods FOR INSERT TO authenticated
  WITH CHECK (public.is_ops_or_admin(auth.uid()));

CREATE POLICY "payment_methods_ops_update"
  ON public.payment_methods FOR UPDATE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()))
  WITH CHECK (public.is_ops_or_admin(auth.uid()));

CREATE POLICY "payment_methods_special_admin_delete"
  ON public.payment_methods FOR DELETE TO authenticated
  USING (public.is_special_admin(auth.uid()));