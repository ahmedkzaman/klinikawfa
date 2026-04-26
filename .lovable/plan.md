## Root Cause

The `Price tier = "Select tier"` and `Rate (RM) = 0` you see on the auto-seeded **CONSULTATION FEE** row is not a UI bug — it's the database silently overwriting your price.

When `useAddConsultationItem` inserts the row, the DB trigger **`trg_resolve_selling_price`** runs and rewrites `NEW.price`. Its logic is:

1. Look up `inventory_items` if `item_id` is set,
2. else look up `services` if `service_id` is set,
3. else look up `packages` if `package_id` is set,
4. Then `NEW.price := COALESCE(v_self_pay, 0)`.

The auto-seed insert sends only `item_name: 'Consultation Fee'` + `price: 45` with **no `item_id` / `service_id` / `package_id`**, because there is no "Consultation Fee" entry in the catalog (verified — no matching service/inventory item exists). All three lookups return NULL, the COALESCE collapses to `0`, and your RM 45 is discarded. The Price Tier field stays empty for the same reason — the trigger never sets one and the insert doesn't either.

This same bug will silently zero **any future ad-hoc / free-text item** a doctor types in.

## Fix — Patch the trigger to respect manual prices

### A. Migration: update `public.trg_resolve_selling_price`

Add an early-exit branch at the top of the function: **if no catalog reference is supplied (`item_id`, `service_id`, and `package_id` are all NULL), keep `NEW.price` exactly as the caller passed it and stamp `price_tier = 'SELF PAY'` (or `'PANEL'` when the queue entry has a panel) so the UI shows the correct tier instead of "Select tier".**

```sql
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
  -- Identify payer profile for this visit (needed for tier stamping below)
  SELECT qe.panel_id INTO v_panel_id
  FROM public.consultations c
  JOIN public.queue_entries qe ON c.queue_entry_id = qe.id
  WHERE c.id = NEW.consultation_id;

  -- NEW: Manual / free-text item (no catalog link). Trust the caller's price
  -- and stamp a sensible tier so the UI doesn't render "Select tier".
  IF NEW.item_id IS NULL
     AND NEW.service_id IS NULL
     AND NEW.package_id IS NULL THEN
    NEW.price      := COALESCE(NEW.price, 0);
    NEW.price_tier := COALESCE(NEW.price_tier,
                               CASE WHEN v_panel_id IS NOT NULL
                                    THEN 'PANEL' ELSE 'SELF PAY' END);
    RETURN NEW;
  END IF;

  -- Existing catalog-resolution logic (unchanged) ...
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
```

The catalog branch is preserved exactly as today — panel-aware pricing, override hierarchy, all unchanged. Only the previously-broken "no catalog reference" path is fixed.

### B. Frontend update: `src/hooks/clinic/useConsultationItems.ts`

Update the JSDoc on `useAddConsultationItem` to reflect the new contract: **the frontend's `price` is now authoritative when no `item_id`/`service_id`/`package_id` is provided.** Also extend the mutation input type to include an optional `price_tier` so callers can stamp it explicitly.

### C. Backfill the broken row on the current consultation

The existing zero-priced "Consultation Fee" row on consultation `ce6edfc6-…` is already in the DB with `price = 0`. After the trigger is fixed, run a one-shot UPDATE to set its `price = 45` and `price_tier = 'SELF PAY'` so the doctor sees the right number on this visit without having to delete + re-add the row.

### D. (Optional, no extra change required)

The auto-seed code in `ConsultationDetail.tsx` already passes `price: feePrice` from the `default_consultation_fee_price` preference (currently `45`). With the trigger patched, that value will be honored on insert and the Price Tier dropdown will show `SELF PAY` instead of "Select tier".

## What this does NOT change

- Catalog-linked items (medicines, services, packages from `Add in bulk`) still have their price resolved by the trigger using the existing Override → Standard Panel → Self Pay hierarchy. No regression to your panel billing flow.
- Manual UPDATE-based price adjustments via `useUpdateConsultationItem` continue to work as today.

## Files / migrations

- **Migration**: replace `public.trg_resolve_selling_price` with the patched version above.
- **Data fix**: `UPDATE consultation_items SET price = 45, price_tier = 'SELF PAY' WHERE consultation_id IN (SELECT id FROM consultations WHERE queue_entry_id = '<current entry>') AND item_name = 'Consultation Fee' AND price = 0 AND item_id IS NULL AND service_id IS NULL AND package_id IS NULL;`
- **Code**: `src/hooks/clinic/useConsultationItems.ts` — JSDoc + type update only (no behavior change in TS).
