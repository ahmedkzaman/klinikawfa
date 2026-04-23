-- Migration 4: Inventory Allocation (B.3)

-- 1. Schema: add allocated_quantity column
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS allocated_quantity INTEGER NOT NULL DEFAULT 0
    CHECK (allocated_quantity >= 0);

-- 2. Helper: available_quantity
CREATE OR REPLACE FUNCTION public.available_quantity(_item_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT GREATEST(stock - allocated_quantity, 0)
  FROM public.inventory_items WHERE id = _item_id
$$;
ALTER FUNCTION public.available_quantity(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.available_quantity(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.available_quantity(uuid) TO authenticated;

-- 3. Mutator: reserve_inventory
CREATE OR REPLACE FUNCTION public.reserve_inventory(_item_id uuid, _qty integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock integer;
  v_alloc integer;
BEGIN
  IF _qty IS NULL OR _qty <= 0 THEN
    RETURN;
  END IF;

  SELECT stock, allocated_quantity INTO v_stock, v_alloc
  FROM public.inventory_items
  WHERE id = _item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN; -- non-inventory item, skip silently
  END IF;

  IF (v_stock - v_alloc) < _qty THEN
    RAISE EXCEPTION 'insufficient_stock' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.inventory_items
     SET allocated_quantity = allocated_quantity + _qty,
         updated_at = now()
   WHERE id = _item_id;
END;
$$;
ALTER FUNCTION public.reserve_inventory(uuid, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reserve_inventory(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_inventory(uuid, integer) TO authenticated;

-- 4. Mutator: commit_inventory
CREATE OR REPLACE FUNCTION public.commit_inventory(_item_id uuid, _qty integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock integer;
  v_alloc integer;
BEGIN
  IF _qty IS NULL OR _qty <= 0 THEN
    RETURN;
  END IF;

  SELECT stock, allocated_quantity INTO v_stock, v_alloc
  FROM public.inventory_items
  WHERE id = _item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.inventory_items
     SET stock = GREATEST(stock - _qty, 0),
         allocated_quantity = GREATEST(allocated_quantity - _qty, 0),
         updated_at = now()
   WHERE id = _item_id;
END;
$$;
ALTER FUNCTION public.commit_inventory(uuid, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.commit_inventory(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.commit_inventory(uuid, integer) TO authenticated;

-- 5. Mutator: release_inventory
CREATE OR REPLACE FUNCTION public.release_inventory(_item_id uuid, _qty integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _qty IS NULL OR _qty <= 0 THEN
    RETURN;
  END IF;

  PERFORM 1 FROM public.inventory_items WHERE id = _item_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.inventory_items
     SET allocated_quantity = GREATEST(allocated_quantity - _qty, 0),
         updated_at = now()
   WHERE id = _item_id;
END;
$$;
ALTER FUNCTION public.release_inventory(uuid, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.release_inventory(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_inventory(uuid, integer) TO authenticated;

-- 6. Item resolver helper (internal)
CREATE OR REPLACE FUNCTION public._resolve_inventory_item_id(_item_name text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.inventory_items
  WHERE name = _item_name AND status = 'active'
  LIMIT 1
$$;
ALTER FUNCTION public._resolve_inventory_item_id(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public._resolve_inventory_item_id(text) FROM PUBLIC;

-- 7. Trigger function for consultation_items
CREATE OR REPLACE FUNCTION public.trg_consultation_items_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item_id uuid;
  v_old_item_id uuid;
  v_diff integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.deleted_at IS NULL THEN
      v_item_id := public._resolve_inventory_item_id(NEW.item_name);
      IF v_item_id IS NOT NULL THEN
        PERFORM public.reserve_inventory(v_item_id, NEW.quantity);
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Soft-delete transition: release full quantity
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      v_item_id := public._resolve_inventory_item_id(OLD.item_name);
      IF v_item_id IS NOT NULL THEN
        PERFORM public.release_inventory(v_item_id, OLD.quantity);
      END IF;
      RETURN NEW;
    END IF;

    -- Active → Active: reconcile quantity diff (only if item_name unchanged)
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NULL THEN
      IF OLD.item_name = NEW.item_name THEN
        v_item_id := public._resolve_inventory_item_id(NEW.item_name);
        IF v_item_id IS NOT NULL THEN
          v_diff := NEW.quantity - OLD.quantity;
          IF v_diff > 0 THEN
            PERFORM public.reserve_inventory(v_item_id, v_diff);
          ELSIF v_diff < 0 THEN
            PERFORM public.release_inventory(v_item_id, -v_diff);
          END IF;
        END IF;
      ELSE
        -- item_name changed: release old, reserve new
        v_old_item_id := public._resolve_inventory_item_id(OLD.item_name);
        IF v_old_item_id IS NOT NULL THEN
          PERFORM public.release_inventory(v_old_item_id, OLD.quantity);
        END IF;
        v_item_id := public._resolve_inventory_item_id(NEW.item_name);
        IF v_item_id IS NOT NULL THEN
          PERFORM public.reserve_inventory(v_item_id, NEW.quantity);
        END IF;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;
ALTER FUNCTION public.trg_consultation_items_inventory() OWNER TO postgres;

DROP TRIGGER IF EXISTS consultation_items_inventory_aiu ON public.consultation_items;
CREATE TRIGGER consultation_items_inventory_aiu
AFTER INSERT OR UPDATE ON public.consultation_items
FOR EACH ROW
EXECUTE FUNCTION public.trg_consultation_items_inventory();

-- 8. Trigger function for consultations (status + soft-delete)
CREATE OR REPLACE FUNCTION public.trg_consultations_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_item_id uuid;
BEGIN
  -- Completion: commit all active items
  IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN
    FOR r IN
      SELECT item_name, quantity
      FROM public.consultation_items
      WHERE consultation_id = NEW.id AND deleted_at IS NULL
    LOOP
      v_item_id := public._resolve_inventory_item_id(r.item_name);
      IF v_item_id IS NOT NULL THEN
        PERFORM public.commit_inventory(v_item_id, r.quantity);
      END IF;
    END LOOP;
  END IF;

  -- Soft-delete consultation: release all still-active items
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    FOR r IN
      SELECT item_name, quantity
      FROM public.consultation_items
      WHERE consultation_id = NEW.id AND deleted_at IS NULL
    LOOP
      v_item_id := public._resolve_inventory_item_id(r.item_name);
      IF v_item_id IS NOT NULL THEN
        PERFORM public.release_inventory(v_item_id, r.quantity);
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;
ALTER FUNCTION public.trg_consultations_inventory() OWNER TO postgres;

DROP TRIGGER IF EXISTS consultations_inventory_au ON public.consultations;
CREATE TRIGGER consultations_inventory_au
AFTER UPDATE ON public.consultations
FOR EACH ROW
EXECUTE FUNCTION public.trg_consultations_inventory();