CREATE OR REPLACE FUNCTION public.trg_resolve_selling_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_panel_id uuid;
  v_override numeric(10,2);
  v_standard numeric(10,2);
  v_self_pay numeric(10,2);
BEGIN
  -- Identify payer profile for this visit (used for tier stamping below)
  SELECT qe.panel_id INTO v_panel_id
  FROM public.consultations c
  JOIN public.queue_entries qe ON c.queue_entry_id = qe.id
  WHERE c.id = NEW.consultation_id;

  -- Manual / free-text item (no catalog link). Trust the caller's price and
  -- stamp a sensible tier so the UI doesn't render "Select tier".
  IF NEW.item_id IS NULL
     AND NEW.service_id IS NULL
     AND NEW.package_id IS NULL THEN
    NEW.price      := COALESCE(NEW.price, 0);
    NEW.price_tier := COALESCE(NEW.price_tier,
                               CASE WHEN v_panel_id IS NOT NULL
                                    THEN 'PANEL' ELSE 'SELF PAY' END);
    RETURN NEW;
  END IF;

  -- Catalog-resolution logic (unchanged behavior)
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

  -- Apply the Pricing Hierarchy and stamp the tier
  IF v_panel_id IS NOT NULL THEN
    NEW.price      := COALESCE(v_override, v_standard, v_self_pay, 0);
    NEW.price_tier := COALESCE(NEW.price_tier, 'PANEL');
  ELSE
    NEW.price      := COALESCE(v_self_pay, 0);
    NEW.price_tier := COALESCE(NEW.price_tier, 'SELF PAY');
  END IF;

  RETURN NEW;
END;
$function$;