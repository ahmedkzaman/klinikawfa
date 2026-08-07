-- Older split checkout paths could close a queue entry without completing its
-- consultation. Completed-bill correction correctly rejects that inconsistent
-- state. Repair the parent status without replaying inventory, panel-claim, or
-- financial-completion side effects that already occurred when the queue closed.

LOCK TABLE public.consultations IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.consultations
  DISABLE TRIGGER consultations_inventory_au;
ALTER TABLE public.consultations
  DISABLE TRIGGER after_update_generate_panel_claim;
ALTER TABLE public.consultations
  DISABLE TRIGGER capture_financial_visit_completion_from_consultation;

UPDATE public.consultations AS c
SET status = 'completed'
FROM public.queue_entries AS qe
WHERE qe.id = c.queue_entry_id
  AND qe.deleted_at IS NULL
  AND c.deleted_at IS NULL
  AND qe.clinic_status = 'completed'
  AND c.status IS DISTINCT FROM 'completed';

ALTER TABLE public.consultations
  ENABLE TRIGGER capture_financial_visit_completion_from_consultation;
ALTER TABLE public.consultations
  ENABLE TRIGGER after_update_generate_panel_claim;
ALTER TABLE public.consultations
  ENABLE TRIGGER consultations_inventory_au;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.consultations AS c
    JOIN public.queue_entries AS qe ON qe.id = c.queue_entry_id
    WHERE qe.deleted_at IS NULL
      AND c.deleted_at IS NULL
      AND qe.clinic_status = 'completed'
      AND c.status IS DISTINCT FROM 'completed'
  ) THEN
    RAISE EXCEPTION 'LEGACY_COMPLETED_BILL_STATUS_REPAIR_INCOMPLETE';
  END IF;
END;
$$;
