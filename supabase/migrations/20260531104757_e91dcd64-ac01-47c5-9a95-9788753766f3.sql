-- Stress test Phase A index fixes (v2: IMMUTABLE-safe)

-- 1. Trigram extension
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. GIN trigram indexes for patient search
CREATE INDEX IF NOT EXISTS idx_patients_name_trgm
  ON public.patients USING GIN (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_patients_national_id_trgm
  ON public.patients USING GIN (national_id gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_patients_phone_trgm
  ON public.patients USING GIN (phone gin_trgm_ops);

-- 3a. Functional index for "Today's Queue" using fixed-timezone date
--     timezone(text, timestamptz) -> timestamp is IMMUTABLE.
CREATE INDEX IF NOT EXISTS idx_queue_entries_kl_date
  ON public.queue_entries (
    ((timezone('Asia/Kuala_Lumpur', created_at))::date),
    clinic_status
  );

-- 3b. Fallback btree for range-based "today" queries
CREATE INDEX IF NOT EXISTS idx_queue_entries_status_created
  ON public.queue_entries (clinic_status, created_at DESC);

-- 4. Partial compound index for FEFO batch resolution
CREATE INDEX IF NOT EXISTS idx_inventory_batches_fefo
  ON public.inventory_item_batches (inventory_item_id, expiry_date ASC)
  WHERE quantity_remaining > 0;

ANALYZE public.patients;
ANALYZE public.queue_entries;
ANALYZE public.inventory_item_batches;