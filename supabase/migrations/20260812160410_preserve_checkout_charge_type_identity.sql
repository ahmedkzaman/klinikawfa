-- Checkout historically inserted configured charges as unclassified
-- consultation items. Classify those inserts at the table boundary so
-- reconciliation receives the same structured identity as bill corrections.
CREATE OR REPLACE FUNCTION public.classify_configured_consultation_charge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_charge_type_id uuid;
BEGIN
  IF NEW.billing_adjustment_kind IS NOT NULL
     OR NEW.clinic_charge_type_id IS NOT NULL
     OR NEW.item_id IS NOT NULL
     OR NEW.service_id IS NOT NULL
     OR NEW.package_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT cct.id
    INTO v_charge_type_id
  FROM public.clinic_charge_types cct
  WHERE cct.is_active
    AND cct.name = pg_catalog.btrim(NEW.item_name)
  ORDER BY cct.created_at, cct.id
  LIMIT 1;

  IF v_charge_type_id IS NOT NULL THEN
    NEW.billing_adjustment_kind := 'other_charge';
    NEW.clinic_charge_type_id := v_charge_type_id;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS classify_configured_consultation_charge
  ON public.consultation_items;

CREATE TRIGGER classify_configured_consultation_charge
BEFORE INSERT ON public.consultation_items
FOR EACH ROW
EXECUTE FUNCTION public.classify_configured_consultation_charge();

REVOKE ALL ON FUNCTION public.classify_configured_consultation_charge() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.classify_configured_consultation_charge() FROM anon;
REVOKE ALL ON FUNCTION public.classify_configured_consultation_charge() FROM authenticated;
