-- Recover historical visits that predate the immutable financial completion ledger.
-- The original synthetic event remains unchanged; this adds an explicit inferred event.
ALTER TABLE private.financial_visit_completion_events
  DROP CONSTRAINT financial_visit_completion_events_provenance_check;
ALTER TABLE private.financial_visit_completion_events
  ADD CONSTRAINT financial_visit_completion_events_provenance_check
  CHECK (provenance IN ('recorded', 'synthetic_backfill', 'inferred_queue_updated_at'));

ALTER TABLE private.financial_visit_completion_events
  DROP CONSTRAINT financial_visit_completion_events_check;
ALTER TABLE private.financial_visit_completion_events
  ADD CONSTRAINT financial_visit_completion_events_check
  CHECK (
    (
      attribution_complete
      AND completed_at IS NOT NULL
      AND (
        (
          provenance = 'recorded'
          AND (
            (event_kind = 'completion' AND item_state IS NOT NULL)
            OR (event_kind = 'void' AND item_state IS NULL)
          )
        )
        OR (
          provenance = 'inferred_queue_updated_at'
          AND event_kind = 'completion'
          AND item_state IS NOT NULL
        )
      )
    )
    OR (
      NOT attribution_complete
      AND provenance = 'synthetic_backfill'
      AND event_kind = 'completion'
      AND item_state IS NULL
    )
  );

WITH candidates AS (
  SELECT DISTINCT ON (legacy.consultation_id)
    legacy.queue_entry_id,
    legacy.consultation_id,
    queue.updated_at AS inferred_completed_at,
    private.financial_control_completion_item_state(legacy.consultation_id) AS item_state
  FROM private.financial_visit_completion_events legacy
  JOIN public.queue_entries queue
    ON queue.id = legacy.queue_entry_id
  WHERE legacy.provenance = 'synthetic_backfill'
    AND NOT legacy.attribution_complete
    AND legacy.completed_at IS NULL
    AND queue.updated_at IS NOT NULL
    AND queue.updated_at >= queue.created_at
    AND queue.updated_at <= legacy.recorded_at
    AND NOT EXISTS (
      SELECT 1
      FROM private.financial_visit_completion_events attributed
      WHERE attributed.consultation_id = legacy.consultation_id
        AND attributed.attribution_complete
        AND attributed.completed_at IS NOT NULL
    )
  ORDER BY legacy.consultation_id, legacy.id DESC
)
INSERT INTO private.financial_visit_completion_events (
  queue_entry_id,
  consultation_id,
  event_kind,
  completed_at,
  provenance,
  attribution_complete,
  item_state
)
SELECT
  candidates.queue_entry_id,
  candidates.consultation_id,
  'completion',
  candidates.inferred_completed_at,
  'inferred_queue_updated_at',
  true,
  candidates.item_state
FROM candidates;

DO $verification$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM private.financial_visit_completion_events legacy
    JOIN public.queue_entries queue
      ON queue.id = legacy.queue_entry_id
    WHERE legacy.provenance = 'synthetic_backfill'
      AND NOT legacy.attribution_complete
      AND legacy.completed_at IS NULL
      AND queue.updated_at IS NOT NULL
      AND queue.updated_at >= queue.created_at
      AND queue.updated_at <= legacy.recorded_at
      AND NOT EXISTS (
        SELECT 1
        FROM private.financial_visit_completion_events attributed
        WHERE attributed.consultation_id = legacy.consultation_id
          AND attributed.attribution_complete
          AND attributed.completed_at IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'HISTORICAL_FINANCIAL_ATTRIBUTION_INCOMPLETE';
  END IF;
END;
$verification$;

NOTIFY pgrst, 'reload schema';
