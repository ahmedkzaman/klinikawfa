-- Configurable official-documentation fees and their atomic billing lifecycle.

CREATE TABLE public.clinic_document_fees (
  document_type text PRIMARY KEY,
  amount numeric(10, 2) NOT NULL,
  updated_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clinic_document_fees_document_type_check
    CHECK (document_type IN ('mc', 'prescription', 'referral')),
  CONSTRAINT clinic_document_fees_amount_check
    CHECK (
      amount >= 0
      AND amount <= 99999999.99
      AND amount::text NOT IN ('NaN', 'Infinity', '-Infinity')
    )
);

ALTER TABLE public.clinic_document_fees ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.clinic_document_fees
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.clinic_document_fees TO authenticated;

CREATE POLICY "clinic_document_fees_clinic_read"
  ON public.clinic_document_fees
  FOR SELECT
  TO authenticated
  USING (public.is_staff_or_clinical(auth.uid()));

INSERT INTO public.clinic_document_fees (document_type, amount)
VALUES ('mc', 15.00)
ON CONFLICT (document_type) DO NOTHING;

INSERT INTO public.clinic_document_fees (document_type, amount)
VALUES ('prescription', 15.00)
ON CONFLICT (document_type) DO NOTHING;

INSERT INTO public.clinic_document_fees (document_type, amount)
VALUES ('referral', 15.00)
ON CONFLICT (document_type) DO NOTHING;

CREATE OR REPLACE FUNCTION public.set_clinic_document_fee(
  _document_type text,
  _amount numeric
)
RETURNS public.clinic_document_fees
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_document_type text := lower(btrim(coalesce(_document_type, '')));
  v_role text;
  v_result public.clinic_document_fees;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  IF v_document_type NOT IN ('mc', 'prescription', 'referral')
     OR _amount IS NULL
     OR _amount::text IN ('NaN', 'Infinity', '-Infinity')
     OR _amount < 0
     OR _amount > 99999999.99
     OR round(_amount, 2) <> _amount THEN
    RAISE EXCEPTION 'INVALID_DOCUMENT_FEE' USING ERRCODE = '22023';
  END IF;

  SELECT ur.role::text
    INTO v_role
  FROM public.user_roles ur
  WHERE ur.user_id = auth.uid();

  IF (
    v_document_type = 'mc'
    AND v_role NOT IN (
      'ops_staff',
      'operations',
      'staff',
      'resident_doctor',
      'admin',
      'doctor_admin'
    )
  ) OR (
    v_document_type IN ('prescription', 'referral')
    AND v_role NOT IN ('admin', 'doctor_admin')
  ) OR v_role IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  UPDATE public.clinic_document_fees
  SET amount = _amount,
      updated_by = auth.uid(),
      updated_at = now()
  WHERE document_type = v_document_type
  RETURNING * INTO STRICT v_result;

  RETURN v_result;
END;
$function$;

ALTER FUNCTION public.set_clinic_document_fee(text, numeric)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_clinic_document_fee(text, numeric)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_clinic_document_fee(text, numeric)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.set_clinic_document_fee(text, numeric)
  TO authenticated;

ALTER TABLE public.consultation_items
  ADD COLUMN source_document_id uuid NULL,
  ADD COLUMN source_document_type text NULL;

ALTER TABLE public.consultation_items
  ADD CONSTRAINT consultation_items_source_document_metadata_check
  CHECK (
    (
      source_document_id IS NULL
      AND source_document_type IS NULL
    )
    OR (
      source_document_id IS NOT NULL
      AND source_document_type IN ('mc', 'prescription', 'referral')
      AND item_name = 'Official Documentation Fees'
      AND quantity = 1
      AND price >= 0
      AND item_id IS NULL
      AND service_id IS NULL
      AND package_id IS NULL
      AND billing_adjustment_kind IS NULL
      AND clinic_charge_type_id IS NULL
    )
  );

CREATE UNIQUE INDEX consultation_items_active_source_document_unique_idx
  ON public.consultation_items (source_document_id)
  WHERE deleted_at IS NULL;

CREATE INDEX consultation_items_source_document_type_idx
  ON public.consultation_items (source_document_type)
  WHERE source_document_type IS NOT NULL;

