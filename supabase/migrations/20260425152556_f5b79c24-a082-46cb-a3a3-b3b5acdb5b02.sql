-- Step 1: add item_code natural key to services + ensure unique partial indexes on both tables.
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS item_code varchar;

CREATE UNIQUE INDEX IF NOT EXISTS services_item_code_unique
  ON public.services (item_code)
  WHERE item_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS inventory_items_item_code_unique
  ON public.inventory_items (item_code)
  WHERE item_code IS NOT NULL;