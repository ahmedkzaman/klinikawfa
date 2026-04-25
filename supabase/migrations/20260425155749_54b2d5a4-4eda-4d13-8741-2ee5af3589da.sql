ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS principal_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS relationship varchar(50);

CREATE INDEX IF NOT EXISTS idx_patients_principal_id
  ON public.patients(principal_id) WHERE principal_id IS NOT NULL;