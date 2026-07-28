-- Keep panel claims aligned with the final consultation bill.
--
-- Some checkout clients completed queue_entries and inserted a panel payment
-- without completing the consultation. The original claim trigger only watched
-- consultation.status, so those visits never produced a panel claim.

CREATE UNIQUE INDEX IF NOT EXISTS panel_claims_queue_entry_unique_idx
  ON public.panel_claims (queue_entry_id);

CREATE OR REPLACE FUNCTION public.ensure_panel_claim_for_queue(
  p_queue_entry_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_panel_id uuid;
  v_patient_id uuid;
  v_total_amount numeric(10,2);
  v_claim_id uuid;
  v_claim_no text;
  v_seq integer;
BEGIN
  SELECT qe.panel_id, qe.patient_id
    INTO v_panel_id, v_patient_id
  FROM public.queue_entries qe
  WHERE qe.id = p_queue_entry_id
    AND qe.payment_method = 'panel'
    AND qe.panel_id IS NOT NULL;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(ci.price * ci.quantity), 0)::numeric(10,2)
    INTO v_total_amount
  FROM public.consultations c
  LEFT JOIN public.consultation_items ci
    ON ci.consultation_id = c.id
   AND ci.deleted_at IS NULL
  WHERE c.queue_entry_id = p_queue_entry_id
    AND c.deleted_at IS NULL;

  SELECT pc.id
    INTO v_claim_id
  FROM public.panel_claims pc
  WHERE pc.queue_entry_id = p_queue_entry_id
  FOR UPDATE;

  IF v_claim_id IS NOT NULL THEN
    UPDATE public.panel_claims pc
       SET amount = v_total_amount
     WHERE pc.id = v_claim_id
       AND pc.status = 'pending'
       AND pc.amount IS DISTINCT FROM v_total_amount;
    RETURN v_claim_id;
  END IF;

  -- Serialise the daily sequence so two simultaneous checkouts cannot receive
  -- the same human-readable claim number.
  PERFORM pg_advisory_xact_lock(hashtext('panel-claim-' || CURRENT_DATE::text));

  SELECT COUNT(*) + 1
    INTO v_seq
  FROM public.panel_claims
  WHERE claim_date = CURRENT_DATE;

  v_claim_no :=
    'PC-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || lpad(v_seq::text, 4, '0');

  INSERT INTO public.panel_claims (
    panel_id,
    patient_id,
    queue_entry_id,
    claim_no,
    amount,
    status,
    claim_date
  )
  VALUES (
    v_panel_id,
    v_patient_id,
    p_queue_entry_id,
    v_claim_no,
    v_total_amount,
    'pending',
    CURRENT_DATE
  )
  ON CONFLICT (queue_entry_id)
  DO UPDATE
     SET amount = v_total_amount
   WHERE panel_claims.status = 'pending'
  RETURNING id INTO v_claim_id;

  IF v_claim_id IS NULL THEN
    SELECT pc.id
      INTO v_claim_id
    FROM public.panel_claims pc
    WHERE pc.queue_entry_id = p_queue_entry_id;
  END IF;

  RETURN v_claim_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_panel_claim_for_queue(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_panel_claim_for_queue(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.trg_generate_panel_claim()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed'
     AND OLD.status IS DISTINCT FROM 'completed'
     AND NEW.queue_entry_id IS NOT NULL THEN
    PERFORM public.ensure_panel_claim_for_queue(NEW.queue_entry_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_queue_completion_ensure_panel_claim()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.clinic_status = 'completed'
     AND OLD.clinic_status IS DISTINCT FROM 'completed' THEN
    PERFORM public.ensure_panel_claim_for_queue(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS after_queue_completion_ensure_panel_claim
  ON public.queue_entries;
CREATE TRIGGER after_queue_completion_ensure_panel_claim
  AFTER UPDATE OF clinic_status ON public.queue_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_queue_completion_ensure_panel_claim();

-- Repair panel consultations that were stranded by the old split completion
-- path. Updating status also invokes the normal inventory and claim triggers.
UPDATE public.consultations c
   SET status = 'completed'
FROM public.queue_entries qe
LEFT JOIN public.panel_claims pc
  ON pc.queue_entry_id = qe.id
WHERE c.queue_entry_id = qe.id
  AND c.deleted_at IS NULL
  AND c.status <> 'completed'
  AND qe.clinic_status = 'completed'
  AND qe.payment_method = 'panel'
  AND qe.panel_id IS NOT NULL
  AND pc.id IS NULL;

-- Reconcile existing pending claims against the final active item total,
-- including manually selected Other Charges.
DO $$
DECLARE
  v_queue_entry_id uuid;
BEGIN
  FOR v_queue_entry_id IN
    SELECT DISTINCT pc.queue_entry_id
    FROM public.panel_claims pc
    JOIN public.queue_entries qe ON qe.id = pc.queue_entry_id
    WHERE pc.status = 'pending'
      AND pc.queue_entry_id IS NOT NULL
      AND qe.payment_method = 'panel'
      AND qe.panel_id IS NOT NULL
  LOOP
    PERFORM public.ensure_panel_claim_for_queue(v_queue_entry_id);
  END LOOP;
END;
$$;
