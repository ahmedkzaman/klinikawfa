-- Make repaired visit-level panel claims usable by the financial-control
-- report. Legacy imports were deliberately marked unattributed; their source
-- claim rows retain a reliable created_at timestamp that can safely restore
-- claim chronology.

ALTER TABLE private.financial_panel_claim_events
  DISABLE TRIGGER prevent_financial_panel_claim_event_change;

UPDATE private.financial_panel_claim_events AS event
SET event_kind = 'claim_created',
    queue_entry_id = claim.queue_entry_id,
    panel_id = claim.panel_id,
    amount = claim.amount,
    received_amount = COALESCE(claim.received_amount, 0),
    receipt_delta = 0,
    status = claim.status::text,
    due_date = claim.due_date,
    occurred_at = claim.created_at,
    provenance = 'inferred_source_timestamp',
    attribution_complete = true
FROM public.panel_claims AS claim
WHERE claim.id = event.panel_claim_id
  AND event.provenance = 'synthetic_backfill'
  AND NOT event.attribution_complete
  AND claim.queue_entry_id IS NOT NULL
  AND claim.created_at IS NOT NULL;

ALTER TABLE private.financial_panel_claim_events
  ENABLE TRIGGER prevent_financial_panel_claim_event_change;

-- Ensure every visit-linked claim has at least one complete creation event.
INSERT INTO private.financial_panel_claim_events (
  panel_claim_id, queue_entry_id, panel_id, event_kind, amount,
  received_amount, receipt_delta, status, due_date, occurred_at,
  provenance, attribution_complete
)
SELECT
  claim.id,
  claim.queue_entry_id,
  claim.panel_id,
  'claim_created',
  claim.amount,
  COALESCE(claim.received_amount, 0),
  0,
  claim.status::text,
  claim.due_date,
  claim.created_at,
  'inferred_source_timestamp',
  true
FROM public.panel_claims claim
WHERE claim.queue_entry_id IS NOT NULL
  AND claim.created_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM private.financial_panel_claim_events event
    WHERE event.panel_claim_id = claim.id
      AND event.queue_entry_id = claim.queue_entry_id
      AND event.attribution_complete
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.panel_claims claim
    WHERE claim.queue_entry_id IS NOT NULL
      AND claim.created_at IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM private.financial_panel_claim_events event
        WHERE event.panel_claim_id = claim.id
          AND event.queue_entry_id = claim.queue_entry_id
          AND event.attribution_complete
      )
  ) THEN
    RAISE EXCEPTION 'VISIT_LINKED_PANEL_CLAIM_EVENT_HISTORY_INCOMPLETE';
  END IF;
END;
$$;
