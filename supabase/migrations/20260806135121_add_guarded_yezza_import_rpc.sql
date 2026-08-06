-- Guarded Yezza import approval and apply pathway. The Edge Function may use a
-- server credential, but these RPCs independently verify the authenticated
-- actor against public.user_roles and never authorize from JWT user metadata.

BEGIN;

ALTER TABLE public.import_batches
  ADD COLUMN IF NOT EXISTS review_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS review_artifacts jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS payload_hash text,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

ALTER TABLE public.import_batches
  DROP CONSTRAINT IF EXISTS import_batches_review_payload_shape_check,
  DROP CONSTRAINT IF EXISTS import_batches_approval_gate_check;

ALTER TABLE public.import_batches
  ADD CONSTRAINT import_batches_review_payload_shape_check CHECK (
    jsonb_typeof(source_counts) = 'object'
    AND jsonb_typeof(review_counts) = 'object'
    AND jsonb_typeof(review_artifacts) = 'array'
    AND pg_column_size(source_counts) <= 8192
    AND pg_column_size(review_counts) <= 8192
    AND pg_column_size(review_artifacts) <= 8192
  ),
  ADD CONSTRAINT import_batches_approval_gate_check CHECK (
    status NOT IN ('approved', 'applying', 'completed', 'failed')
    OR (
      payload_hash ~ '^[0-9a-f]{64}$'
      AND approved_by IS NOT NULL
      AND approved_at IS NOT NULL
    )
  );

-- Historical imported consultations have a distinct provenance. They are not
-- part of the offline-transcription approval workflow.
ALTER TABLE public.consultations
  DROP CONSTRAINT IF EXISTS consultations_entry_source_check,
  DROP CONSTRAINT IF EXISTS consultations_offline_provenance_check;

ALTER TABLE public.consultations
  ADD CONSTRAINT consultations_entry_source_check
    CHECK (entry_source IN ('live', 'offline_transcription', 'legacy_import')),
  ADD CONSTRAINT consultations_offline_provenance_check
    CHECK (
      (
        entry_source = 'live'
        AND approval_status = 'not_required'
        AND entered_by IS NULL
        AND original_consulted_at IS NULL
      )
      OR (
        entry_source = 'offline_transcription'
        AND entered_by IS NOT NULL
        AND original_consulted_at IS NOT NULL
        AND approval_status IN ('pending', 'returned', 'approved')
      )
      OR (
        entry_source = 'legacy_import'
        AND entered_by IS NOT NULL
        AND original_consulted_at IS NOT NULL
        AND approval_status = 'not_required'
      )
    );

