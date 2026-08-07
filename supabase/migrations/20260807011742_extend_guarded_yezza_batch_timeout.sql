-- Historical consultation batches perform many guarded, idempotent inserts in
-- one transaction. Allow enough time for a 2,000-visit batch while retaining a
-- finite ceiling so a stuck import cannot run indefinitely.
ALTER FUNCTION public.apply_yezza_import(uuid, uuid, text, jsonb)
  SET statement_timeout = '120s';
