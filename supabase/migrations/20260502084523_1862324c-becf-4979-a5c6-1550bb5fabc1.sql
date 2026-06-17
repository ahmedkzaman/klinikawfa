ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS price_tier_1 numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_tier_2 numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_items_archived_at
  ON public.inventory_items (archived_at);