-- Historical items preserve recorded source prices and never reserve or
-- deduct present-day inventory merely because a legacy label matches today's
-- catalogue. Live and offline consultation behavior is otherwise unchanged.
CREATE OR REPLACE FUNCTION public.trg_lock_cogs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.consultations AS consultation
    WHERE consultation.id = NEW.consultation_id
      AND consultation.entry_source = 'legacy_import'
  ) THEN
    NEW.unit_cost := 0;
    RETURN NEW;
  END IF;

  IF (TG_OP = 'INSERT')
     OR (NEW.item_id IS DISTINCT FROM OLD.item_id)
     OR (NEW.service_id IS DISTINCT FROM OLD.service_id)
     OR (NEW.package_id IS DISTINCT FROM OLD.package_id)
     OR (NEW.item_name IS DISTINCT FROM OLD.item_name) THEN
    IF NEW.item_id IS NOT NULL THEN
      NEW.unit_cost := coalesce((SELECT cost_price FROM public.inventory_items WHERE id = NEW.item_id), 0);
    ELSIF NEW.service_id IS NOT NULL THEN
      NEW.unit_cost := coalesce((SELECT cost FROM public.services WHERE id = NEW.service_id), 0);
    ELSIF NEW.package_id IS NOT NULL THEN
      NEW.unit_cost := coalesce((SELECT cost FROM public.packages WHERE id = NEW.package_id), 0);
    ELSE
      NEW.unit_cost := coalesce(
        (SELECT cost_price FROM public.inventory_items WHERE name = NEW.item_name AND status = 'active' LIMIT 1),
        (SELECT cost FROM public.services WHERE name = NEW.item_name LIMIT 1),
        (SELECT cost FROM public.packages WHERE name = NEW.item_name LIMIT 1),
        0
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_consultation_items_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_item_id uuid;
  v_old_item_id uuid;
  v_diff integer;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.consultations AS consultation
    WHERE consultation.id = NEW.consultation_id
      AND consultation.entry_source = 'legacy_import'
  ) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.completed_bill_correction_guard AS guard_row
    JOIN public.consultations AS consultation ON consultation.id = guard_row.consultation_id
    JOIN public.queue_entries AS queue_entry ON queue_entry.id = consultation.queue_entry_id
    WHERE guard_row.transaction_id = txid_current()
      AND guard_row.backend_pid = pg_backend_pid()
      AND guard_row.consultation_id = NEW.consultation_id
      AND guard_row.actor_id = auth.uid()
      AND public.can_correct_completed_bill(auth.uid())
      AND consultation.status = 'completed'
      AND queue_entry.clinic_status = 'completed'
  ) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.deleted_at IS NULL THEN
      v_item_id := public._resolve_inventory_item_id(NEW.item_name);
      IF v_item_id IS NOT NULL THEN
        PERFORM public.reserve_inventory(v_item_id, NEW.quantity);
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      v_item_id := public._resolve_inventory_item_id(OLD.item_name);
      IF v_item_id IS NOT NULL THEN
        PERFORM public.release_inventory(v_item_id, OLD.quantity);
      END IF;
      RETURN NEW;
    END IF;

    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NULL THEN
      IF OLD.item_name = NEW.item_name THEN
        v_item_id := public._resolve_inventory_item_id(NEW.item_name);
        IF v_item_id IS NOT NULL THEN
          v_diff := NEW.quantity - OLD.quantity;
          IF v_diff > 0 THEN
            PERFORM public.reserve_inventory(v_item_id, v_diff);
          ELSIF v_diff < 0 THEN
            PERFORM public.release_inventory(v_item_id, -v_diff);
          END IF;
        END IF;
      ELSE
        v_old_item_id := public._resolve_inventory_item_id(OLD.item_name);
        IF v_old_item_id IS NOT NULL THEN
          PERFORM public.release_inventory(v_old_item_id, OLD.quantity);
        END IF;
        v_item_id := public._resolve_inventory_item_id(NEW.item_name);
        IF v_item_id IS NOT NULL THEN
          PERFORM public.reserve_inventory(v_item_id, NEW.quantity);
        END IF;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$;

-- Once this server-side pathway exists, authenticated clients must not bypass
-- the approval gate by writing the ledger or source identity tables directly.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.import_batches FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.patient_external_ids FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.visit_external_ids FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.transaction_external_ids FROM authenticated;

DROP POLICY IF EXISTS "import operators create batches" ON public.import_batches;
DROP POLICY IF EXISTS "import operators update own batches" ON public.import_batches;
DROP POLICY IF EXISTS "import operators create patient external ids" ON public.patient_external_ids;
DROP POLICY IF EXISTS "import operators create visit external ids" ON public.visit_external_ids;
DROP POLICY IF EXISTS "import operators create transaction external ids" ON public.transaction_external_ids;

