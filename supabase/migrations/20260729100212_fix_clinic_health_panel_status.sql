-- insurance_providers uses status ('active'/'inactive'); it has no is_active
-- column. Keep the clinic-health RPC aligned with the panel directory schema.
CREATE OR REPLACE FUNCTION public.get_clinic_health_metrics(_start_date date, _end_date date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.is_staff_or_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT jsonb_build_object(
    'financial', jsonb_build_object(
      'revenue', COALESCE((SELECT SUM(ci.price * ci.quantity) FROM consultation_items ci JOIN consultations c ON c.id = ci.consultation_id JOIN queue_entries q ON q.id = c.queue_entry_id WHERE (timezone('Asia/Kuala_Lumpur', q.created_at))::date BETWEEN _start_date AND _end_date AND (c.status = 'completed' OR q.clinic_status = 'completed') AND c.deleted_at IS NULL AND ci.deleted_at IS NULL), 0),
      'profit', COALESCE((SELECT SUM((ci.price - ci.unit_cost) * ci.quantity) FROM consultation_items ci JOIN consultations c ON c.id = ci.consultation_id JOIN queue_entries q ON q.id = c.queue_entry_id WHERE (timezone('Asia/Kuala_Lumpur', q.created_at))::date BETWEEN _start_date AND _end_date AND (c.status = 'completed' OR q.clinic_status = 'completed') AND c.deleted_at IS NULL AND ci.deleted_at IS NULL), 0),
      'marginPct', COALESCE((SELECT 100 * SUM((ci.price - ci.unit_cost) * ci.quantity) / NULLIF(SUM(ci.price * ci.quantity), 0) FROM consultation_items ci JOIN consultations c ON c.id = ci.consultation_id JOIN queue_entries q ON q.id = c.queue_entry_id WHERE (timezone('Asia/Kuala_Lumpur', q.created_at))::date BETWEEN _start_date AND _end_date AND (c.status = 'completed' OR q.clinic_status = 'completed') AND c.deleted_at IS NULL AND ci.deleted_at IS NULL), 0)
    ),
    'visits', jsonb_build_object(
      'registered', (SELECT COUNT(*) FROM queue_entries WHERE created_at::date BETWEEN _start_date AND _end_date),
      'completed', (SELECT COUNT(*) FROM queue_entries WHERE created_at::date BETWEEN _start_date AND _end_date AND clinic_status = 'completed'),
      'cancelled', (SELECT COUNT(*) FROM queue_entries WHERE created_at::date BETWEEN _start_date AND _end_date AND clinic_status = 'cancelled'),
      'noShow', (SELECT COUNT(*) FROM queue_entries WHERE created_at::date BETWEEN _start_date AND _end_date AND clinic_status::text = 'no_show')
    ),
    'claims', jsonb_build_object(
      'outstandingAmount', COALESCE((SELECT SUM(GREATEST(amount - COALESCE(received_amount, 0), 0)) FILTER (WHERE status = ANY (ARRAY['pending', 'submitted', 'approved']::panel_claim_status[])) FROM panel_claims WHERE claim_date BETWEEN _start_date AND _end_date), 0),
      'unsubmittedCount', (SELECT COUNT(*) FROM panel_claims WHERE claim_date BETWEEN _start_date AND _end_date AND submitted_date IS NULL),
      'overdueCount', (SELECT COUNT(*) FROM panel_claims WHERE due_date < CURRENT_DATE AND status = ANY (ARRAY['pending', 'submitted', 'approved']::panel_claim_status[]))
    ),
    'panelFees', jsonb_build_object(
      'activePanels', (SELECT COUNT(*) FROM insurance_providers WHERE status = 'active'),
      'missingDefaultCount', (SELECT COUNT(*) FROM insurance_providers WHERE status = 'active' AND consultation_fee_override IS NULL),
      'mismatchedVisitCount', 0
    ),
    'inventory', jsonb_build_object(
      'outOfStockCount', (SELECT COUNT(*) FROM inventory_items i WHERE NOT EXISTS (SELECT 1 FROM inventory_item_batches b WHERE b.inventory_item_id = i.id AND b.quantity_remaining > 0 AND b.expiry_date >= CURRENT_DATE)),
      'belowReorderCount', 0,
      'expiring60DaysCount', (SELECT COUNT(DISTINCT inventory_item_id) FROM inventory_item_batches WHERE quantity_remaining > 0 AND expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 60)
    ),
    'dataQuality', jsonb_build_object(
      'completedWithoutPayment', (SELECT COUNT(*) FROM queue_entries q WHERE (timezone('Asia/Kuala_Lumpur', q.created_at))::date BETWEEN _start_date AND _end_date AND q.clinic_status = 'completed' AND COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.queue_entry_id = q.id AND p.deleted_at IS NULL), 0) <= 0.005),
      'panelVisitWithoutPanel', (SELECT COUNT(*) FROM queue_entries WHERE created_at::date BETWEEN _start_date AND _end_date AND payment_method LIKE 'panel%' AND panel_id IS NULL),
      'consultationWithoutFee', (SELECT COUNT(*) FROM consultations c JOIN queue_entries q ON q.id = c.queue_entry_id WHERE q.created_at::date BETWEEN _start_date AND _end_date AND c.status = 'completed' AND NOT EXISTS (SELECT 1 FROM consultation_items ci WHERE ci.consultation_id = c.id AND ci.deleted_at IS NULL))
    )
  ) INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_clinic_health_metrics(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_clinic_health_metrics(date, date) TO authenticated;
