-- Repair the financial event ledgers for the Remedi historical import.
--
-- Root cause (2026-08-29): the financial event capture triggers stamp business
-- time as statement_timestamp(). During the Remedi import the queue/consultation
-- completion flips fired those triggers at import moment, so 3,936 completion
-- events and 1,516 claim_created events for imported visits carry
-- completed_at/occurred_at = 2026-08-29 (import day) instead of the historical
-- Remedi attendance / PDF claim dates. The financial-control report buckets
-- billing by the completion event time, which surfaced all migrated sales in
-- the current month.
--
-- Fix, following the repo precedents 20260804080000 (completion attribution)
-- and 20260805065604 (owner-scoped repair with the immutable trigger disabled,
-- then re-enabled):
--   1. Back up and delete event rows whose visits no longer exist (the retired
--      duplicates from the retirement batches left 931 completion + 876 claim
--      + 968 payment orphans behind; these pollute "today").
--   2. Repair the completion events of imported visits to the queue entry's
--      historical created_at (Remedi attendance time, MYT), using the
--      sanctioned completion-event provenance 'inferred_queue_updated_at'
--      (the Aug-4 vocabulary; the source column here is created_at, which the
--      import set to the Remedi visit_date).
--   3. Repair the claim_created events to panel_claims.claim_date (PDF claim
--      time) with provenance 'inferred_source_timestamp', mirroring Aug-5.
--   4. Insert the zero-price package child events the import bypassed.
--   5. Fail closed unless every attributed imported-visit event agrees with
--      its source timestamp.
--
-- This migration contains no patient identifiers, no clinical text, and no
-- bill numbers. Counts in comments are the locked import profile.

-- ---------------------------------------------------------------------------
-- 1. Backup table for orphaned events (row images, private schema).
-- ---------------------------------------------------------------------------
CREATE TABLE private.remedi_orphan_financial_events_backup (
  id bigserial PRIMARY KEY,
  event_source text NOT NULL CHECK (event_source IN ('completion', 'claim', 'payment')),
  source_row jsonb NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON private.remedi_orphan_financial_events_backup FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE private.remedi_orphan_financial_events_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.remedi_orphan_financial_events_backup FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. Orphan cleanup. The immutable triggers are BEFORE DELETE OR UPDATE, so
--    the owner-scoped repair disables them for the delete only (Aug-5
--    pattern) and re-enables immediately.
-- ---------------------------------------------------------------------------

-- 2a. Completion events.
INSERT INTO private.remedi_orphan_financial_events_backup (event_source, source_row)
SELECT 'completion', to_jsonb(event)
FROM private.financial_visit_completion_events event
WHERE NOT EXISTS (
  SELECT 1 FROM public.queue_entries q WHERE q.id = event.queue_entry_id
);

ALTER TABLE private.financial_visit_completion_events
  DISABLE TRIGGER prevent_financial_visit_completion_event_change;

DELETE FROM private.financial_visit_completion_events event
WHERE NOT EXISTS (
  SELECT 1 FROM public.queue_entries q WHERE q.id = event.queue_entry_id
);

ALTER TABLE private.financial_visit_completion_events
  ENABLE TRIGGER prevent_financial_visit_completion_event_change;

-- 2b. Panel claim events (orphans keyed by queue entry; panel_claim_id-anchored
--     events with a surviving queue entry stay).
INSERT INTO private.remedi_orphan_financial_events_backup (event_source, source_row)
SELECT 'claim', to_jsonb(event)
FROM private.financial_panel_claim_events event
WHERE event.queue_entry_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.queue_entries q WHERE q.id = event.queue_entry_id
  );

ALTER TABLE private.financial_panel_claim_events
  DISABLE TRIGGER prevent_financial_panel_claim_event_change;

DELETE FROM private.financial_panel_claim_events event
WHERE event.queue_entry_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.queue_entries q WHERE q.id = event.queue_entry_id
  );

