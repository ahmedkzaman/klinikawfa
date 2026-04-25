ALTER TABLE public.inventory_items
ADD COLUMN IF NOT EXISTS default_indication text,
ADD COLUMN IF NOT EXISTS default_dosage_qty varchar(50),
ADD COLUMN IF NOT EXISTS default_dosage_unit varchar(50),
ADD COLUMN IF NOT EXISTS default_frequency varchar(50),
ADD COLUMN IF NOT EXISTS default_instruction varchar(100),
ADD COLUMN IF NOT EXISTS default_duration varchar(50),
ADD COLUMN IF NOT EXISTS default_duration_unit varchar(50),
ADD COLUMN IF NOT EXISTS default_precaution text;