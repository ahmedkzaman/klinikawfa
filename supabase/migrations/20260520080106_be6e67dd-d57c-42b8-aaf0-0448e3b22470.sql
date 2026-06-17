
ALTER TABLE public.insurance_providers
  ADD COLUMN IF NOT EXISTS consultation_fee_override numeric(10,2) NULL,
  ADD COLUMN IF NOT EXISTS medication_discount_pct numeric(5,2) NOT NULL DEFAULT 0;

ALTER TABLE public.insurance_providers
  DROP CONSTRAINT IF EXISTS insurance_providers_medication_discount_pct_chk;
ALTER TABLE public.insurance_providers
  ADD CONSTRAINT insurance_providers_medication_discount_pct_chk
  CHECK (medication_discount_pct >= 0 AND medication_discount_pct <= 100);

CREATE OR REPLACE FUNCTION public.trg_resolve_selling_price()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_panel_id uuid; v_tier text;
  v_override numeric(10,2); v_standard numeric(10,2); v_self_pay numeric(10,2);
  v_tier1 numeric(10,2); v_tier2 numeric(10,2); v_tier_price numeric(10,2);
  v_fee_override numeric(10,2); v_med_discount numeric(5,2);
  v_default_fee_name text;
BEGIN
  SELECT qe.panel_id, ip.default_price_tier,
         ip.consultation_fee_override, ip.medication_discount_pct
    INTO v_panel_id, v_tier, v_fee_override, v_med_discount
  FROM public.consultations c
  JOIN public.queue_entries qe ON c.queue_entry_id = qe.id
  LEFT JOIN public.insurance_providers ip ON ip.id = qe.panel_id
  WHERE c.id = NEW.consultation_id;

  -- Manual / free-text item: trust caller-supplied price, then apply panel
  -- consultation-fee override if this row is the configured consultation fee.
  IF NEW.item_id IS NULL AND NEW.service_id IS NULL AND NEW.package_id IS NULL THEN
    NEW.price := COALESCE(NEW.price, 0);
    NEW.price_tier := COALESCE(NEW.price_tier,
      CASE WHEN v_panel_id IS NOT NULL THEN 'PANEL' ELSE 'SELF PAY' END);

    IF v_panel_id IS NOT NULL AND v_fee_override IS NOT NULL THEN
      SELECT value INTO v_default_fee_name
      FROM public.clinic_preferences
      WHERE key = 'default_consultation_fee_name'
      LIMIT 1;
      v_default_fee_name := COALESCE(v_default_fee_name, 'Consultation Fee');

      IF lower(trim(NEW.item_name)) = lower(trim(v_default_fee_name))
         OR lower(NEW.item_name) LIKE '%consultation fee%' THEN
        NEW.price := v_fee_override;
      END IF;
    END IF;
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

    -- Apply % medication discount only to inventory rows and only when no
    -- bespoke per-item override won. Stacks AFTER tier/standard fallback.
    IF NEW.item_id IS NOT NULL
       AND v_override IS NULL
       AND COALESCE(v_med_discount, 0) > 0 THEN
      NEW.price := round(NEW.price * (1 - v_med_discount / 100.0), 2);
    END IF;
  ELSE
    NEW.price := COALESCE(v_self_pay, 0);
    NEW.price_tier := COALESCE(NEW.price_tier, 'SELF PAY');
  END IF;
  RETURN NEW;
END $function$;
