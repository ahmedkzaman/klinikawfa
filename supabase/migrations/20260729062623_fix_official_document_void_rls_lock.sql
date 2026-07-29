-- Completed-bill correctors can read consultations that their ordinary update
-- policy does not expose for SELECT ... FOR UPDATE. Keep these RPCs invoker
-- rights and leave consultation authorization/locking to the existing
-- non-callable lifecycle trigger, which validates the actor and acquires the
-- completed-bill guard before mutating the linked fee.

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

  -- Acquire the completed-bill boundary before the queue-first row lock.
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

  SELECT c.queue_entry_id
    INTO v_queue_entry_id
  FROM public.consultation_documents cd
  INNER JOIN public.consultations c ON c.id = cd.consultation_id
  WHERE cd.id = _document_id;

  -- A repeated void is an idempotent no-op.
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Acquire the completed-bill boundary before the queue-first row lock.
  PERFORM pg_advisory_xact_lock(17291, 20260728);

  PERFORM 1
  FROM public.queue_entries qe
  WHERE qe.id = v_queue_entry_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VISIT_NOT_FOUND' USING ERRCODE = '22023';
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
