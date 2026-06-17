-- usePatientVisitHistory
SELECT c.id, c.created_at, c.status, c.diagnosis, qe.queue_sequence
FROM public.consultations c
LEFT JOIN public.queue_entries qe ON qe.id = c.queue_entry_id
WHERE c.patient_id = :patient_id
  AND c.deleted_at IS NULL
ORDER BY c.created_at DESC
LIMIT 100;
