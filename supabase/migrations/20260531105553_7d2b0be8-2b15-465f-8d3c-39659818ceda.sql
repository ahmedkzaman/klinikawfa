-- =====================================================================
-- ROUND 1: Critical RLS fixes from Phase D stress test (re-scoped to real tables)
-- =====================================================================

-- D-1: Strict role checker (no hierarchical folding)
CREATE OR REPLACE FUNCTION public.has_strict_role(_user_id uuid, _target_role text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text = _target_role
  )
$$;

-- payments
DROP POLICY IF EXISTS "Doctors can view payments" ON public.payments;
CREATE POLICY "Strict doctors and admins can view payments"
  ON public.payments FOR SELECT
  USING (public.has_strict_role(auth.uid(), 'doctor') OR public.is_admin(auth.uid()));

-- panel_claims
DROP POLICY IF EXISTS "Doctors can view panel claims" ON public.panel_claims;
CREATE POLICY "Strict doctors and admins can view panel claims"
  ON public.panel_claims FOR SELECT
  USING (public.has_strict_role(auth.uid(), 'doctor') OR public.is_admin(auth.uid()));

-- video_payments
DROP POLICY IF EXISTS "Doctors can view video payments" ON public.video_payments;
CREATE POLICY "Strict doctors and admins can view video payments"
  ON public.video_payments FOR SELECT
  USING (public.has_strict_role(auth.uid(), 'doctor') OR public.is_admin(auth.uid()));

-- client_invoices (A/R)
DROP POLICY IF EXISTS "Doctors can view client invoices" ON public.client_invoices;
CREATE POLICY "Strict doctors and admins can view client invoices"
  ON public.client_invoices FOR SELECT
  USING (public.has_strict_role(auth.uid(), 'doctor') OR public.is_admin(auth.uid()));

-- vendor_invoices (A/P)
DROP POLICY IF EXISTS "Doctors can view vendor invoices" ON public.vendor_invoices;
CREATE POLICY "Admins only can view vendor invoices"
  ON public.vendor_invoices FOR SELECT
  USING (public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- D-2: Column-level guard on inventory pricing fields
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Staff can update inventory" ON public.inventory_items;
CREATE POLICY "Staff can update inventory operational fields"
  ON public.inventory_items FOR UPDATE
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE OR REPLACE FUNCTION public.guard_inventory_pricing_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (
       NEW.cost_price            IS DISTINCT FROM OLD.cost_price
    OR NEW.price_to_patient_max  IS DISTINCT FROM OLD.price_to_patient_max
    OR NEW.standard_panel_price  IS DISTINCT FROM OLD.standard_panel_price
    OR NEW.price_tier_1          IS DISTINCT FROM OLD.price_tier_1
    OR NEW.price_tier_2          IS DISTINCT FROM OLD.price_tier_2
  ) AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Only admins can modify inventory pricing fields'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_inventory_pricing ON public.inventory_items;
CREATE TRIGGER trg_guard_inventory_pricing
  BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_inventory_pricing_update();