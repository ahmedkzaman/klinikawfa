ALTER TABLE public.consultations
  ADD COLUMN IF NOT EXISTS locked_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS locked_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_consultations_locked_by
  ON public.consultations(locked_by) WHERE locked_by IS NOT NULL;