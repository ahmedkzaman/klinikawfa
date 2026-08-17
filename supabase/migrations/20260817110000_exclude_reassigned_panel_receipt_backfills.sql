-- A cumulative legacy received_amount cannot be assigned to one receipt date
-- after the claim has moved between queues. The preceding migration could
-- mistake such a reassignment-only history for a safe historical receipt.
-- Preserve an explicit incomplete marker, but remove its financial effect.

BEGIN;

ALTER TABLE private.financial_panel_claim_events
  DISABLE TRIGGER prevent_financial_panel_claim_event_change;

UPDATE private.financial_panel_claim_events AS backfill
SET
  event_kind = 'synthetic_backfill',
  receipt_delta = 0,
  occurred_at = NULL,
  provenance = 'synthetic_backfill',
  attribution_complete = false
WHERE backfill.provenance = 'historical_receipt_date_backfill'
  AND EXISTS (
    SELECT 1
    FROM private.financial_panel_claim_events AS reassignment
    WHERE reassignment.panel_claim_id = backfill.panel_claim_id
      AND reassignment.event_kind IN ('reassignment_out', 'reassignment_in')
      AND reassignment.receipt_delta <> 0
  );

ALTER TABLE private.financial_panel_claim_events
  ENABLE TRIGGER prevent_financial_panel_claim_event_change;

DO $postflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'private.financial_panel_claim_events'::regclass
      AND tgname = 'prevent_financial_panel_claim_event_change'
      AND tgenabled = 'O'
  ) THEN
    RAISE EXCEPTION 'PANEL_EVENT_IMMUTABILITY_GUARD_NOT_ENABLED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM private.financial_panel_claim_events AS backfill
    WHERE backfill.provenance = 'historical_receipt_date_backfill'
      AND EXISTS (
        SELECT 1
        FROM private.financial_panel_claim_events AS reassignment
        WHERE reassignment.panel_claim_id = backfill.panel_claim_id
          AND reassignment.event_kind IN ('reassignment_out', 'reassignment_in')
          AND reassignment.receipt_delta <> 0
      )
  ) THEN
    RAISE EXCEPTION 'REASSIGNED_PANEL_RECEIPT_HISTORY_WAS_BACKFILLED';
  END IF;
END;
$postflight$;

COMMIT;
