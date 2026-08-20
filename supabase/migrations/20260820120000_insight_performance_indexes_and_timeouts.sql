-- Performance remediation for the insight performance RPC stack.
--
-- Symptoms (live, 2026-08-20):
--   get_insight_performance_filtered(doctor filter): >60s (timeout even at 60s)
--   get_insight_performance_filtered(no filter, 29d): ~15s
--   get_insight_performance (base, 29d): ~8.9s (times out at default 8s)
--   get_insight_clinical_attendance_heatmap: 0.5s (fast — already fixed)
--
-- Root causes:
--   1) The filtered functions run per-row EXISTS subqueries on payments
--      (payment classification per queue_entry). Without a covering partial
--      index on payments(queue_entry_id) WHERE deleted_at IS NULL, each row
--      triggers a scan.
--   2) statement_timeout defaults to 8s cluster-wide; only the outer
--      get_insight_performance_filtered was raised earlier. The base
--      get_insight_performance and the detail variant also need headroom.
--
-- Fixes:
--   A) Partial indexes for the per-row classification lookups.
--   B) statement_timeout raised on the remaining heavy functions.
--
-- All CREATE INDEX statements use IF NOT EXISTS and are safe to re-run.

-- A1) Payment classification lookups: EXISTS over payments per queue_entry.
CREATE INDEX IF NOT EXISTS idx_payments_queue_entry_active
  ON public.payments (queue_entry_id)
  WHERE deleted_at IS NULL;

-- A2) The timezone date filter on queue_entries.created_at is the range anchor
--     for every insight query. A plain created_at index lets Postgres use an
--     index-only scan for the range then filter by clinic_status.
CREATE INDEX IF NOT EXISTS idx_queue_entries_created_at
  ON public.queue_entries (created_at)
  WHERE deleted_at IS NULL AND cancelled_at IS NULL;

-- A3) consultations(status, deleted_at, doctor_id) covers the visit pool CTE.
CREATE INDEX IF NOT EXISTS idx_consultations_status_doctor
  ON public.consultations (status, doctor_id)
  WHERE deleted_at IS NULL;

-- A4) consultation_items.consultation_id powers the item_totals JOIN.
CREATE INDEX IF NOT EXISTS idx_consultation_items_consultation
  ON public.consultation_items (consultation_id)
  WHERE deleted_at IS NULL;

-- A5) consultation_documents.consultation_id powers the document CTEs.
CREATE INDEX IF NOT EXISTS idx_consultation_documents_consultation
  ON public.consultation_documents (consultation_id);

-- B1) Base function: same 60s headroom as the filtered wrapper.
ALTER FUNCTION public.get_insight_performance(date, date)
  SET statement_timeout = '60s';

-- B2) Detail variant used by the doctor drill-down.
ALTER FUNCTION public.get_insight_performance_detail_filtered(date, date, text, text, uuid, text, text)
  SET statement_timeout = '60s';

COMMENT ON FUNCTION public.get_insight_performance(date, date) IS
  'Base clinic-wide insight performance. statement_timeout=60s (raised 2026-08-20: heavy CTE stack exceeds the default 8s).';