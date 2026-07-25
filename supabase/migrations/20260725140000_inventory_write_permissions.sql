-- Inventory writes are operational controls. Only resident doctors and locums
-- are excluded from this permission; the database remains authoritative.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'purchaser';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'staff_nurse';

CREATE OR REPLACE FUNCTION public.can_manage_inventory(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text NOT IN ('resident_doctor', 'locum', 'guest')
  )
$function$;

ALTER FUNCTION public.can_manage_inventory(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.can_manage_inventory(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_inventory(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_view_inventory_costs(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN (
        'admin', 'special_admin', 'doctor_admin', 'ops_staff', 'operations',
        'staff', 'purchaser', 'staff_nurse', 'resident_doctor'
      )
  )
$function$;

ALTER FUNCTION public.can_view_inventory_costs(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.can_view_inventory_costs(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_inventory_costs(uuid) TO authenticated;

DROP POLICY IF EXISTS "inventory_items_ops_insert" ON public.inventory_items;
CREATE POLICY "authorized_inventory_items_insert" ON public.inventory_items
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_inventory(auth.uid()));

DROP POLICY IF EXISTS "inventory_items_ops_update" ON public.inventory_items;
DROP POLICY IF EXISTS "inventory_items_ops_delete" ON public.inventory_items;
CREATE POLICY "authorized_inventory_items_delete" ON public.inventory_items
  FOR DELETE TO authenticated
  USING (public.can_manage_inventory(auth.uid()));

DROP POLICY IF EXISTS "Staff can update inventory operational fields" ON public.inventory_items;
CREATE POLICY "Authorized staff can update inventory"
  ON public.inventory_items FOR UPDATE TO authenticated
  USING (public.can_manage_inventory(auth.uid()))
  WITH CHECK (public.can_manage_inventory(auth.uid()));

CREATE OR REPLACE FUNCTION public.guard_inventory_pricing_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF (
       NEW.cost_price            IS DISTINCT FROM OLD.cost_price
    OR NEW.price_to_patient_max  IS DISTINCT FROM OLD.price_to_patient_max
    OR NEW.standard_panel_price  IS DISTINCT FROM OLD.standard_panel_price
    OR NEW.price_tier_1          IS DISTINCT FROM OLD.price_tier_1
    OR NEW.price_tier_2          IS DISTINCT FROM OLD.price_tier_2
  ) AND NOT public.can_manage_inventory(auth.uid()) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: You do not have permission to modify inventory pricing'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

ALTER FUNCTION public.guard_inventory_pricing_update() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.guard_inventory_pricing_update() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.add_inventory_batch(
  _item_id uuid, _batch_number text, _expiry date, _qty integer,
  _cost numeric DEFAULT NULL, _po_id uuid DEFAULT NULL, _notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE v_batch_id uuid;
BEGIN
  IF NOT public.can_manage_inventory(auth.uid()) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF _qty IS NULL OR _qty <= 0 THEN RAISE EXCEPTION 'INVALID_QTY' USING ERRCODE = 'P0001'; END IF;
  IF _expiry IS NULL THEN RAISE EXCEPTION 'EXPIRY_REQUIRED' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO public.inventory_item_batches
    (inventory_item_id, batch_number, expiry_date, quantity_initial, quantity_remaining,
     cost_price, received_by, po_id, notes)
  VALUES (_item_id, _batch_number, _expiry, _qty, _qty, _cost, auth.uid(), _po_id, _notes)
  RETURNING id INTO v_batch_id;
  UPDATE public.inventory_items
     SET stock = COALESCE(stock,0) + _qty, updated_at = now(),
         nearest_expiry_date = (SELECT MIN(expiry_date) FROM public.inventory_item_batches WHERE inventory_item_id = _item_id AND quantity_remaining > 0),
         latest_expiry_date = (SELECT MAX(expiry_date) FROM public.inventory_item_batches WHERE inventory_item_id = _item_id AND quantity_remaining > 0)
   WHERE id = _item_id;
  INSERT INTO public.inventory_transactions
    (inventory_item_id, batch_id, transaction_type, qty_change, performed_by, notes)
  VALUES (_item_id, v_batch_id, 'restock', _qty, auth.uid(), _notes);
  RETURN v_batch_id;
END $function$;

ALTER FUNCTION public.add_inventory_batch(uuid, text, date, integer, numeric, uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.add_inventory_batch(uuid, text, date, integer, numeric, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_inventory_batch(uuid, text, date, integer, numeric, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.adjust_inventory_batch(
  _batch_id uuid, _delta integer, _reason text, _notes text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE v_item uuid; v_new integer;
BEGIN
  IF NOT public.can_manage_inventory(auth.uid()) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  SELECT inventory_item_id, quantity_remaining + _delta INTO v_item, v_new
  FROM public.inventory_item_batches WHERE id = _batch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BATCH_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  IF v_new < 0 THEN RAISE EXCEPTION 'NEGATIVE_RESULT' USING ERRCODE = 'P0001'; END IF;
  UPDATE public.inventory_item_batches SET quantity_remaining = v_new, updated_at = now() WHERE id = _batch_id;
  UPDATE public.inventory_items
     SET stock = GREATEST(COALESCE(stock,0) + _delta, 0), updated_at = now(),
         nearest_expiry_date = (SELECT MIN(expiry_date) FROM public.inventory_item_batches WHERE inventory_item_id = v_item AND quantity_remaining > 0)
   WHERE id = v_item;
  INSERT INTO public.inventory_transactions
    (inventory_item_id, batch_id, transaction_type, qty_change, reason_code, notes, performed_by)
  VALUES (v_item, _batch_id, 'adjustment', _delta, _reason, _notes, auth.uid());
END $function$;

ALTER FUNCTION public.adjust_inventory_batch(uuid, integer, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.adjust_inventory_batch(uuid, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_inventory_batch(uuid, integer, text, text) TO authenticated;

DROP POLICY IF EXISTS "inventory_adjustments_auth_insert" ON public.inventory_adjustments;
CREATE POLICY "authorized_inventory_adjustments_insert"
  ON public.inventory_adjustments FOR INSERT TO authenticated
  WITH CHECK (adjusted_by = auth.uid() AND public.can_manage_inventory(auth.uid()));