CREATE OR REPLACE FUNCTION public.approve_yezza_import(
  p_actor_id uuid,
  p_source_batch_id text,
  p_payload_hash text,
  p_source_counts jsonb,
  p_review_counts jsonb,
  p_review_artifacts jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_batch public.import_batches%ROWTYPE;
BEGIN
  IF p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.user_roles AS user_role
    WHERE user_role.user_id = p_actor_id
      AND user_role.role::text IN ('admin', 'doctor_admin')
  ) THEN
    RAISE EXCEPTION 'YEZZA_IMPORT_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF coalesce(btrim(p_source_batch_id), '') = ''
     OR length(p_source_batch_id) > 128
     OR p_payload_hash !~ '^[0-9a-f]{64}$'
     OR jsonb_typeof(p_source_counts) <> 'object'
     OR jsonb_typeof(p_review_counts) <> 'object'
     OR jsonb_typeof(p_review_artifacts) <> 'array'
     OR pg_column_size(p_source_counts) > 8192
     OR pg_column_size(p_review_counts) > 8192
     OR pg_column_size(p_review_artifacts) > 8192 THEN
    RAISE EXCEPTION 'YEZZA_IMPORT_INVALID_APPROVAL' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.import_batches (
    source_system,
    source_batch_id,
    status,
    source_counts,
    review_counts,
    review_artifacts,
    payload_hash,
    imported_counts,
    error_summary,
    created_by,
    approved_by,
    approved_at
  ) VALUES (
    'yezza',
    btrim(p_source_batch_id),
    'approved',
    p_source_counts,
    p_review_counts,
    p_review_artifacts,
    p_payload_hash,
    '{}'::jsonb,
    '{}'::jsonb,
    p_actor_id,
    p_actor_id,
    clock_timestamp()
  )
  ON CONFLICT (source_system, source_batch_id) DO UPDATE
    SET status = 'approved',
        source_counts = EXCLUDED.source_counts,
        review_counts = EXCLUDED.review_counts,
        review_artifacts = EXCLUDED.review_artifacts,
        approved_by = EXCLUDED.approved_by,
        approved_at = EXCLUDED.approved_at,
        completed_at = NULL
    WHERE public.import_batches.payload_hash = EXCLUDED.payload_hash
      AND public.import_batches.status IN ('approved', 'failed')
  RETURNING * INTO v_batch;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'YEZZA_IMPORT_APPROVAL_MISMATCH' USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'importBatchId', v_batch.id,
    'status', v_batch.status
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_yezza_import(
  p_import_batch_id uuid,
  p_actor_id uuid,
  p_payload_hash text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_batch public.import_batches%ROWTYPE;
  v_patient jsonb;
  v_visit jsonb;
  v_item jsonb;
  v_transaction jsonb;
  v_patient_id uuid;
  v_intended_patient_id uuid;
  v_queue_entry_id uuid;
  v_consultation_id uuid;
  v_existing_visit_patient_id uuid;
  v_existing_visit_purpose text;
  v_source_has_consultation boolean;
  v_existing_has_consultation boolean;
  v_existing_transaction public.transaction_external_ids%ROWTYPE;
  v_amount numeric;
  v_paid_amount numeric;
  v_source_counts jsonb;
  v_imported_counts jsonb := jsonb_build_object(
    'patientsCreated', 0,
    'patientsReused', 0,
    'patientIdentitiesCreated', 0,
    'visitsCreated', 0,
    'visitsReused', 0,
    'consultationsCreated', 0,
    'consultationItemsCreated', 0,
    'paymentsCreated', 0,
    'transactionIdentitiesCreated', 0,
    'transactionsReused', 0
  );
  v_error_state text;
BEGIN
  IF p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.user_roles AS user_role
    WHERE user_role.user_id = p_actor_id
      AND user_role.role::text IN ('admin', 'doctor_admin')
  ) THEN
    RAISE EXCEPTION 'YEZZA_IMPORT_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF p_import_batch_id IS NULL
     OR p_payload_hash !~ '^[0-9a-f]{64}$'
     OR jsonb_typeof(p_payload) <> 'object'
     OR pg_column_size(p_payload) > 8388608
     OR jsonb_typeof(p_payload->'patients') <> 'array'
     OR jsonb_typeof(p_payload->'visits') <> 'array'
     OR jsonb_typeof(p_payload->'reviewCounts') <> 'object' THEN
    RAISE EXCEPTION 'YEZZA_IMPORT_INVALID_PAYLOAD' USING ERRCODE = '22023';
  END IF;

  SELECT batch.*
    INTO v_batch
  FROM public.import_batches AS batch
  WHERE batch.id = p_import_batch_id
    AND batch.source_system = 'yezza'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'YEZZA_IMPORT_BATCH_NOT_FOUND' USING ERRCODE = '22023';
  END IF;

  IF v_batch.payload_hash IS DISTINCT FROM p_payload_hash
     OR v_batch.source_batch_id IS DISTINCT FROM p_payload->>'sourceBatchId'
     OR v_batch.review_counts IS DISTINCT FROM p_payload->'reviewCounts' THEN
    RAISE EXCEPTION 'YEZZA_IMPORT_APPROVAL_MISMATCH' USING ERRCODE = '22023';
  END IF;

  IF v_batch.status = 'completed' THEN
    RETURN jsonb_build_object(
      'status', 'completed',
      'importedCounts', v_batch.imported_counts,
      'idempotent', true
    );
  END IF;

  IF v_batch.status <> 'approved' THEN
    RAISE EXCEPTION 'YEZZA_IMPORT_BATCH_NOT_APPROVED' USING ERRCODE = '55000';
  END IF;

  SELECT jsonb_build_object(
    'patients', jsonb_array_length(p_payload->'patients'),
    'visits', jsonb_array_length(p_payload->'visits'),
    'consultations', (
      SELECT count(*)
      FROM jsonb_array_elements(p_payload->'visits') AS visit
      WHERE visit->'consultation' IS NOT NULL
        AND visit->'consultation' <> 'null'::jsonb
    ),
    'consultationItems', (
      SELECT coalesce(sum(jsonb_array_length(visit->'items')), 0)
      FROM jsonb_array_elements(p_payload->'visits') AS visit
    ),
    'transactions', (
      SELECT coalesce(sum(jsonb_array_length(visit->'transactions')), 0)
      FROM jsonb_array_elements(p_payload->'visits') AS visit
    ),
    'payments', (
      SELECT count(*)
      FROM jsonb_array_elements(p_payload->'visits') AS visit
      CROSS JOIN LATERAL jsonb_array_elements(visit->'transactions') AS source_transaction
      WHERE (source_transaction->>'paidAmount')::numeric > 0
    )
  )
  INTO v_source_counts;

  IF v_source_counts IS DISTINCT FROM v_batch.source_counts THEN
    RAISE EXCEPTION 'YEZZA_IMPORT_COUNT_MISMATCH' USING ERRCODE = '22023';
  END IF;

  BEGIN
    UPDATE public.import_batches
       SET status = 'applying',
           started_at = clock_timestamp(),
           completed_at = NULL,
           imported_counts = '{}'::jsonb,
           error_summary = '{}'::jsonb
     WHERE id = p_import_batch_id;

    -- 1. Patient identities. Existing source mappings always win; a supplied
    -- existing patient is reused, otherwise the canonical patient is created.
    FOR v_patient IN SELECT value FROM jsonb_array_elements(p_payload->'patients') LOOP
      PERFORM pg_advisory_xact_lock(hashtextextended('yezza:patient:' || (v_patient->>'sourcePatientId'), 0));

      SELECT external_id.patient_id
        INTO v_patient_id
      FROM public.patient_external_ids AS external_id
      WHERE external_id.source_system = 'yezza'
        AND external_id.source_patient_id = v_patient->>'sourcePatientId';

      IF FOUND THEN
        IF coalesce(v_patient->>'existingPatientId', '') <> ''
           AND v_patient_id IS DISTINCT FROM (v_patient->>'existingPatientId')::uuid THEN
          RAISE EXCEPTION 'YEZZA_IMPORT_PATIENT_MAPPING_CONFLICT' USING ERRCODE = '23505';
        END IF;
        v_imported_counts := jsonb_set(
          v_imported_counts,
          '{patientsReused}',
          to_jsonb((v_imported_counts->>'patientsReused')::integer + 1)
        );
        CONTINUE;
      END IF;

      IF coalesce(v_patient->>'existingPatientId', '') <> '' THEN
        SELECT patient.id
          INTO v_intended_patient_id
        FROM public.patients AS patient
        WHERE patient.id = (v_patient->>'existingPatientId')::uuid;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'YEZZA_IMPORT_PATIENT_NOT_FOUND' USING ERRCODE = '23503';
        END IF;
        v_imported_counts := jsonb_set(
          v_imported_counts,
          '{patientsReused}',
          to_jsonb((v_imported_counts->>'patientsReused')::integer + 1)
        );
      ELSE
        INSERT INTO public.patients (
          name,
          phone,
          email,
          national_id,
          passport_no,
          address,
          reg_no,
          date_of_birth,
          gender,
          state_of_birth,
          allergies,
          underlying_conditions,
          registration_date,
          notes
        ) VALUES (
          v_patient->'patient'->>'name',
          nullif(v_patient->'patient'->>'phone', ''),
          nullif(v_patient->'patient'->>'email', ''),
          nullif(v_patient->'patient'->>'nationalId', ''),
          nullif(v_patient->'patient'->>'passportNo', ''),
          nullif(v_patient->'patient'->>'address', ''),
          nullif(v_patient->'patient'->>'regNo', ''),
          nullif(v_patient->'patient'->>'dateOfBirth', '')::date,
          nullif(v_patient->'patient'->>'gender', ''),
          nullif(v_patient->'patient'->>'stateOfBirth', ''),
          nullif(v_patient->'patient'->>'allergies', ''),
          nullif(v_patient->'patient'->>'underlyingConditions', ''),
          coalesce(nullif(v_patient->'patient'->>'registrationDate', '')::date, current_date),
          coalesce(v_patient->'patient'->>'notes', '')
        )
        RETURNING id INTO v_intended_patient_id;
        v_imported_counts := jsonb_set(
          v_imported_counts,
          '{patientsCreated}',
          to_jsonb((v_imported_counts->>'patientsCreated')::integer + 1)
        );
      END IF;

      INSERT INTO public.patient_external_ids (
        source_system, source_patient_id, patient_id, import_batch_id
      ) VALUES (
        'yezza', v_patient->>'sourcePatientId', v_intended_patient_id, p_import_batch_id
      );
      v_imported_counts := jsonb_set(
        v_imported_counts,
        '{patientIdentitiesCreated}',
        to_jsonb((v_imported_counts->>'patientIdentitiesCreated')::integer + 1)
      );
    END LOOP;

    -- 2-7. Visits are source-key gated. Their dependent consultation and line
    -- items are created only alongside a new visit; bills are independently
    -- keyed so retries cannot create duplicate payments.
    FOR v_visit IN SELECT value FROM jsonb_array_elements(p_payload->'visits') LOOP
      v_queue_entry_id := NULL;
      v_consultation_id := NULL;
      v_existing_visit_patient_id := NULL;
      v_existing_visit_purpose := NULL;
      v_existing_has_consultation := false;
      v_source_has_consultation := v_visit->'consultation' IS NOT NULL
        AND v_visit->'consultation' <> 'null'::jsonb;
      IF NOT v_source_has_consultation
         AND jsonb_array_length(v_visit->'items') <> 0 THEN
        RAISE EXCEPTION 'YEZZA_IMPORT_FINANCIAL_VISIT_ITEM_CONFLICT' USING ERRCODE = '22023';
      END IF;

      SELECT external_id.patient_id
        INTO v_patient_id
      FROM public.patient_external_ids AS external_id
      WHERE external_id.source_system = 'yezza'
        AND external_id.source_patient_id = v_visit->>'sourcePatientId';
      IF NOT FOUND THEN
        RAISE EXCEPTION 'YEZZA_IMPORT_PATIENT_IDENTITY_MISSING' USING ERRCODE = '23503';
      END IF;

      PERFORM pg_advisory_xact_lock(hashtextextended('yezza:visit:' || (v_visit->>'sourceVisitId'), 0));
      SELECT external_id.queue_entry_id, queue_entry.patient_id, queue_entry.visit_purpose
        INTO v_queue_entry_id, v_existing_visit_patient_id, v_existing_visit_purpose
      FROM public.visit_external_ids AS external_id
      JOIN public.queue_entries AS queue_entry
        ON queue_entry.id = external_id.queue_entry_id
      WHERE external_id.source_system = 'yezza'
        AND external_id.source_visit_id = v_visit->>'sourceVisitId';

      IF FOUND THEN
        IF v_existing_visit_patient_id IS DISTINCT FROM v_patient_id THEN
          RAISE EXCEPTION 'YEZZA_IMPORT_VISIT_PATIENT_CONFLICT' USING ERRCODE = '23505';
        END IF;
        IF v_existing_visit_purpose IS DISTINCT FROM v_visit->'queueEntry'->>'visitPurpose' THEN
          RAISE EXCEPTION 'YEZZA_IMPORT_VISIT_SHAPE_CONFLICT' USING ERRCODE = '23505';
        END IF;

        SELECT consultation.id
          INTO v_consultation_id
        FROM public.consultations AS consultation
        WHERE consultation.queue_entry_id = v_queue_entry_id
          AND consultation.deleted_at IS NULL;
        v_existing_has_consultation := FOUND;

        IF v_source_has_consultation IS DISTINCT FROM v_existing_has_consultation THEN
          RAISE EXCEPTION 'YEZZA_IMPORT_CONSULTATION_SHAPE_CONFLICT' USING ERRCODE = '23505';
        END IF;

        IF v_source_has_consultation AND NOT EXISTS (
          SELECT 1
          FROM public.consultations AS consultation
          WHERE consultation.id = v_consultation_id
            AND consultation.patient_id = v_patient_id
            AND consultation.doctor_id IS NOT DISTINCT FROM
              nullif(v_visit->'consultation'->>'doctorId', '')::uuid
            AND consultation.case_note IS NOT DISTINCT FROM
              coalesce(v_visit->'consultation'->>'caseNote', '')
            AND consultation.diagnosis_text IS NOT DISTINCT FROM
              coalesce(v_visit->'consultation'->>'diagnosisText', '')
            AND consultation.original_consulted_at IS NOT DISTINCT FROM
              nullif(v_visit->'consultation'->>'originalConsultedAt', '')::timestamptz
            AND consultation.entry_source = 'legacy_import'
            AND consultation.status = 'in_progress'
            AND consultation.deleted_at IS NULL
        ) THEN
          RAISE EXCEPTION 'YEZZA_IMPORT_CONSULTATION_SHAPE_CONFLICT' USING ERRCODE = '23505';
        END IF;

        IF v_source_has_consultation AND EXISTS (
          WITH source_items AS (
            SELECT
              source_item->>'itemName' AS item_name,
              (source_item->>'quantity')::integer AS quantity,
              (source_item->>'price')::numeric AS price,
              count(*) AS row_count
            FROM jsonb_array_elements(v_visit->'items') AS source_item
            GROUP BY 1, 2, 3
          ),
          target_items AS (
            SELECT
              target_item.item_name,
              target_item.quantity,
              target_item.price,
              count(*) AS row_count
            FROM public.consultation_items AS target_item
            WHERE target_item.consultation_id = v_consultation_id
              AND target_item.deleted_at IS NULL
            GROUP BY 1, 2, 3
          )
          SELECT 1
          FROM (
            (SELECT * FROM source_items EXCEPT SELECT * FROM target_items)
            UNION ALL
            (SELECT * FROM target_items EXCEPT SELECT * FROM source_items)
          ) AS item_difference
        ) THEN
          RAISE EXCEPTION 'YEZZA_IMPORT_ITEM_SHAPE_CONFLICT' USING ERRCODE = '23505';
        END IF;

        v_imported_counts := jsonb_set(
          v_imported_counts,
          '{visitsReused}',
          to_jsonb((v_imported_counts->>'visitsReused')::integer + 1)
        );
      ELSE
        INSERT INTO public.queue_entries (
          patient_id,
          clinic_status,
          assigned_doctor_id,
          visit_purpose,
          visit_notes,
          visit_remarks,
          payment_method,
          is_urgent,
          created_by,
          created_at,
          updated_at
        ) VALUES (
          v_patient_id,
          'registered'::public.clinic_status,
          nullif(v_visit->'queueEntry'->>'assignedDoctorId', '')::uuid,
          v_visit->'queueEntry'->>'visitPurpose',
          nullif(v_visit->'queueEntry'->>'visitNotes', ''),
          v_visit->'queueEntry'->>'visitRemarks',
          nullif(v_visit->'queueEntry'->>'paymentMethod', ''),
          coalesce((v_visit->'queueEntry'->>'isUrgent')::boolean, false),
          p_actor_id,
          coalesce(nullif(v_visit->'queueEntry'->>'createdAt', '')::timestamptz, clock_timestamp()),
          clock_timestamp()
        )
        RETURNING id INTO v_queue_entry_id;

        INSERT INTO public.visit_external_ids (
          source_system, source_visit_id, queue_entry_id, import_batch_id
        ) VALUES (
          'yezza', v_visit->>'sourceVisitId', v_queue_entry_id, p_import_batch_id
        );
        v_imported_counts := jsonb_set(
          v_imported_counts,
          '{visitsCreated}',
          to_jsonb((v_imported_counts->>'visitsCreated')::integer + 1)
        );

        IF v_source_has_consultation THEN
          INSERT INTO public.consultations (
            queue_entry_id,
            patient_id,
            doctor_id,
            case_note,
            diagnosis_text,
            status,
            entry_source,
            entered_by,
            original_consulted_at,
            approval_status,
            created_at,
            updated_at
          ) VALUES (
            v_queue_entry_id,
            v_patient_id,
            nullif(v_visit->'consultation'->>'doctorId', '')::uuid,
            coalesce(v_visit->'consultation'->>'caseNote', ''),
            coalesce(v_visit->'consultation'->>'diagnosisText', ''),
            'in_progress',
            'legacy_import',
            p_actor_id,
            (v_visit->'consultation'->>'originalConsultedAt')::timestamptz,
            'not_required',
            (v_visit->'consultation'->>'originalConsultedAt')::timestamptz,
            clock_timestamp()
          )
          RETURNING id INTO v_consultation_id;
          v_imported_counts := jsonb_set(
            v_imported_counts,
            '{consultationsCreated}',
            to_jsonb((v_imported_counts->>'consultationsCreated')::integer + 1)
          );

          FOR v_item IN SELECT value FROM jsonb_array_elements(v_visit->'items') LOOP
            IF (v_item->>'quantity')::integer <> 1
               OR (v_item->>'price')::numeric < 0
               OR round((v_item->>'price')::numeric, 2) <> (v_item->>'price')::numeric THEN
              RAISE EXCEPTION 'YEZZA_IMPORT_INVALID_ITEM' USING ERRCODE = '22023';
            END IF;
            INSERT INTO public.consultation_items (
              consultation_id, item_name, quantity, price, unit_cost
            ) VALUES (
              v_consultation_id,
              v_item->>'itemName',
              1,
              (v_item->>'price')::numeric,
              0
            );
            v_imported_counts := jsonb_set(
              v_imported_counts,
              '{consultationItemsCreated}',
              to_jsonb((v_imported_counts->>'consultationItemsCreated')::integer + 1)
            );
          END LOOP;
        END IF;
      END IF;

      FOR v_transaction IN SELECT value FROM jsonb_array_elements(v_visit->'transactions') LOOP
        PERFORM pg_advisory_xact_lock(hashtextextended('yezza:bill:' || (v_transaction->>'sourceBillId'), 0));
        v_amount := (v_transaction->>'amount')::numeric;
        v_paid_amount := (v_transaction->>'paidAmount')::numeric;
        IF v_amount < 0 OR v_paid_amount < 0
           OR round(v_amount, 2) <> v_amount
           OR round(v_paid_amount, 2) <> v_paid_amount THEN
          RAISE EXCEPTION 'YEZZA_IMPORT_INVALID_TRANSACTION' USING ERRCODE = '22023';
        END IF;

        SELECT external_id.*
          INTO v_existing_transaction
        FROM public.transaction_external_ids AS external_id
        WHERE external_id.source_system = 'yezza'
          AND external_id.source_bill_id = v_transaction->>'sourceBillId';

        IF FOUND THEN
          IF v_existing_transaction.queue_entry_id IS DISTINCT FROM v_queue_entry_id
             OR v_existing_transaction.amount IS DISTINCT FROM v_amount
             OR v_existing_transaction.paid_amount IS DISTINCT FROM v_paid_amount THEN
            RAISE EXCEPTION 'YEZZA_IMPORT_TRANSACTION_CONFLICT' USING ERRCODE = '23505';
          END IF;
          v_imported_counts := jsonb_set(
            v_imported_counts,
            '{transactionsReused}',
            to_jsonb((v_imported_counts->>'transactionsReused')::integer + 1)
          );
          CONTINUE;
        END IF;

        IF v_paid_amount > 0 THEN
          INSERT INTO public.payments (
            queue_entry_id,
            consultation_id,
            payment_type,
            payment_method,
            amount,
            notes,
            created_at
          ) VALUES (
            v_queue_entry_id,
            v_consultation_id,
            v_transaction->>'paymentType',
            v_transaction->>'paymentMethod',
            v_paid_amount,
            v_transaction->>'notes',
            coalesce(nullif(v_visit->'queueEntry'->>'createdAt', '')::timestamptz, clock_timestamp())
          );
          v_imported_counts := jsonb_set(
            v_imported_counts,
            '{paymentsCreated}',
            to_jsonb((v_imported_counts->>'paymentsCreated')::integer + 1)
          );
        END IF;

        INSERT INTO public.transaction_external_ids (
          source_system,
          source_bill_id,
          queue_entry_id,
          amount,
          paid_amount,
          import_batch_id
        ) VALUES (
          'yezza',
          v_transaction->>'sourceBillId',
          v_queue_entry_id,
          v_amount,
          v_paid_amount,
          p_import_batch_id
        );
        v_imported_counts := jsonb_set(
          v_imported_counts,
          '{transactionIdentitiesCreated}',
          to_jsonb((v_imported_counts->>'transactionIdentitiesCreated')::integer + 1)
        );
      END LOOP;
    END LOOP;

    UPDATE public.import_batches
       SET status = 'completed',
           imported_counts = v_imported_counts,
           error_summary = '{}'::jsonb,
           completed_at = clock_timestamp()
     WHERE id = p_import_batch_id;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_state = RETURNED_SQLSTATE;
    UPDATE public.import_batches
       SET status = 'failed',
           imported_counts = '{}'::jsonb,
           error_summary = jsonb_build_object(
             'code', 'YEZZA_IMPORT_FAILED',
             'sqlstate', v_error_state
           ),
           completed_at = clock_timestamp()
     WHERE id = p_import_batch_id;
    RETURN jsonb_build_object(
      'status', 'failed',
      'importedCounts', '{}'::jsonb,
      'idempotent', false,
      'errorCode', 'YEZZA_IMPORT_FAILED'
    );
  END;

  RETURN jsonb_build_object(
    'status', 'completed',
    'importedCounts', v_imported_counts,
    'idempotent', false
  );
END;
$function$;

ALTER FUNCTION public.approve_yezza_import(uuid, text, text, jsonb, jsonb, jsonb) OWNER TO postgres;
ALTER FUNCTION public.apply_yezza_import(uuid, uuid, text, jsonb) OWNER TO postgres;
ALTER FUNCTION public.trg_lock_cogs() OWNER TO postgres;
ALTER FUNCTION public.trg_consultation_items_inventory() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.approve_yezza_import(uuid, text, text, jsonb, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_yezza_import(uuid, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_yezza_import(uuid, text, text, jsonb, jsonb, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_yezza_import(uuid, uuid, text, jsonb)
  TO service_role;

COMMIT;