-- Owner-only capability proving that a linked fee mutation came from the
-- document lifecycle trigger in this transaction and backend.
CREATE TABLE public.consultation_document_fee_guard (
  transaction_id bigint NOT NULL,
  backend_pid integer NOT NULL,
  source_document_id uuid NOT NULL
    REFERENCES public.consultation_documents(id),
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  PRIMARY KEY (
    transaction_id,
    backend_pid,
    source_document_id,
    actor_id
  )
);

ALTER TABLE public.consultation_document_fee_guard
  ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES
  ON TABLE public.consultation_document_fee_guard
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_consultation_item_source_document()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.source_document_id IS NOT NULL THEN
    IF OLD.deleted_at IS NOT NULL
       OR NEW.deleted_at IS NULL
       OR NEW.deleted_by IS DISTINCT FROM auth.uid()
       OR OLD.consultation_id IS DISTINCT FROM NEW.consultation_id
       OR OLD.item_name IS DISTINCT FROM NEW.item_name
       OR OLD.quantity IS DISTINCT FROM NEW.quantity
       OR OLD.price IS DISTINCT FROM NEW.price
       OR OLD.unit_cost IS DISTINCT FROM NEW.unit_cost
       OR OLD.item_id IS DISTINCT FROM NEW.item_id
       OR OLD.service_id IS DISTINCT FROM NEW.service_id
       OR OLD.package_id IS DISTINCT FROM NEW.package_id
       OR OLD.billing_adjustment_kind IS DISTINCT FROM
         NEW.billing_adjustment_kind
       OR OLD.clinic_charge_type_id IS DISTINCT FROM
         NEW.clinic_charge_type_id
       OR OLD.source_document_id IS DISTINCT FROM NEW.source_document_id
       OR OLD.source_document_type IS DISTINCT FROM NEW.source_document_type
       OR NOT EXISTS (
         SELECT 1
         FROM public.consultation_document_fee_guard guard_row
         WHERE guard_row.transaction_id = txid_current()
           AND guard_row.backend_pid = pg_backend_pid()
           AND guard_row.source_document_id = OLD.source_document_id
           AND guard_row.actor_id = auth.uid()
       ) THEN
      RAISE EXCEPTION 'DOCUMENT_FEE_ITEM_IMMUTABLE'
        USING ERRCODE = '42501';
    END IF;
  ELSIF TG_OP = 'UPDATE'
        AND (
          OLD.source_document_id IS DISTINCT FROM NEW.source_document_id
          OR OLD.source_document_type IS DISTINCT FROM NEW.source_document_type
        ) THEN
    RAISE EXCEPTION 'SOURCE_DOCUMENT_METADATA_IMMUTABLE'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' AND NEW.source_document_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.consultation_documents cd
      WHERE cd.id = NEW.source_document_id
        AND cd.consultation_id = NEW.consultation_id
        AND lower(btrim(coalesce(cd.type, ''))) = NEW.source_document_type
    ) THEN
      RAISE EXCEPTION 'SOURCE_DOCUMENT_MISMATCH'
        USING ERRCODE = '23503';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

ALTER FUNCTION public.guard_consultation_item_source_document()
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.guard_consultation_item_source_document()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER guard_consultation_item_source_document
  BEFORE INSERT OR UPDATE
  ON public.consultation_items
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_consultation_item_source_document();

CREATE OR REPLACE FUNCTION public.guard_billed_consultation_document_reassignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF (
       OLD.consultation_id IS DISTINCT FROM NEW.consultation_id
       OR OLD.patient_id IS DISTINCT FROM NEW.patient_id
       OR OLD.type IS DISTINCT FROM NEW.type
       OR OLD.created_by IS DISTINCT FROM NEW.created_by
     )
     AND EXISTS (
       SELECT 1
       FROM public.consultation_items ci
       WHERE ci.source_document_id = OLD.id
         AND ci.deleted_at IS NULL
     ) THEN
    RAISE EXCEPTION 'BILLED_DOCUMENT_IMMUTABLE'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

ALTER FUNCTION public.guard_billed_consultation_document_reassignment()
  OWNER TO postgres;
REVOKE ALL
  ON FUNCTION public.guard_billed_consultation_document_reassignment()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER guard_billed_consultation_document_reassignment
  BEFORE UPDATE OF consultation_id, patient_id, type, created_by
  ON public.consultation_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_billed_consultation_document_reassignment();

