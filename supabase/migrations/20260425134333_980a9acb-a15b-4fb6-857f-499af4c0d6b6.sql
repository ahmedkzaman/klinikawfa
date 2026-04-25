ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS category varchar(50) DEFAULT 'Medication';

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS category varchar(50) DEFAULT 'General Service';

UPDATE public.inventory_items SET category = 'Medication'      WHERE category IS NULL;
UPDATE public.services        SET category = 'General Service' WHERE category IS NULL;