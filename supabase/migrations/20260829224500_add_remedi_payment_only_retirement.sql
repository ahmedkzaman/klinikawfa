-- Retire imported payment_only queue entries that duplicate live same-day visits.
-- Modeled on retire_remedi_duplicate but keyed on invoice_map (payment_only imports
-- have no encounter_map row). Captures full row images before delete, same as the
-- encounter variant. Owner-only, idempotent.
CREATE OR REPLACE FUNCTION private.retire_remedi_payment_only(
  _retirement_batch_id uuid,
  _invoice_map_id uuid,
  _financial_subcase text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_batch uuid;
  v_invoice private.remedi_invoice_map%ROWTYPE;
  v_qe_id uuid;
  v_payment_ids uuid[];
  v_claim_id uuid;
  v_deleted integer := 0;
  v_item public.consultation_items%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_claim public.panel_claims%ROWTYPE;
  v_consult public.consultations%ROWTYPE;
  v_queue public.queue_entries%ROWTYPE;
BEGIN
  -- 1) Retirement batch must exist and be planned/rehearsed/applied.
  SELECT base_batch_id INTO v_batch
  FROM private.remedi_retirement_batches
  WHERE id = _retirement_batch_id
    AND status IN ('planned', 'rehearsed', 'applied')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REMEDI_RETIRE_BATCH_NOT_ELIGIBLE';
  END IF;

  -- 2) Invoice map row must exist for this batch + id.
  SELECT * INTO v_invoice
  FROM private.remedi_invoice_map
  WHERE id = _invoice_map_id
    AND batch_id = v_batch
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REMEDI_RETIRE_INVOICE_NOT_MAPPED';
  END IF;
  IF v_invoice.reconciliation_status = 'retired_duplicate_of_live' THEN
    RETURN 0; -- idempotent no-op
  END IF;

  v_qe_id := v_invoice.queue_entry_id;

  -- 3) Verify subcase against actual money on the imported side.
  SELECT array_agg(p.id) INTO v_payment_ids
  FROM public.payments p
  WHERE p.queue_entry_id = v_qe_id;
  SELECT pc.id INTO v_claim_id
  FROM public.panel_claims pc
  WHERE pc.queue_entry_id = v_qe_id
  LIMIT 1;

  IF _financial_subcase = 'A_clinical_only'
     AND (v_payment_ids IS NOT NULL OR v_claim_id IS NOT NULL) THEN
    RAISE EXCEPTION 'REMEDI_RETIRE_SUBCASE_MISMATCH: money present on imported side';
  END IF;
  IF _financial_subcase = 'D_with_payments' AND v_payment_ids IS NULL THEN
    RAISE EXCEPTION 'REMEDI_RETIRE_SUBCASE_MISMATCH: no payments present';
  END IF;
  IF _financial_subcase = 'E_with_claim' AND v_claim_id IS NULL THEN
    RAISE EXCEPTION 'REMEDI_RETIRE_SUBCASE_MISMATCH: no panel claim present';
  END IF;

  -- 4) Capture full row images BEFORE any delete.
  FOR v_item IN
    SELECT * FROM public.consultation_items ci
    WHERE ci.consultation_id IN (
      SELECT c.id FROM public.consultations c WHERE c.queue_entry_id = v_qe_id
    )
  LOOP
    PERFORM private.remedi_retire_capture_row(_retirement_batch_id, 'public', 'consultation_items', v_item);
  END LOOP;
  FOR v_payment IN
    SELECT * FROM public.payments p WHERE p.queue_entry_id = v_qe_id
  LOOP
    PERFORM private.remedi_retire_capture_row(_retirement_batch_id, 'public', 'payments', v_payment);
  END LOOP;
  IF v_claim_id IS NOT NULL THEN
    FOR v_claim IN
      SELECT * FROM public.panel_claims pc WHERE pc.id = v_claim_id
    LOOP
      PERFORM private.remedi_retire_capture_row(_retirement_batch_id, 'public', 'panel_claims', v_claim);
    END LOOP;
  END IF;
  FOR v_consult IN
    SELECT * FROM public.consultations c WHERE c.queue_entry_id = v_qe_id
  LOOP
    PERFORM private.remedi_retire_capture_row(_retirement_batch_id, 'public', 'consultations', v_consult);
  END LOOP;
  FOR v_queue IN
    SELECT * FROM public.queue_entries q WHERE q.id = v_qe_id
  LOOP
    PERFORM private.remedi_retire_capture_row(_retirement_batch_id, 'public', 'queue_entries', v_queue);
  END LOOP;

  -- 5) Release the invoice map's reference to the claim BEFORE deleting it.
  IF v_invoice.panel_claim_id IS NOT NULL THEN
    UPDATE private.remedi_invoice_map
    SET panel_claim_id = NULL
    WHERE id = v_invoice.id;
  END IF;

  -- 6) Delete in FK-safe order.
  DELETE FROM public.panel_claims pc WHERE pc.id = v_claim_id;
  IF v_payment_ids IS NOT NULL THEN
    DELETE FROM public.payments p WHERE p.id = ANY(v_payment_ids);
  END IF;
  DELETE FROM public.consultation_items ci WHERE ci.consultation_id IN (
    SELECT c.id FROM public.consultations c WHERE c.queue_entry_id = v_qe_id
  );
  DELETE FROM public.consultations c WHERE c.queue_entry_id = v_qe_id;
  DELETE FROM public.queue_entries q WHERE q.id = v_qe_id;
  v_deleted := 1;

  -- 7) Update the invoice map status.
  UPDATE private.remedi_invoice_map
  SET reconciliation_status = 'retired_duplicate_of_live'
  WHERE id = v_invoice.id;

  -- 8) Record the conflict resolution.
  INSERT INTO private.remedi_import_conflicts
    (id, batch_id, conflict_type, severity, status, source_key_hash, details, resolved_at)
  VALUES
    (pg_catalog.gen_random_uuid(),
     v_batch, 'duplicate_payment_only_of_live', 'warning', 'resolved',
     v_invoice.source_key_hash,
     jsonb_build_object(
       'retirement_batch_id', _retirement_batch_id,
       'financial_subcase', _financial_subcase,
       'invoice_map_id', _invoice_map_id,
       'bill_number', v_invoice.bill_number
     ),
     pg_catalog.now())
  ON CONFLICT (batch_id, source_key_hash) DO UPDATE
  SET conflict_type = EXCLUDED.conflict_type,
      severity = EXCLUDED.severity,
      status = 'resolved',
      details = EXCLUDED.details,
      resolved_at = EXCLUDED.resolved_at;

  RETURN v_deleted;
END
$function$;

REVOKE ALL ON FUNCTION private.retire_remedi_payment_only(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.retire_remedi_payment_only(uuid, uuid, text) FROM anon, authenticated, service_role;
