-- A. UUID relations + unit_cost on consultation_items
ALTER TABLE public.consultation_items
  ADD COLUMN IF NOT EXISTS item_id    uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS service_id uuid REFERENCES public.services(id)        ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS package_id uuid REFERENCES public.packages(id)        ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unit_cost  numeric(10,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_consultation_items_ids
  ON public.consultation_items(item_id, service_id, package_id);

-- B. Add cost to packages
ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS cost numeric(10,2) NOT NULL DEFAULT 0;

-- C. Refined COGS snapshot trigger — INSERT + UPDATE, recalc only when source changes
CREATE OR REPLACE FUNCTION public.trg_lock_cogs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT')
     OR (NEW.item_id    IS DISTINCT FROM OLD.item_id)
     OR (NEW.service_id IS DISTINCT FROM OLD.service_id)
     OR (NEW.package_id IS DISTINCT FROM OLD.package_id)
     OR (NEW.item_name  IS DISTINCT FROM OLD.item_name) THEN

    IF NEW.item_id IS NOT NULL THEN
      NEW.unit_cost := COALESCE((SELECT cost_price FROM public.inventory_items WHERE id = NEW.item_id), 0);
    ELSIF NEW.service_id IS NOT NULL THEN
      NEW.unit_cost := COALESCE((SELECT cost FROM public.services WHERE id = NEW.service_id), 0);
    ELSIF NEW.package_id IS NOT NULL THEN
      NEW.unit_cost := COALESCE((SELECT cost FROM public.packages WHERE id = NEW.package_id), 0);
    ELSE
      NEW.unit_cost := COALESCE(
        (SELECT cost_price FROM public.inventory_items WHERE name = NEW.item_name AND status = 'active' LIMIT 1),
        (SELECT cost FROM public.services             WHERE name = NEW.item_name LIMIT 1),
        (SELECT cost FROM public.packages             WHERE name = NEW.item_name LIMIT 1),
        0
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS before_insert_lock_cogs ON public.consultation_items;
DROP TRIGGER IF EXISTS lock_cogs_on_change     ON public.consultation_items;
CREATE TRIGGER lock_cogs_on_change
  BEFORE INSERT OR UPDATE ON public.consultation_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_lock_cogs();

-- D. Diagnosis grouping
ALTER TABLE public.diagnoses
  ADD COLUMN IF NOT EXISTS group_category text NOT NULL DEFAULT 'Uncategorized';
CREATE INDEX IF NOT EXISTS idx_diagnoses_group_category ON public.diagnoses(group_category);

-- E. Historical backfill — inventory, services, AND packages
UPDATE public.consultation_items ci
   SET unit_cost = ii.cost_price
  FROM public.inventory_items ii
 WHERE ci.unit_cost = 0 AND ci.item_name = ii.name AND ii.status = 'active';

UPDATE public.consultation_items ci
   SET unit_cost = s.cost
  FROM public.services s
 WHERE ci.unit_cost = 0 AND ci.item_name = s.name;

UPDATE public.consultation_items ci
   SET unit_cost = p.cost
  FROM public.packages p
 WHERE ci.unit_cost = 0 AND ci.item_name = p.name;