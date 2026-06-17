ALTER TABLE public.queue_entries
  ADD COLUMN IF NOT EXISTS visit_type text NOT NULL DEFAULT 'consultation';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'queue_entries_visit_type_check'
  ) THEN
    ALTER TABLE public.queue_entries
      ADD CONSTRAINT queue_entries_visit_type_check
      CHECK (visit_type IN ('consultation','direct_sale'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_queue_entries_visit_type
  ON public.queue_entries(visit_type);