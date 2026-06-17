DROP VIEW IF EXISTS public.insight_financials_view;

CREATE VIEW public.insight_financials_view
WITH (security_invoker = true)
AS
SELECT
  ci.id,
  ci.item_name,
  date(qe.created_at)                                AS visit_date,
  qe.payment_method,
  (ci.price * ci.quantity)::numeric                  AS revenue,
  ((ci.price - ci.unit_cost) * ci.quantity)::numeric AS profit,
  qe.id                                              AS queue_entry_id,
  c.doctor_id,
  COALESCE(d.name, 'Unassigned')                     AS doctor_name,
  c.diagnosis_id,
  COALESCE(dx.name, NULLIF(c.diagnosis_text, ''), 'Undiagnosed') AS diagnosis_name,
  qe.patient_id,
  CASE
    WHEN ci.service_id IS NOT NULL THEN 'service'
    WHEN ci.item_id    IS NOT NULL THEN 'medication'
    WHEN ci.package_id IS NOT NULL THEN 'package'
    ELSE 'other'
  END                                                AS kind
FROM public.consultation_items ci
JOIN public.consultations  c  ON ci.consultation_id = c.id
JOIN public.queue_entries  qe ON c.queue_entry_id   = qe.id
LEFT JOIN public.doctors    d  ON c.doctor_id       = d.id
LEFT JOIN public.diagnoses  dx ON c.diagnosis_id    = dx.id
WHERE c.status = 'completed'
  AND ci.deleted_at IS NULL
  AND c.deleted_at IS NULL;