ALTER TABLE private.financial_panel_claim_events
  ENABLE TRIGGER prevent_financial_panel_claim_event_change;

-- 2c. Payment events.
INSERT INTO private.remedi_orphan_financial_events_backup (event_source, source_row)
SELECT 'payment', to_jsonb(event)
FROM private.financial_payment_events event
WHERE event.queue_entry_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.queue_entries q WHERE q.id = event.queue_entry_id
  );

ALTER TABLE private.financial_payment_events
  DISABLE TRIGGER prevent_financial_payment_event_change;

DELETE FROM private.financial_payment_events event
WHERE event.queue_entry_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.queue_entries q WHERE q.id = event.queue_entry_id
  );

ALTER TABLE private.financial_payment_events
  ENABLE TRIGGER prevent_financial_payment_event_change;

-- ---------------------------------------------------------------------------
-- 3. Repair imported completion events to the Remedi attendance time.
--    Source of truth: queue_entries.created_at (set by the import to the
--    Remedi visit_date, MYT). Provenance 'inferred_queue_updated_at' is the
--    sanctioned completion-attribution vocabulary from 20260804080000; the
--    constraint requires event_kind='completion' and item_state NOT NULL,
--    which these rows already satisfy (item_state is left untouched).
-- ---------------------------------------------------------------------------
ALTER TABLE private.financial_visit_completion_events
  DISABLE TRIGGER prevent_financial_visit_completion_event_change;

UPDATE private.financial_visit_completion_events AS event
SET completed_at = q.created_at,
    provenance = 'inferred_queue_updated_at'
