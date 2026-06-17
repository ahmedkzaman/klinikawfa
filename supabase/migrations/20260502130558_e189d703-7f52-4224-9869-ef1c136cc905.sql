-- 1. Patient demographic guards & default panel
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS passport_no             text,
  ADD COLUMN IF NOT EXISTS religion                text,
  ADD COLUMN IF NOT EXISTS emergency_contact_name  text,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone text,
  ADD COLUMN IF NOT EXISTS default_panel_id        uuid
    REFERENCES public.insurance_providers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_patients_default_panel_id
  ON public.patients(default_panel_id) WHERE default_panel_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_patients_passport_no
  ON public.patients(passport_no) WHERE passport_no IS NOT NULL;

-- 2. Panel default pricing tier on insurance_providers
ALTER TABLE public.insurance_providers
  ADD COLUMN IF NOT EXISTS default_price_tier text NOT NULL DEFAULT 'standard';

CREATE OR REPLACE FUNCTION public.trg_validate_panel_tier()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.default_price_tier NOT IN ('standard','tier1','tier2') THEN
    RAISE EXCEPTION 'INVALID_PRICE_TIER: %', NEW.default_price_tier
      USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS validate_panel_tier ON public.insurance_providers;
CREATE TRIGGER validate_panel_tier
  BEFORE INSERT OR UPDATE ON public.insurance_providers
  FOR EACH ROW EXECUTE FUNCTION public.trg_validate_panel_tier();

-- 3. Extend price-resolution trigger to honour the panel's default tier
CREATE OR REPLACE FUNCTION public.trg_resolve_selling_price()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_panel_id uuid; v_tier text;
  v_override numeric(10,2); v_standard numeric(10,2); v_self_pay numeric(10,2);
  v_tier1 numeric(10,2); v_tier2 numeric(10,2); v_tier_price numeric(10,2);
BEGIN
  SELECT qe.panel_id, ip.default_price_tier INTO v_panel_id, v_tier
  FROM public.consultations c
  JOIN public.queue_entries qe ON c.queue_entry_id = qe.id
  LEFT JOIN public.insurance_providers ip ON ip.id = qe.panel_id
  WHERE c.id = NEW.consultation_id;

  -- Manual / free-text item: trust caller-supplied price
  IF NEW.item_id IS NULL AND NEW.service_id IS NULL AND NEW.package_id IS NULL THEN
    NEW.price := COALESCE(NEW.price, 0);
    NEW.price_tier := COALESCE(NEW.price_tier,
      CASE WHEN v_panel_id IS NOT NULL THEN 'PANEL' ELSE 'SELF PAY' END);
    RETURN NEW;
  END IF;

  IF NEW.item_id IS NOT NULL THEN
    SELECT price_to_patient_max, standard_panel_price, price_tier_1, price_tier_2
      INTO v_self_pay, v_standard, v_tier1, v_tier2
      FROM public.inventory_items WHERE id = NEW.item_id;
    IF v_panel_id IS NOT NULL THEN
      SELECT override_price INTO v_override FROM public.panel_price_overrides
      WHERE panel_id = v_panel_id AND item_id = NEW.item_id;
    END IF;
  ELSIF NEW.service_id IS NOT NULL THEN
    SELECT price_to_patient, standard_panel_price INTO v_self_pay, v_standard
      FROM public.services WHERE id = NEW.service_id;
    IF v_panel_id IS NOT NULL THEN
      SELECT override_price INTO v_override FROM public.panel_price_overrides
      WHERE panel_id = v_panel_id AND service_id = NEW.service_id;
    END IF;
  ELSIF NEW.package_id IS NOT NULL THEN
    SELECT price, standard_panel_price INTO v_self_pay, v_standard
      FROM public.packages WHERE id = NEW.package_id;
    IF v_panel_id IS NOT NULL THEN
      SELECT override_price INTO v_override FROM public.panel_price_overrides
      WHERE panel_id = v_panel_id AND package_id = NEW.package_id;
    END IF;
  END IF;

  v_tier_price := CASE
    WHEN v_tier='tier1' THEN v_tier1
    WHEN v_tier='tier2' THEN v_tier2
    ELSE NULL END;

  IF v_panel_id IS NOT NULL THEN
    NEW.price := COALESCE(v_override, v_tier_price, v_standard, v_self_pay, 0);
    NEW.price_tier := COALESCE(NEW.price_tier, 'PANEL');
  ELSE
    NEW.price := COALESCE(v_self_pay, 0);
    NEW.price_tier := COALESCE(NEW.price_tier, 'SELF PAY');
  END IF;
  RETURN NEW;
END $$;