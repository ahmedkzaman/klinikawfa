DROP VIEW IF EXISTS public.insight_financials_view;

CREATE VIEW public.insight_financials_view
WITH (security_invoker = true)
AS
SELECT 
  ci.id,
  ci.item_name,
  DATE(qe.created_at) AS visit_date,
  qe.payment_method,
  (ci.price * ci.quantity) AS revenue,
  ((ci.price - ci.unit_cost) * ci.quantity) AS profit,
  qe.id AS queue_entry_id
FROM public.consultation_items ci
JOIN public.consultations c ON ci.consultation_id = c.id
JOIN public.queue_entries qe ON c.queue_entry_id = qe.id
WHERE c.status = 'completed'
  AND ci.deleted_at IS NULL
  AND c.deleted_at IS NULL;