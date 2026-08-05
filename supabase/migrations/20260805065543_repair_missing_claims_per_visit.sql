-- Reconcile claims by queue visit, never by patient/month.
-- A patient may attend several times in the same month; every completed queue
-- entry must therefore have its own panel_claims.queue_entry_id.

CREATE UNIQUE INDEX IF NOT EXISTS panel_claims_queue_entry_unique_idx
  ON public.panel_claims (queue_entry_id)
  WHERE queue_entry_id IS NOT NULL;

DO $$
DECLARE
  v_queue_entry_id uuid;
BEGIN
  FOR v_queue_entry_id IN
    SELECT qe.id
    FROM public.queue_entries qe
    LEFT JOIN public.panel_claims pc
      ON pc.queue_entry_id = qe.id
    WHERE qe.clinic_status = 'completed'
      AND qe.payment_method = 'panel'
      AND qe.panel_id IS NOT NULL
      AND qe.deleted_at IS NULL
      AND pc.id IS NULL
    ORDER BY qe.created_at, qe.id
  LOOP
    PERFORM public.ensure_panel_claim_for_queue(v_queue_entry_id);
  END LOOP;
END;
$$;

-- Recalculate every pending visit-level claim from its own final bill. This
-- keeps repeat visits for the same patient separate even within one day.
DO $$
DECLARE
  v_queue_entry_id uuid;
BEGIN
  FOR v_queue_entry_id IN
    SELECT pc.queue_entry_id
    FROM public.panel_claims pc
    WHERE pc.queue_entry_id IS NOT NULL
      AND pc.status = 'pending'
    ORDER BY pc.created_at, pc.id
  LOOP
    PERFORM public.ensure_panel_claim_for_queue(v_queue_entry_id);
  END LOOP;
END;
$$;

-- Fail the migration if a completed panel visit is still missing a claim.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.queue_entries qe
    LEFT JOIN public.panel_claims pc ON pc.queue_entry_id = qe.id
    WHERE qe.clinic_status = 'completed'
      AND qe.payment_method = 'panel'
      AND qe.panel_id IS NOT NULL
      AND qe.deleted_at IS NULL
      AND pc.id IS NULL
  ) THEN
    RAISE EXCEPTION 'completed_panel_visit_without_claim_after_repair';
  END IF;
END;
$$;