CREATE OR REPLACE FUNCTION public.sync_consultation_document_fee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_document_id uuid;
  v_consultation_id uuid;
  v_patient_id uuid;
  v_document_type text;
  v_queue_entry_id uuid;
  v_consultation_status text;
  v_queue_status public.clinic_status;
  v_fee numeric(10, 2);
  v_completed boolean;
  v_before_state jsonb;
  v_after_state jsonb;
  v_total numeric;
  v_active_item public.consultation_items;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.is_staff_or_clinical(auth.uid()) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  v_document_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  v_consultation_id :=
    CASE WHEN TG_OP = 'DELETE' THEN OLD.consultation_id ELSE NEW.consultation_id END;
  v_patient_id :=
    CASE WHEN TG_OP = 'DELETE' THEN OLD.patient_id ELSE NEW.patient_id END;
  v_document_type := lower(
    btrim(
      coalesce(
        CASE WHEN TG_OP = 'DELETE' THEN OLD.type ELSE NEW.type END,
        ''
      )
    )
  );

  IF v_document_type NOT IN ('mc', 'prescription', 'referral') THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  -- Documents issued before this migration have no linked fee to reverse.
  IF TG_OP = 'DELETE' AND NOT EXISTS (
    SELECT 1
    FROM public.consultation_items ci
    WHERE ci.source_document_id = v_document_id
      AND ci.deleted_at IS NULL
  ) THEN
    RETURN OLD;
  END IF;

  -- Use the same boundary as completed-bill correction before any row lock.
  PERFORM public.lock_completed_bill_item_mutation_boundary();

  SELECT c.queue_entry_id
    INTO v_queue_entry_id
  FROM public.consultations c
  WHERE c.id = v_consultation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONSULTATION_NOT_FOUND' USING ERRCODE = '22023';
  END IF;

  SELECT qe.clinic_status
    INTO v_queue_status
  FROM public.queue_entries qe
  WHERE qe.id = v_queue_entry_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VISIT_NOT_FOUND' USING ERRCODE = '22023';
  END IF;

  SELECT c.status
    INTO v_consultation_status
  FROM public.consultations c
  WHERE c.id = v_consultation_id
    AND c.patient_id = v_patient_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONSULTATION_PATIENT_MISMATCH'
      USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.consultation_items ci
  WHERE ci.consultation_id = v_consultation_id
    AND ci.deleted_at IS NULL
  ORDER BY ci.id
  FOR UPDATE;

  PERFORM 1
  FROM public.payments p
  WHERE p.queue_entry_id = v_queue_entry_id
    AND p.deleted_at IS NULL
  ORDER BY p.id
  FOR UPDATE;

  PERFORM 1
  FROM public.panel_claims pc
  WHERE pc.queue_entry_id = v_queue_entry_id
  ORDER BY pc.id
  FOR UPDATE;

  v_completed :=
    v_consultation_status = 'completed'
    OR v_queue_status = 'completed';

  IF v_completed
     AND (
       v_consultation_status IS DISTINCT FROM 'completed'
       OR v_queue_status IS DISTINCT FROM 'completed'
       OR NOT public.can_correct_completed_bill(auth.uid())
     ) THEN
    RAISE EXCEPTION 'COMPLETED_BILL_CORRECTION_REQUIRED'
      USING ERRCODE = '42501';
  END IF;

  IF v_completed THEN
    v_before_state := public.completed_bill_correction_state(
      v_queue_entry_id,
      v_consultation_id
    );

    INSERT INTO public.completed_bill_correction_guard (
      transaction_id,
      backend_pid,
      consultation_id,
      actor_id
    )
    VALUES (
      txid_current(),
      pg_backend_pid(),
      v_consultation_id,
      auth.uid()
    );
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT cdf.amount
      INTO STRICT v_fee
    FROM public.clinic_document_fees cdf
    WHERE cdf.document_type = v_document_type;

    INSERT INTO public.consultation_items (
      consultation_id,
      item_name,
      quantity,
      price,
      unit_cost,
      source_document_id,
      source_document_type
    )
    VALUES (
      v_consultation_id,
      'Official Documentation Fees',
      1,
      v_fee,
      0,
      v_document_id,
      v_document_type
    )
    ON CONFLICT (source_document_id)
      WHERE deleted_at IS NULL
      DO NOTHING;

    SELECT ci.*
      INTO STRICT v_active_item
    FROM public.consultation_items ci
    WHERE ci.source_document_id = v_document_id
      AND ci.deleted_at IS NULL;

    IF v_active_item.consultation_id IS DISTINCT FROM v_consultation_id
       OR v_active_item.source_document_type IS DISTINCT FROM v_document_type
       OR v_active_item.item_name IS DISTINCT FROM
         'Official Documentation Fees'
       OR v_active_item.quantity IS DISTINCT FROM 1
       OR v_active_item.price IS DISTINCT FROM v_fee THEN
      RAISE EXCEPTION 'SOURCE_DOCUMENT_CHARGE_CONFLICT'
        USING ERRCODE = '23505';
    END IF;
  ELSE
    INSERT INTO public.consultation_document_fee_guard (
      transaction_id,
      backend_pid,
      source_document_id,
      actor_id
    )
    VALUES (
      txid_current(),
      pg_backend_pid(),
      v_document_id,
      auth.uid()
    );

    UPDATE public.consultation_items
    SET deleted_at = now(),
        deleted_by = auth.uid()
    WHERE source_document_id = v_document_id
      AND deleted_at IS NULL;

    DELETE FROM public.consultation_document_fee_guard
    WHERE transaction_id = txid_current()
      AND backend_pid = pg_backend_pid()
      AND source_document_id = v_document_id
      AND actor_id = auth.uid();
  END IF;

  IF v_completed THEN
    DELETE FROM public.completed_bill_correction_guard
    WHERE transaction_id = txid_current()
      AND backend_pid = pg_backend_pid()
      AND consultation_id = v_consultation_id
      AND actor_id = auth.uid();

    PERFORM public.ensure_panel_claim_for_queue(v_queue_entry_id);

    SELECT GREATEST(
      COALESCE(sum(round(ci.price * ci.quantity, 2)), 0),
      0
    )
      INTO v_total
    FROM public.consultation_items ci
    WHERE ci.consultation_id = v_consultation_id
      AND ci.deleted_at IS NULL;

    UPDATE public.panel_claims
    SET amount = round(v_total, 2)
    WHERE queue_entry_id = v_queue_entry_id;

    v_after_state := public.completed_bill_correction_state(
      v_queue_entry_id,
      v_consultation_id
    );

    INSERT INTO public.completed_bill_correction_audit (
      queue_entry_id,
      consultation_id,
      actor_id,
      reason,
      before_state,
      after_state
    )
    VALUES (
      v_queue_entry_id,
      v_consultation_id,
      auth.uid(),
      CASE
        WHEN TG_OP = 'INSERT' THEN
          'Official document issued: ' || v_document_type
        ELSE
          'Official document voided: ' || v_document_type
      END,
      v_before_state,
      v_after_state
    );
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

