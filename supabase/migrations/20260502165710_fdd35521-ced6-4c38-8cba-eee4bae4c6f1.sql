ALTER TABLE public.clinic_settings
ADD COLUMN IF NOT EXISTS tts_language text NOT NULL DEFAULT 'ms-MY';