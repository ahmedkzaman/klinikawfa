ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS item_code varchar(100),
  ADD COLUMN IF NOT EXISTS is_otc    boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS brand     varchar(100),
  ADD COLUMN IF NOT EXISTS uom       varchar(50);