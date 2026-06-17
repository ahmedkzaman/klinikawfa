ALTER TABLE public.clinic_settings
  ADD COLUMN IF NOT EXISTS procurement_urgent_days integer NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS procurement_surge_trend numeric(6,2) NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS procurement_surge_lift numeric(6,2) NOT NULL DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS procurement_surge_days_cover integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS forecast_top_diagnoses integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS forecast_top_items integer NOT NULL DEFAULT 3;