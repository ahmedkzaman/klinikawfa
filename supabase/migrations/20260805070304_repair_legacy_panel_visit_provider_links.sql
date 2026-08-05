-- Repair legacy visits whose checkout payment recorded a panel provider in
-- payments.notes, while queue_entries was incorrectly left as cash/unset and
-- without panel_id.  The repair is deliberately evidence-bound: the provider
-- label must match exactly one configured provider for the visit.

CREATE TEMP TABLE repaired_panel_visit_links ON COMMIT DROP AS
WITH matched_evidence AS (
  SELECT
    qe.id AS queue_entry_id,
    provider.id AS panel_id,
    MIN(payment.created_at) AS evidence_at
  FROM public.queue_entries qe
  JOIN public.payments payment
    ON payment.queue_entry_id = qe.id
   AND payment.deleted_at IS NULL
   AND payment.payment_type = 'panel'
  JOIN public.insurance_providers provider
    ON lower(btrim(provider.name)) = lower(btrim(
      substring(payment.notes FROM '(?i)Provider:\s*(.+)$')
    ))
  LEFT JOIN public.panel_claims claim
    ON claim.queue_entry_id = qe.id
  WHERE qe.clinic_status = 'completed'
    AND qe.deleted_at IS NULL
    AND qe.panel_id IS NULL
    AND claim.id IS NULL
  GROUP BY qe.id, provider.id
), unambiguous AS (
  SELECT
    queue_entry_id,
    MIN(panel_id::text)::uuid AS panel_id,
    MIN(evidence_at) AS evidence_at
  FROM matched_evidence
  GROUP BY queue_entry_id
  HAVING COUNT(DISTINCT panel_id) = 1
)
SELECT queue_entry_id, panel_id, evidence_at
FROM unambiguous;

UPDATE public.queue_entries qe
SET payment_method = 'panel',
    panel_id = repair.panel_id,
    updated_at = now()
FROM repaired_panel_visit_links repair
WHERE qe.id = repair.queue_entry_id;

DO $repair$
DECLARE
  v_queue_entry_id uuid;
BEGIN
  FOR v_queue_entry_id IN
    SELECT repair.queue_entry_id
    FROM repaired_panel_visit_links repair
    ORDER BY repair.evidence_at, repair.queue_entry_id
  LOOP
    IF public.ensure_panel_claim_for_queue(v_queue_entry_id) IS NULL THEN
      RAISE EXCEPTION 'LEGACY_PANEL_VISIT_CLAIM_REPAIR_FAILED: %', v_queue_entry_id;
    END IF;
  END LOOP;
END;
$repair$;

-- The claim was logically created when the legacy panel payment was recorded,
-- not on the day this repair runs.  Backdate only the append-only creation
-- event for the claims created from the evidence table so historical as-of
-- reports can see the correct visit-level claim.
ALTER TABLE private.financial_panel_claim_events
  DISABLE TRIGGER prevent_financial_panel_claim_event_change;

UPDATE private.financial_panel_claim_events event
SET occurred_at = repair.evidence_at,
    provenance = 'inferred_source_timestamp',
    attribution_complete = true
FROM public.panel_claims claim
JOIN repaired_panel_visit_links repair
  ON repair.queue_entry_id = claim.queue_entry_id
WHERE event.panel_claim_id = claim.id
  AND event.queue_entry_id = repair.queue_entry_id
  AND event.event_kind = 'claim_created';

ALTER TABLE private.financial_panel_claim_events
  ENABLE TRIGGER prevent_financial_panel_claim_event_change;

DO $postflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM repaired_panel_visit_links repair
    LEFT JOIN public.queue_entries qe ON qe.id = repair.queue_entry_id
    LEFT JOIN public.panel_claims claim ON claim.queue_entry_id = repair.queue_entry_id
    WHERE qe.payment_method IS DISTINCT FROM 'panel'
       OR qe.panel_id IS DISTINCT FROM repair.panel_id
       OR claim.id IS NULL
       OR NOT EXISTS (
         SELECT 1
         FROM private.financial_panel_claim_events event
         WHERE event.panel_claim_id = claim.id
           AND event.queue_entry_id = repair.queue_entry_id
           AND event.event_kind = 'claim_created'
           AND event.attribution_complete
           AND event.occurred_at = repair.evidence_at
       )
  ) THEN
    RAISE EXCEPTION 'LEGACY_PANEL_VISIT_PROVIDER_LINK_REPAIR_INCOMPLETE';
  END IF;
END;
$postflight$;
