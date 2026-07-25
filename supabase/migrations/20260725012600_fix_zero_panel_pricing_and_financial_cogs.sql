-- Zero-valued catalog tiers are placeholders, not intentional free prices.
-- Preserve explicit per-panel overrides, including an intentional RM0 override.
CREATE OR REPLACE FUNCTION public.trg_resolve_selling_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_panel_id uuid;
  v_tier text;
  v_override numeric(10,2);
  v_standard numeric(10,2);
  v_self_pay numeric(10,2);
  v_tier1 numeric(10,2);
  v_tier2 numeric(10,2);
  v_tier_price numeric(10,2);
  v_fee_override numeric(10,2);
  v_med_discount numeric(5,2);
  v_default_fee_name text;
BEGIN
  SELECT qe.panel_id, ip.default_price_tier,
         ip.consultation_fee_override, ip.medication_discount_pct
    INTO v_panel_id, v_tier, v_fee_override, v_med_discount
  FROM public.consultations c
  JOIN public.queue_entries qe ON c.queue_entry_id = qe.id
  LEFT JOIN public.insurance_providers ip ON ip.id = qe.panel_id
  WHERE c.id = NEW.consultation_id;

  IF NEW.item_id IS NULL AND NEW.service_id IS NULL AND NEW.package_id IS NULL THEN
    NEW.price := COALESCE(NEW.price, 0);
    NEW.price_tier := COALESCE(
      NEW.price_tier,
      CASE WHEN v_panel_id IS NOT NULL THEN 'PANEL' ELSE 'SELF PAY' END
    );

    IF v_panel_id IS NOT NULL AND v_fee_override IS NOT NULL THEN
      SELECT value
        INTO v_default_fee_name
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
    FROM public.inventory_items
    WHERE id = NEW.item_id;

    IF v_panel_id IS NOT NULL THEN
      SELECT override_price
        INTO v_override
      FROM public.panel_price_overrides
      WHERE panel_id = v_panel_id
        AND item_id = NEW.item_id;
    END IF;
  ELSIF NEW.service_id IS NOT NULL THEN
    SELECT price_to_patient, standard_panel_price
      INTO v_self_pay, v_standard
    FROM public.services
    WHERE id = NEW.service_id;

    IF v_panel_id IS NOT NULL THEN
      SELECT override_price
        INTO v_override
      FROM public.panel_price_overrides
      WHERE panel_id = v_panel_id
        AND service_id = NEW.service_id;
    END IF;
  ELSIF NEW.package_id IS NOT NULL THEN
    SELECT price, standard_panel_price
      INTO v_self_pay, v_standard
    FROM public.packages
    WHERE id = NEW.package_id;

    IF v_panel_id IS NOT NULL THEN
      SELECT override_price
        INTO v_override
      FROM public.panel_price_overrides
      WHERE panel_id = v_panel_id
        AND package_id = NEW.package_id;
    END IF;
  END IF;

  v_tier_price := CASE
    WHEN v_tier = 'tier1' THEN v_tier1
    WHEN v_tier = 'tier2' THEN v_tier2
    ELSE NULL
  END;

  IF v_panel_id IS NOT NULL THEN
    NEW.price := COALESCE(
      v_override,
      NULLIF(v_tier_price, 0),
      v_standard,
      v_self_pay,
      0
    );
    NEW.price_tier := COALESCE(NEW.price_tier, 'PANEL');

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
END
$function$;

DROP VIEW IF EXISTS public.insight_financials_view;

CREATE VIEW public.insight_financials_view
WITH (security_invoker = true)
AS
SELECT
  ci.id,
  ci.item_name,
  (timezone('Asia/Kuala_Lumpur', qe.created_at))::date AS visit_date,
  qe.created_at AS queue_entry_created_at,
  qe.payment_method,
  (ci.price * COALESCE(ci.dispensed_qty, ci.quantity))::numeric AS revenue,
  (ci.unit_cost * COALESCE(ci.dispensed_qty, ci.quantity))::numeric AS cogs,
  (
    (ci.price - ci.unit_cost)
    * COALESCE(ci.dispensed_qty, ci.quantity)
  )::numeric AS profit,
  qe.id AS queue_entry_id,
  c.doctor_id,
  COALESCE(d.name, 'Unassigned') AS doctor_name,
  c.diagnosis_id,
  COALESCE(dx.name, NULLIF(c.diagnosis_text, ''), 'Undiagnosed') AS diagnosis_name,
  qe.patient_id,
  p.reg_no AS patient_reg_no,
  CASE
    WHEN ci.service_id IS NOT NULL THEN 'service'
    WHEN ci.item_id IS NOT NULL THEN 'medication'
    WHEN ci.package_id IS NOT NULL THEN 'package'
    ELSE 'other'
  END AS kind
FROM public.consultation_items ci
JOIN public.consultations c ON ci.consultation_id = c.id
JOIN public.queue_entries qe ON c.queue_entry_id = qe.id
LEFT JOIN public.doctors d ON c.doctor_id = d.id
LEFT JOIN public.diagnoses dx ON c.diagnosis_id = dx.id
LEFT JOIN public.patients p ON qe.patient_id = p.id
WHERE (c.status = 'completed' OR qe.clinic_status = 'completed')
  AND ci.deleted_at IS NULL
  AND c.deleted_at IS NULL;

-- Repair catalog-linked panel medication rows created under the old rule.
-- Explicit per-panel RM0 overrides remain untouched.
UPDATE public.consultation_items ci
SET price = round(
  COALESCE(
    NULLIF(
      CASE
        WHEN ip.default_price_tier = 'tier1' THEN ii.price_tier_1
        WHEN ip.default_price_tier = 'tier2' THEN ii.price_tier_2
        ELSE NULL
      END,
      0
    ),
    ii.standard_panel_price,
    ii.price_to_patient_max,
    0
  ) * (1 - COALESCE(ip.medication_discount_pct, 0) / 100.0),
  2
)
FROM public.consultations c
JOIN public.queue_entries qe ON qe.id = c.queue_entry_id
JOIN public.insurance_providers ip ON ip.id = qe.panel_id
JOIN public.inventory_items ii ON true
WHERE ci.consultation_id = c.id
  AND ii.id = ci.item_id
  AND ci.deleted_at IS NULL
  AND ci.item_id IS NOT NULL
  AND ci.price = 0
  AND COALESCE(ii.standard_panel_price, ii.price_to_patient_max, 0) > 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.panel_price_overrides ppo
    WHERE ppo.panel_id = qe.panel_id
      AND ppo.item_id = ci.item_id
  );
