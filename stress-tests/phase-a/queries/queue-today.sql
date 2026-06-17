-- useQueueEntries: today
SELECT qe.*, p.name AS patient_name, p.reg_no
FROM public.queue_entries qe
JOIN public.patients p ON p.id = qe.patient_id
WHERE qe.created_at::date = current_date
  AND qe.deleted_at IS NULL
  AND qe.clinic_status <> 'completed'
ORDER BY qe.queue_sequence ASC;
