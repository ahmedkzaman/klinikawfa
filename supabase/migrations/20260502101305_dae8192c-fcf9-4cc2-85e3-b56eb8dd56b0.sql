ALTER TABLE public.clinic_settings
  ADD COLUMN IF NOT EXISTS bank_name TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_no TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_holder TEXT;