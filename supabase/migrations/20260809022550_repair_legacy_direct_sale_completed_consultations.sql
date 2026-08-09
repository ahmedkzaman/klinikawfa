-- Older OTC Direct Sale checkouts could leave the consultation as in_progress
-- even after the queue entry was completed. Completed-bill correction requires
-- a completed consultation, so repair only those already-completed direct-sale
-- rows without touching active consultations.
UPDATE public.consultations AS consultation
SET status = 'completed'
FROM public.queue_entries AS queue_entry
WHERE consultation.queue_entry_id = queue_entry.id
  AND consultation.deleted_at IS NULL
  AND queue_entry.deleted_at IS NULL
  AND queue_entry.clinic_status = 'completed'
  AND consultation.status = 'in_progress'
  AND consultation.case_note = 'Direct Sale (OTC counter sale)'
  AND consultation.doctor_id IS NULL;