FROM public.queue_entries q
WHERE q.id = event.queue_entry_id
  AND q.visit_type IN ('historical_import', 'payment_only')
  AND event.event_kind = 'completion'
  AND event.attribution_complete
  AND event.item_state IS NOT NULL
  AND (event.completed_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date
    <> (q.created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date;

ALTER TABLE private.financial_visit_completion_events
  ENABLE TRIGGER prevent_financial_visit_completion_event_change;

-- ---------------------------------------------------------------------------
-- 4. Repair imported claim_created events to the PDF claim date.
--    Evidence (2026-08-29): all 1,516 imported claims are status='pending'
--    with received_amount = 0 and claim_date = historical PDF time, so the
--    only event kind on imported claims is 'claim_created'.
-- ---------------------------------------------------------------------------
ALTER TABLE private.financial_panel_claim_events
  DISABLE TRIGGER prevent_financial_panel_claim_event_change;

UPDATE private.financial_panel_claim_events AS event
SET occurred_at = claim.claim_date::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur',
    provenance = 'inferred_source_timestamp'
FROM public.panel_claims claim
JOIN public.queue_entries q ON q.id = claim.queue_entry_id
WHERE claim.id = event.panel_claim_id
  AND q.visit_type IN ('historical_import', 'payment_only')
  AND event.attribution_complete
  AND (event.occurred_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date
    <> claim.claim_date;

ALTER TABLE private.financial_panel_claim_events
  ENABLE TRIGGER prevent_financial_panel_claim_event_change;

-- ---------------------------------------------------------------------------
-- 5. Zero-price package child events: the import bypassed the trigger's
--    child-event insertion. Insert them with the visit's historical time.
--    (The zp table's immutable trigger is BEFORE DELETE OR UPDATE; plain
--    inserts are the sanctioned write path used by the capture trigger.)
-- ---------------------------------------------------------------------------
INSERT INTO private.financial_zero_price_package_child_events (
  consultation_item_id,
  consultation_id,
  package_line_item_id,
  package_id,
  package_item_id,
  completed_at,
  provenance
)
SELECT DISTINCT ON (child.id)
  child.id,
  child.consultation_id,
  package_line.id,
  package_line.package_id,
  package_item.id,
  qe.created_at,
  'recorded_at_completion'
FROM public.consultation_items child
JOIN public.consultations c ON c.id = child.consultation_id
JOIN public.queue_entries qe ON qe.id = c.queue_entry_id
JOIN public.consultation_items package_line
  ON package_line.consultation_id = child.consultation_id
 AND package_line.id <> child.id
 AND package_line.deleted_at IS NULL
 AND package_line.package_id IS NOT NULL
 AND package_line.price > 0
 AND package_line.quantity > 0
JOIN public.package_items package_item
  ON package_item.package_id = package_line.package_id
 AND (
   (child.item_id IS NOT NULL
     AND package_item.inventory_item_id = child.item_id)
   OR (child.service_id IS NOT NULL
     AND package_item.service_id = child.service_id)
 )
WHERE qe.visit_type IN ('historical_import', 'payment_only')
  AND qe.deleted_at IS NULL
  AND child.deleted_at IS NULL
  AND child.price = 0
  AND child.quantity > 0
  AND (
    child.billing_adjustment_kind IS NULL
    OR child.billing_adjustment_kind = 'other_charge'
  )
ON CONFLICT (consultation_item_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. Fail-closed verification:
--    a. no orphaned events remain,
--    b. every attributed completion event of an imported visit agrees with
--       the visit's own Remedi attendance day,
--    c. every attributed claim event of an imported claim agrees with the
--       PDF claim date,
--    d. immutable triggers are re-enabled.
-- ---------------------------------------------------------------------------
DO $verify$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM private.financial_visit_completion_events event
    WHERE NOT EXISTS (
      SELECT 1 FROM public.queue_entries q WHERE q.id = event.queue_entry_id
    )
  ) OR EXISTS (
    SELECT 1
    FROM private.financial_panel_claim_events event
    WHERE event.queue_entry_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.queue_entries q WHERE q.id = event.queue_entry_id
      )
  ) OR EXISTS (
    SELECT 1
    FROM private.financial_payment_events event
    WHERE event.queue_entry_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.queue_entries q WHERE q.id = event.queue_entry_id
      )
  ) THEN
    RAISE EXCEPTION 'REMEDI_FINANCIAL_EVENT_ATTRIBUTION_FAILED_ORPHANS';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM private.financial_visit_completion_events event
    JOIN public.queue_entries q ON q.id = event.queue_entry_id
    WHERE q.visit_type IN ('historical_import', 'payment_only')
      AND event.event_kind = 'completion'
      AND event.attribution_complete
      AND (
        (event.completed_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date
          <> (q.created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date
        OR event.provenance NOT IN ('recorded', 'inferred_queue_updated_at')
      )
  ) THEN
    RAISE EXCEPTION 'REMEDI_FINANCIAL_EVENT_ATTRIBUTION_FAILED_COMPLETIONS';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM private.financial_panel_claim_events event
    JOIN public.panel_claims claim ON claim.id = event.panel_claim_id
    JOIN public.queue_entries q ON q.id = claim.queue_entry_id
    WHERE q.visit_type IN ('historical_import', 'payment_only')
      AND event.attribution_complete
      AND (event.occurred_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date
        <> claim.claim_date
  ) THEN
    RAISE EXCEPTION 'REMEDI_FINANCIAL_EVENT_ATTRIBUTION_FAILED_CLAIMS';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'prevent_financial_visit_completion_event_change'
      AND tgrelid = 'private.financial_visit_completion_events'::regclass
      AND tgenabled <> 'D'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'prevent_financial_panel_claim_event_change'
      AND tgrelid = 'private.financial_panel_claim_events'::regclass
      AND tgenabled <> 'D'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'prevent_financial_payment_event_change'
      AND tgrelid = 'private.financial_payment_events'::regclass
      AND tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION 'REMEDI_FINANCIAL_EVENT_ATTRIBUTION_FAILED_TRIGGERS';
  END IF;
END;
$verify$;

NOTIFY pgrst, 'reload schema';
