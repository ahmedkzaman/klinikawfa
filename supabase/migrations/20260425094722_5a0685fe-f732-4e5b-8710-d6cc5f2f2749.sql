-- 1. Add panel_id to queue_entries
ALTER TABLE public.queue_entries
  ADD COLUMN IF NOT EXISTS panel_id uuid REFERENCES public.insurance_providers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_queue_entries_panel_id ON public.queue_entries(panel_id);

-- 2. Pricing resolver trigger function
CREATE OR REPLACE FUNCTION public.trg_resolve_selling_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_panel_id uuid;
  v_override numeric(10,2);
  v_standard numeric(10,2);
  v_self_pay numeric(10,2);
BEGIN
  -- 1. Identify the payer profile for this visit
  SELECT qe.panel_id INTO v_panel_id
  FROM public.consultations c
  JOIN public.queue_entries qe ON c.queue_entry_id = qe.id
  WHERE c.id = NEW.consultation_id;

  -- 2. Retrieve the catalog pricing based on target type
  IF NEW.item_id IS NOT NULL THEN
    SELECT price_to_patient_max, standard_panel_price
      INTO v_self_pay, v_standard
      FROM public.inventory_items WHERE id = NEW.item_id;
    IF v_panel_id IS NOT NULL THEN
      SELECT override_price INTO v_override
        FROM public.panel_price_overrides
        WHERE panel_id = v_panel_id AND item_id = NEW.item_id;
    END IF;

  ELSIF NEW.service_id IS NOT NULL THEN
    SELECT price_to_patient, standard_panel_price
      INTO v_self_pay, v_standard
      FROM public.services WHERE id = NEW.service_id;
    IF v_panel_id IS NOT NULL THEN
      SELECT override_price INTO v_override
        FROM public.panel_price_overrides
        WHERE panel_id = v_panel_id AND service_id = NEW.service_id;
    END IF;

  ELSIF NEW.package_id IS NOT NULL THEN
    SELECT price, standard_panel_price
      INTO v_self_pay, v_standard
      FROM public.packages WHERE id = NEW.package_id;
    IF v_panel_id IS NOT NULL THEN
      SELECT override_price INTO v_override
        FROM public.panel_price_overrides
        WHERE panel_id = v_panel_id AND package_id = NEW.package_id;
    END IF;
  END IF;

  -- 3. Apply the Pricing Hierarchy (Override -> Standard Panel -> Self Pay)
  IF v_panel_id IS NOT NULL THEN
    NEW.price := COALESCE(v_override, v_standard, v_self_pay, 0);
  ELSE
    NEW.price := COALESCE(v_self_pay, 0);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS before_insert_resolve_selling_price ON public.consultation_items;

-- Runs BEFORE INSERT only, preserving manual discounts applied via later UPDATEs.
CREATE TRIGGER before_insert_resolve_selling_price
  BEFORE INSERT ON public.consultation_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_resolve_selling_price();