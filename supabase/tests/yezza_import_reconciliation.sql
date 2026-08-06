-- Read-only, post-import reconciliation for the complete Yezza historical
-- import. Execute only against an isolated non-production database after all
-- approved batches are completed. Before sourcing this file in the same psql
-- session, set:
--   SET app.yezza_reconciliation_environment = 'isolated-non-production';
-- This script writes no data and closes with ROLLBACK.

BEGIN;

DO $yezza_reconciliation$
DECLARE
  v_environment text := current_setting('app.yezza_reconciliation_environment', true);
  v_patient_identities integer;
  v_visits integer;
  v_financial_only_visits integer;
  v_bills integer;
  v_distinct_bills integer;
  v_billed_total numeric;
  v_paid_total numeric;
  v_payment_total numeric;
  v_invalid_visit_links integer;
  v_invalid_financial_only integer;
  v_invalid_ledger_links integer;
BEGIN
  IF v_environment IS DISTINCT FROM 'isolated-non-production' THEN
    RAISE EXCEPTION 'YEZZA_RECONCILIATION_NON_PRODUCTION_GUARD_REQUIRED';
  END IF;

  SELECT count(*) INTO v_patient_identities
  FROM public.patient_external_ids
  WHERE source_system = 'yezza';

  SELECT count(*) INTO v_visits
  FROM public.visit_external_ids
  WHERE source_system = 'yezza';

  SELECT count(*) INTO v_financial_only_visits
  FROM public.visit_external_ids AS external_visit
  JOIN public.queue_entries AS queue_entry ON queue_entry.id = external_visit.queue_entry_id
  WHERE external_visit.source_system = 'yezza'
    AND queue_entry.visit_purpose = 'legacy-financial-only';

  SELECT count(*), count(DISTINCT source_bill_id), coalesce(sum(amount), 0), coalesce(sum(paid_amount), 0)
    INTO v_bills, v_distinct_bills, v_billed_total, v_paid_total
  FROM public.transaction_external_ids
  WHERE source_system = 'yezza';

  SELECT coalesce(sum(payment.amount), 0)
    INTO v_payment_total
  FROM public.payments AS payment
  JOIN public.visit_external_ids AS external_visit ON external_visit.queue_entry_id = payment.queue_entry_id
  WHERE external_visit.source_system = 'yezza'
    AND payment.deleted_at IS NULL;

  SELECT count(*) INTO v_invalid_visit_links
  FROM public.visit_external_ids AS external_visit
  LEFT JOIN public.queue_entries AS queue_entry ON queue_entry.id = external_visit.queue_entry_id
  LEFT JOIN public.patients AS patient ON patient.id = queue_entry.patient_id
  WHERE external_visit.source_system = 'yezza'
    AND (queue_entry.id IS NULL OR patient.id IS NULL);

  SELECT count(*) INTO v_invalid_financial_only
  FROM public.visit_external_ids AS external_visit
  JOIN public.queue_entries AS queue_entry ON queue_entry.id = external_visit.queue_entry_id
  LEFT JOIN public.consultations AS consultation
    ON consultation.queue_entry_id = queue_entry.id AND consultation.deleted_at IS NULL
  LEFT JOIN public.consultation_items AS item
    ON item.consultation_id = consultation.id AND item.deleted_at IS NULL
  WHERE external_visit.source_system = 'yezza'
    AND queue_entry.visit_purpose = 'legacy-financial-only'
  GROUP BY external_visit.source_visit_id
  HAVING count(consultation.id) <> 0 OR count(item.id) <> 0;
  GET DIAGNOSTICS v_invalid_financial_only = ROW_COUNT;

  SELECT count(*) INTO v_invalid_ledger_links
  FROM (
    SELECT external_patient.import_batch_id
    FROM public.patient_external_ids AS external_patient
    WHERE external_patient.source_system = 'yezza'
    UNION ALL
    SELECT external_visit.import_batch_id
    FROM public.visit_external_ids AS external_visit
    WHERE external_visit.source_system = 'yezza'
    UNION ALL
    SELECT external_transaction.import_batch_id
    FROM public.transaction_external_ids AS external_transaction
    WHERE external_transaction.source_system = 'yezza'
  ) AS import_links
  LEFT JOIN public.import_batches AS batch ON batch.id = import_links.import_batch_id
  WHERE batch.source_system IS DISTINCT FROM 'yezza'
     OR batch.status IS DISTINCT FROM 'completed';

  IF v_patient_identities <> 26578 THEN
    RAISE EXCEPTION 'YEZZA_PATIENT_IDENTITY_COUNT_MISMATCH:%', v_patient_identities;
  END IF;
  IF v_visits <> 67442 OR v_financial_only_visits <> 17442 THEN
    RAISE EXCEPTION 'YEZZA_VISIT_COUNT_MISMATCH: visits=%, financial_only=%', v_visits, v_financial_only_visits;
  END IF;
  IF v_bills <> 67442 OR v_distinct_bills <> 67442 THEN
    RAISE EXCEPTION 'YEZZA_BILL_DUPLICATION_OR_COUNT_MISMATCH: bills=%, distinct=%', v_bills, v_distinct_bills;
  END IF;
  IF v_billed_total <> 5684929.22::numeric OR v_paid_total <> 1099076.00::numeric THEN
    RAISE EXCEPTION 'YEZZA_FINANCIAL_TOTAL_MISMATCH: billed=%, paid=%', v_billed_total, v_paid_total;
  END IF;
  IF v_payment_total <> v_paid_total THEN
    RAISE EXCEPTION 'YEZZA_PAYMENT_TOTAL_MISMATCH: payments=%, source_paid=%', v_payment_total, v_paid_total;
  END IF;
  IF v_invalid_visit_links <> 0 THEN
    RAISE EXCEPTION 'YEZZA_VISIT_PATIENT_LINK_MISMATCH:%', v_invalid_visit_links;
  END IF;
  IF v_invalid_financial_only <> 0 THEN
    RAISE EXCEPTION 'YEZZA_FINANCIAL_ONLY_CLINICAL_DATA_MISMATCH:%', v_invalid_financial_only;
  END IF;
  IF v_invalid_ledger_links <> 0 THEN
    RAISE EXCEPTION 'YEZZA_IMPORT_LEDGER_LINK_MISMATCH:%', v_invalid_ledger_links;
  END IF;
END;
$yezza_reconciliation$;

ROLLBACK;

SELECT jsonb_build_object(
  'status', 'pass',
  'scope', 'complete Yezza historical import',
  'source_rows', 69832,
  'duplicate_rows_removed', 2390,
  'unique_bills', 67442,
  'billed_total', 5684929.22,
  'paid_total', 1099076.00,
  'transaction_end', 'ROLLBACK'
) AS yezza_import_reconciliation_verification;