ALTER FUNCTION public.sync_consultation_document_fee()
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.sync_consultation_document_fee()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER charge_consultation_document_fee
  AFTER INSERT ON public.consultation_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_consultation_document_fee();

CREATE TRIGGER reverse_consultation_document_fee
  BEFORE DELETE ON public.consultation_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_consultation_document_fee();

CREATE OR REPLACE FUNCTION public.issue_consultation_document_with_fee(
  _document_id uuid,
  _consultation_id uuid,
  _patient_id uuid,
  _template_id uuid,
  _template_name text,
  _type text,
  _content text,
  _paper_size text,
  _orientation text
)
RETURNS public.consultation_documents
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_queue_entry_id uuid;
  v_consultation_patient_id uuid;
  v_document_type text;
  v_document public.consultation_documents;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.is_staff_or_clinical(auth.uid()) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  IF _document_id IS NULL
     OR _consultation_id IS NULL
     OR _patient_id IS NULL
     OR nullif(btrim(coalesce(_template_name, '')), '') IS NULL
     OR _content IS NULL
     OR nullif(btrim(coalesce(_paper_size, '')), '') IS NULL
     OR nullif(btrim(coalesce(_orientation, '')), '') IS NULL THEN
    RAISE EXCEPTION 'INVALID_DOCUMENT' USING ERRCODE = '22023';
  END IF;

  v_document_type := nullif(lower(btrim(coalesce(_type, ''))), '');

  -- Acquire the completed-bill boundary before the queue-first row locks.
  PERFORM pg_advisory_xact_lock(17291, 20260728);

  SELECT c.queue_entry_id, c.patient_id
    INTO v_queue_entry_id, v_consultation_patient_id
  FROM public.consultations c
  WHERE c.id = _consultation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONSULTATION_NOT_FOUND' USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.queue_entries qe
  WHERE qe.id = v_queue_entry_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VISIT_NOT_FOUND' USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.consultations c
  WHERE c.id = _consultation_id
  FOR UPDATE;

  IF v_consultation_patient_id IS DISTINCT FROM _patient_id THEN
    RAISE EXCEPTION 'CONSULTATION_PATIENT_MISMATCH'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.consultation_documents (
    id,
    consultation_id,
    patient_id,
    template_id,
    template_name,
    type,
    content,
    paper_size,
    orientation,
    created_by
  )
  VALUES (
    _document_id,
    _consultation_id,
    _patient_id,
    _template_id,
    btrim(_template_name),
    v_document_type,
    _content,
    btrim(_paper_size),
    btrim(_orientation),
    auth.uid()
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING * INTO v_document;

  IF v_document.id IS NULL THEN
    SELECT cd.*
      INTO v_document
    FROM public.consultation_documents cd
    WHERE cd.id = _document_id;

    IF NOT FOUND
       OR v_document.consultation_id IS DISTINCT FROM _consultation_id
       OR v_document.patient_id IS DISTINCT FROM _patient_id
       OR v_document.template_id IS DISTINCT FROM _template_id
       OR v_document.template_name IS DISTINCT FROM btrim(_template_name)
       OR v_document.type IS DISTINCT FROM v_document_type
       OR v_document.content IS DISTINCT FROM _content
       OR v_document.paper_size IS DISTINCT FROM btrim(_paper_size)
       OR v_document.orientation IS DISTINCT FROM btrim(_orientation)
       OR v_document.created_by IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'DOCUMENT_ID_CONFLICT' USING ERRCODE = '23505';
    END IF;
  END IF;

  RETURN v_document;
END;
$function$;

ALTER FUNCTION public.issue_consultation_document_with_fee(
  uuid, uuid, uuid, uuid, text, text, text, text, text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.issue_consultation_document_with_fee(
  uuid, uuid, uuid, uuid, text, text, text, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.issue_consultation_document_with_fee(
  uuid, uuid, uuid, uuid, text, text, text, text, text
) FROM anon;
GRANT EXECUTE ON FUNCTION public.issue_consultation_document_with_fee(
  uuid, uuid, uuid, uuid, text, text, text, text, text
) TO authenticated;

CREATE OR REPLACE FUNCTION public.void_consultation_document_with_fee(
  _document_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_consultation_id uuid;
  v_queue_entry_id uuid;
  v_deleted_id uuid;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.is_staff_or_clinical(auth.uid()) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  IF _document_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_DOCUMENT' USING ERRCODE = '22023';
  END IF;

  SELECT cd.consultation_id, c.queue_entry_id
    INTO v_consultation_id, v_queue_entry_id
  FROM public.consultation_documents cd
  INNER JOIN public.consultations c ON c.id = cd.consultation_id
  WHERE cd.id = _document_id;

  -- A repeated void is an idempotent no-op.
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Acquire the completed-bill boundary before the queue-first row locks.
  PERFORM pg_advisory_xact_lock(17291, 20260728);

  PERFORM 1
  FROM public.queue_entries qe
  WHERE qe.id = v_queue_entry_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VISIT_NOT_FOUND' USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.consultations c
  WHERE c.id = v_consultation_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONSULTATION_NOT_FOUND' USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.consultation_documents cd
  WHERE cd.id = _document_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  DELETE FROM public.consultation_documents
  WHERE id = _document_id
  RETURNING id INTO v_deleted_id;

  IF v_deleted_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
END;
$function$;

ALTER FUNCTION public.void_consultation_document_with_fee(uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.void_consultation_document_with_fee(uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.void_consultation_document_with_fee(uuid)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.void_consultation_document_with_fee(uuid)
  TO authenticated;
