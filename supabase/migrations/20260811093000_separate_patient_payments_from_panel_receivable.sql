-- Keep patient-paid methods (cash, QR, card, transfer, etc.) out of panel
-- receivables. A payment row whose method is exactly `panel` is an allocation
-- marker; actual panel receipts are recorded on panel_claims.received_amount.

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
  v_patient_paid numeric(10,2);
  v_panel_amount numeric(10,2);
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

  SELECT COALESCE(SUM(p.amount), 0)::numeric(10,2)
    INTO v_patient_paid
  FROM public.payments p
  WHERE p.queue_entry_id = p_queue_entry_id
    AND p.deleted_at IS NULL
    AND lower(trim(p.payment_method)) <> 'panel';

  v_panel_amount := GREATEST(v_total_amount - v_patient_paid, 0)::numeric(10,2);

  SELECT pc.id
    INTO v_claim_id
  FROM public.panel_claims pc
  WHERE pc.queue_entry_id = p_queue_entry_id
  FOR UPDATE;

  IF v_claim_id IS NOT NULL THEN
    UPDATE public.panel_claims pc
       SET amount = v_panel_amount
     WHERE pc.id = v_claim_id
       AND pc.status = 'pending'
       AND pc.amount IS DISTINCT FROM v_panel_amount;
    RETURN v_claim_id;
  END IF;

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
    v_panel_amount,
    'pending',
    CURRENT_DATE
  )
  ON CONFLICT (queue_entry_id)
  DO UPDATE
     SET amount = v_panel_amount
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

CREATE OR REPLACE FUNCTION public.cap_panel_claim_to_patient_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_amount numeric(10,2);
  v_patient_paid numeric(10,2);
  v_max_panel_amount numeric(10,2);
BEGIN
  IF NEW.queue_entry_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(ci.price * ci.quantity), 0)::numeric(10,2)
    INTO v_total_amount
  FROM public.consultations c
  LEFT JOIN public.consultation_items ci
    ON ci.consultation_id = c.id
   AND ci.deleted_at IS NULL
  WHERE c.queue_entry_id = NEW.queue_entry_id
    AND c.deleted_at IS NULL;

  SELECT COALESCE(SUM(p.amount), 0)::numeric(10,2)
    INTO v_patient_paid
  FROM public.payments p
  WHERE p.queue_entry_id = NEW.queue_entry_id
    AND p.deleted_at IS NULL
    AND lower(trim(p.payment_method)) <> 'panel';

  v_max_panel_amount := GREATEST(v_total_amount - v_patient_paid, 0)::numeric(10,2);
  NEW.amount := LEAST(GREATEST(COALESCE(NEW.amount, 0), 0), v_max_panel_amount);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cap_panel_claim_to_patient_balance
  ON public.panel_claims;
CREATE TRIGGER trg_cap_panel_claim_to_patient_balance
BEFORE INSERT OR UPDATE OF amount, queue_entry_id, status ON public.panel_claims
FOR EACH ROW
EXECUTE FUNCTION public.cap_panel_claim_to_patient_balance();

-- Repair pending legacy claims using the same per-visit rule. Submitted or
-- approved claims are left untouched for audit safety.
DO $$
DECLARE
  v_queue_entry_id uuid;
BEGIN
  FOR v_queue_entry_id IN
    SELECT pc.queue_entry_id
    FROM public.panel_claims pc
    WHERE pc.status = 'pending'
      AND pc.queue_entry_id IS NOT NULL
  LOOP
    PERFORM public.ensure_panel_claim_for_queue(v_queue_entry_id);
  END LOOP;
END;
$$;
