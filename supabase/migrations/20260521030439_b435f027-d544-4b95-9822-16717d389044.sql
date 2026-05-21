ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS id_type text NOT NULL DEFAULT 'mykad';

DO $$ BEGIN
  ALTER TABLE public.patients
    ADD CONSTRAINT patients_id_type_check
    CHECK (id_type IN ('mykad','passport','police','army'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;