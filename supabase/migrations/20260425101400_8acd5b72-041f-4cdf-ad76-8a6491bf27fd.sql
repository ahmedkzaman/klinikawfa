ALTER TABLE public.diagnoses ADD COLUMN IF NOT EXISTS icd10_code varchar(20);
CREATE INDEX IF NOT EXISTS idx_diagnoses_icd10 ON public.diagnoses(icd10_code);