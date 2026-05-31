-- DispenseCheckout: consultation + items + payments
SELECT c.id, c.status, c.patient_id,
  COALESCE((SELECT SUM(price*quantity) FROM public.consultation_items WHERE consultation_id = c.id AND deleted_at IS NULL), 0) AS total,
  COALESCE((SELECT SUM(amount) FROM public.payments WHERE consultation_id = c.id AND deleted_at IS NULL), 0) AS paid
FROM public.consultations c
WHERE c.id = :consultation_id;
