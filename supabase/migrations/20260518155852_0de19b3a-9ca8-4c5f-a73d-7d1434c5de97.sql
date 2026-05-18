ALTER TABLE public.drug_label_settings
  ADD COLUMN IF NOT EXISTS font_size_clinic numeric NOT NULL DEFAULT 8.0,
  ADD COLUMN IF NOT EXISTS font_size_medicine numeric NOT NULL DEFAULT 8.0,
  ADD COLUMN IF NOT EXISTS font_size_instruction numeric NOT NULL DEFAULT 6.5;