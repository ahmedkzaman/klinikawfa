-- Historical source rows retain usable creation timestamps even though their
-- first ledger import was conservatively marked as unattributed.
ALTER TABLE private.financial_payment_events
  DROP CONSTRAINT financial_payment_events_provenance_check;
ALTER TABLE private.financial_payment_events
  ADD CONSTRAINT financial_payment_events_provenance_check
  CHECK (provenance IN ('recorded', 'synthetic_backfill', 'inferred_source_timestamp'));
ALTER TABLE private.financial_payment_events
  DROP CONSTRAINT financial_payment_events_check;
ALTER TABLE private.financial_payment_events
  ADD CONSTRAINT financial_payment_events_check
  CHECK (
    (attribution_complete AND occurred_at IS NOT NULL
      AND provenance IN ('recorded', 'inferred_source_timestamp'))
    OR (NOT attribution_complete AND provenance = 'synthetic_backfill')
  );

ALTER TABLE private.financial_panel_claim_events
  DROP CONSTRAINT financial_panel_claim_events_provenance_check;
ALTER TABLE private.financial_panel_claim_events
  ADD CONSTRAINT financial_panel_claim_events_provenance_check
  CHECK (provenance IN ('recorded', 'synthetic_backfill', 'inferred_source_timestamp'));
ALTER TABLE private.financial_panel_claim_events
  DROP CONSTRAINT financial_panel_claim_events_check;
ALTER TABLE private.financial_panel_claim_events
  ADD CONSTRAINT financial_panel_claim_events_check
  CHECK (
    (attribution_complete AND occurred_at IS NOT NULL
      AND provenance IN ('recorded', 'inferred_source_timestamp'))
    OR (NOT attribution_complete AND provenance = 'synthetic_backfill')
  );

ALTER TABLE private.financial_payment_events
  DISABLE TRIGGER prevent_financial_payment_event_change;
UPDATE private.financial_payment_events AS legacy
SET event_kind = CASE WHEN payment.deleted_at IS NULL THEN 'receipt' ELSE 'void' END,
    occurred_at = payment.created_at,
    provenance = 'inferred_source_timestamp',
    attribution_complete = true
FROM public.payments AS payment
WHERE payment.id = legacy.payment_id
  AND legacy.provenance = 'synthetic_backfill'
  AND NOT legacy.attribution_complete
  AND payment.created_at IS NOT NULL;
ALTER TABLE private.financial_payment_events
  ENABLE TRIGGER prevent_financial_payment_event_change;

ALTER TABLE private.financial_panel_claim_events
  DISABLE TRIGGER prevent_financial_panel_claim_event_change;
UPDATE private.financial_panel_claim_events AS legacy
SET event_kind = 'claim_created',
    occurred_at = claim.created_at,
    provenance = 'inferred_source_timestamp',
    attribution_complete = true
FROM public.panel_claims AS claim
WHERE claim.id = legacy.panel_claim_id
  AND legacy.provenance = 'synthetic_backfill'
  AND NOT legacy.attribution_complete
  AND claim.created_at IS NOT NULL;
ALTER TABLE private.financial_panel_claim_events
  ENABLE TRIGGER prevent_financial_panel_claim_event_change;

DO $verification$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM private.financial_payment_events legacy
    JOIN public.payments payment ON payment.id = legacy.payment_id
    WHERE legacy.provenance = 'synthetic_backfill'
      AND NOT legacy.attribution_complete
      AND payment.created_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'HISTORICAL_PAYMENT_ATTRIBUTION_INCOMPLETE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM private.financial_panel_claim_events legacy
    JOIN public.panel_claims claim ON claim.id = legacy.panel_claim_id
    WHERE legacy.provenance = 'synthetic_backfill'
      AND NOT legacy.attribution_complete
      AND claim.created_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'HISTORICAL_CLAIM_ATTRIBUTION_INCOMPLETE';
  END IF;
END;
$verification$;

NOTIFY pgrst, 'reload schema';
