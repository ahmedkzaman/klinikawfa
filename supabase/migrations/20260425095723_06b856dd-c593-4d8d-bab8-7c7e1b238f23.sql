CREATE OR REPLACE FUNCTION public.trg_generate_panel_claim()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_panel_id uuid;
  v_patient_id uuid;
  v_queue_entry_id uuid;
  v_total_amount numeric(10,2);
  v_claim_no text;
  v_seq int;
  v_existing_claim_id uuid;
BEGIN
  -- Only proceed if the consultation is being marked as 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN

    v_queue_entry_id := NEW.queue_entry_id;

    -- Check if this consultation belongs to a panel queue entry
    SELECT panel_id INTO v_panel_id
    FROM public.queue_entries
    WHERE id = v_queue_entry_id
      AND payment_method = 'panel'
      AND panel_id IS NOT NULL;

    -- If it's a panel visit, generate the claim
    IF v_panel_id IS NOT NULL THEN

      -- Idempotency: skip if a claim already exists for this queue entry
      SELECT id INTO v_existing_claim_id
      FROM public.panel_claims
      WHERE queue_entry_id = v_queue_entry_id
      LIMIT 1;

      IF v_existing_claim_id IS NOT NULL THEN
        RETURN NEW;
      END IF;

      v_patient_id := NEW.patient_id;

      -- Calculate the total amount from active consultation_items
      SELECT COALESCE(SUM(price * quantity), 0) INTO v_total_amount
      FROM public.consultation_items
      WHERE consultation_id = NEW.id
        AND deleted_at IS NULL;

      -- Generate claim_no in format PC-YYYYMMDD-####
      SELECT COUNT(*) + 1 INTO v_seq
      FROM public.panel_claims
      WHERE claim_date = CURRENT_DATE;

      v_claim_no := 'PC-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || lpad(v_seq::text, 4, '0');

      -- Insert the pending claim
      INSERT INTO public.panel_claims (
        panel_id,
        patient_id,
        queue_entry_id,
        claim_no,
        amount,
        status,
        claim_date
      ) VALUES (
        v_panel_id,
        v_patient_id,
        v_queue_entry_id,
        v_claim_no,
        v_total_amount,
        'pending',
        CURRENT_DATE
      );

    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS after_update_generate_panel_claim ON public.consultations;

CREATE TRIGGER after_update_generate_panel_claim
  AFTER UPDATE OF status ON public.consultations
  FOR EACH ROW EXECUTE FUNCTION public.trg_generate_panel_claim();