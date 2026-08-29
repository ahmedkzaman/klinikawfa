-- Private, forward-only support for the reviewed Remedi historical import.
-- This migration contains no patient, encounter, invoice, or other PHI rows.

-- Fail before any DDL if the payment/attendance boundaries are not the reviewed ones.
DO $preflight$
DECLARE
  v_payment_trigger_function text;
  v_base_attendance text;
  v_insight_attendance text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'private.validate_payment_insert()'::regprocedure
  ) INTO v_payment_trigger_function;
  IF v_payment_trigger_function IS NULL
     OR v_payment_trigger_function NOT LIKE '%NEW.created_by := auth.uid();%'
     OR v_payment_trigger_function NOT LIKE '%NEW.created_at := pg_catalog.statement_timestamp();%'
     OR v_payment_trigger_function NOT LIKE '%PAYMENT_ACTOR_REQUIRED%'
     OR v_payment_trigger_function NOT LIKE '%STALE_PATIENT_OUTSTANDING%' THEN
    RAISE EXCEPTION 'REMEDI_PRECHECK_PAYMENT_TRIGGER_DEFINITION_MISMATCH';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger
    WHERE trigger.tgrelid = 'public.payments'::regclass
      AND trigger.tgname = 'validate_payment_insert'
      AND NOT trigger.tgisinternal
      AND trigger.tgfoid = 'private.validate_payment_insert()'::regprocedure
  ) THEN
    RAISE EXCEPTION 'REMEDI_PRECHECK_PAYMENT_TRIGGER_MISSING';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint AS catalog_constraint
    WHERE catalog_constraint.conrelid = 'public.payments'::regclass
      AND catalog_constraint.contype IN ('p', 'f', 'c')
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy AS policy
    WHERE policy.polrelid = 'public.payments'::regclass
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_indexes AS index
    WHERE index.schemaname = 'public' AND index.tablename = 'payments'
  ) THEN
    RAISE EXCEPTION 'REMEDI_PRECHECK_PAYMENT_CATALOG_BOUNDARY_MISSING';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger AS trigger
    WHERE trigger.tgrelid = 'public.panel_claims'::regclass
      AND NOT trigger.tgisinternal
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint AS catalog_constraint
    WHERE catalog_constraint.conrelid = 'public.panel_claims'::regclass
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy AS policy
    WHERE policy.polrelid = 'public.panel_claims'::regclass
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_indexes AS index
    WHERE index.schemaname = 'public' AND index.tablename = 'panel_claims'
  ) THEN
    RAISE EXCEPTION 'REMEDI_PRECHECK_PANEL_CLAIM_BOUNDARY_MISSING';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(
    'public.get_clinical_attendance_heatmap(date,date,uuid)'::regprocedure
  ) INTO v_base_attendance;
  SELECT pg_catalog.pg_get_functiondef(
    'public._get_insight_clinical_attendance_heatmap_round3(date,date,uuid)'::regprocedure
  ) INTO v_insight_attendance;
  IF v_base_attendance NOT LIKE '%WHERE qe.queue_number IS NOT NULL%'
     OR v_base_attendance NOT LIKE '%qe.visit_type::text <> ''payment_only''%'
     OR v_insight_attendance NOT LIKE '%WHERE qe.queue_number IS NOT NULL%'
     OR v_insight_attendance NOT LIKE '%qe.visit_type::text <> ''payment_only''%' THEN
    RAISE EXCEPTION 'REMEDI_PRECHECK_ATTENDANCE_DEFINITION_MISMATCH';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.queue_entries
    WHERE visit_type::text NOT IN ('consultation', 'direct_sale', 'payment_only')
  ) THEN
    RAISE EXCEPTION 'REMEDI_PRECHECK_UNKNOWN_QUEUE_VISIT_TYPE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.insurance_providers AS provider
    WHERE (
      provider.id = '72656d65-6469-4000-8000-000000000001'::uuid
      AND (
        provider.name <> 'Legacy Remedi Corporate - Provider Unspecified'
        OR provider.status <> 'inactive'
      )
    ) OR (
      provider.name = 'Legacy Remedi Corporate - Provider Unspecified'
      AND provider.id <> '72656d65-6469-4000-8000-000000000001'::uuid
    )
  ) THEN
    RAISE EXCEPTION 'REMEDI_LEGACY_PROVIDER_CONFLICT';
  END IF;
END;
$preflight$;

INSERT INTO public.insurance_providers(id, name, status)
VALUES (
  '72656d65-6469-4000-8000-000000000001',
  'Legacy Remedi Corporate - Provider Unspecified',
  'inactive'
)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE private.remedi_import_batches (
  id uuid PRIMARY KEY,
  idempotency_key uuid NOT NULL UNIQUE,
  status text NOT NULL
    CHECK (status IN ('planned', 'validated', 'loading', 'loaded', 'failed', 'rolled_back')),
  source_manifest_sha256 text NOT NULL UNIQUE
    CHECK (source_manifest_sha256 ~ '^[0-9a-f]{64}$'),
  bundle_sha256 text
    CHECK (bundle_sha256 IS NULL OR bundle_sha256 ~ '^[0-9a-f]{64}$'),
  compiler_version text NOT NULL,
  patient_count integer NOT NULL CHECK (patient_count >= 0),
  encounter_count integer NOT NULL CHECK (encounter_count >= 0),
  canonical_invoice_count integer NOT NULL CHECK (canonical_invoice_count >= 0),
  source_gross_amount numeric(14,2) NOT NULL
    CHECK (source_gross_amount >= 0 AND round(source_gross_amount, 2) = source_gross_amount),
  source_patient_collection numeric(14,2) NOT NULL
    CHECK (source_patient_collection >= 0 AND round(source_patient_collection, 2) = source_patient_collection),
  source_corporate_amount numeric(14,2) NOT NULL
    CHECK (source_corporate_amount >= 0 AND round(source_corporate_amount, 2) = source_corporate_amount),
  counts_summary jsonb NOT NULL CHECK (jsonb_typeof(counts_summary) = 'object'),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CHECK (completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at)
);

CREATE TABLE private.remedi_source_files (
  id uuid PRIMARY KEY,
  batch_id uuid NOT NULL REFERENCES private.remedi_import_batches(id) ON DELETE RESTRICT,
  source_kind text NOT NULL CHECK (source_kind IN ('patients_csv', 'clinical_notes_csv', 'sales_pdf')),
  filename text NOT NULL CHECK (filename !~ '[/\\]'),
  byte_size bigint NOT NULL CHECK (byte_size >= 0),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  page_count integer CHECK (page_count IS NULL OR page_count >= 0),
  row_count integer CHECK (row_count IS NULL OR row_count >= 0),
  source_start_date date,
  source_end_date date,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  UNIQUE (batch_id, filename),
  UNIQUE (batch_id, sha256),
  CHECK (source_end_date IS NULL OR source_start_date IS NULL OR source_end_date >= source_start_date)
);

CREATE TABLE private.remedi_patient_map (
  id uuid PRIMARY KEY,
  batch_id uuid NOT NULL REFERENCES private.remedi_import_batches(id) ON DELETE RESTRICT,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  remedi_ui_id text NOT NULL,
  remedi_mrn text NOT NULL,
  id_number_sha256 text CHECK (id_number_sha256 IS NULL OR id_number_sha256 ~ '^[0-9a-f]{64}$'),
  source_row integer NOT NULL CHECK (source_row >= 2),
  source_key_hash text NOT NULL CHECK (source_key_hash ~ '^[0-9a-f]{64}$'),
  match_method text NOT NULL
    CHECK (match_method IN ('source_map', 'mrn', 'national_id', 'demographics', 'inserted')),
  match_status text NOT NULL CHECK (match_status IN ('matched', 'inserted', 'conflict')),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  UNIQUE (batch_id, remedi_ui_id),
  UNIQUE (batch_id, remedi_mrn),
  UNIQUE (batch_id, source_key_hash),
  UNIQUE (batch_id, patient_id)
);

CREATE TABLE private.remedi_encounter_map (
  id uuid PRIMARY KEY,
  batch_id uuid NOT NULL REFERENCES private.remedi_import_batches(id) ON DELETE RESTRICT,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  queue_entry_id uuid NOT NULL REFERENCES public.queue_entries(id) ON DELETE RESTRICT,
  consultation_id uuid NOT NULL REFERENCES public.consultations(id) ON DELETE RESTRICT,
  encounter_hash text NOT NULL CHECK (encounter_hash ~ '^[0-9a-f]{64}$'),
  source_key_hash text NOT NULL CHECK (source_key_hash ~ '^[0-9a-f]{64}$'),
  source_rows integer[] NOT NULL CHECK (cardinality(source_rows) > 0),
  source_attendance_at timestamptz NOT NULL,
  source_doctor_names text[] NOT NULL DEFAULT ARRAY[]::text[],
  reconciliation_status text NOT NULL
    CHECK (reconciliation_status IN ('historical_import', 'financial_paired', 'financial_quarantined')),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  UNIQUE (batch_id, encounter_hash),
  UNIQUE (batch_id, source_key_hash),
  UNIQUE (batch_id, queue_entry_id),
  UNIQUE (batch_id, consultation_id)
);

CREATE TABLE private.remedi_invoice_map (
  id uuid PRIMARY KEY,
  batch_id uuid NOT NULL REFERENCES private.remedi_import_batches(id) ON DELETE RESTRICT,
  idempotency_key uuid NOT NULL,
  bill_number text NOT NULL,
  patient_id uuid REFERENCES public.patients(id) ON DELETE RESTRICT,
  queue_entry_id uuid REFERENCES public.queue_entries(id) ON DELETE RESTRICT,
  consultation_id uuid REFERENCES public.consultations(id) ON DELETE RESTRICT,
  payment_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  panel_claim_id uuid REFERENCES public.panel_claims(id) ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED,
  source_pdf_sha256 text NOT NULL CHECK (source_pdf_sha256 ~ '^[0-9a-f]{64}$'),
  source_rows integer[] NOT NULL CHECK (cardinality(source_rows) > 0),
  page_row_references jsonb NOT NULL CHECK (jsonb_typeof(page_row_references) = 'array'),
  source_key_hash text NOT NULL CHECK (source_key_hash ~ '^[0-9a-f]{64}$'),
  source_created_at timestamptz NOT NULL,
  corporate_amount numeric(14,2) NOT NULL,
  cash_sales_amount numeric(14,2) NOT NULL,
  gross_amount numeric(14,2) NOT NULL,
  cash_amount numeric(14,2) NOT NULL,
  transfer_amount numeric(14,2) NOT NULL,
  card_amount numeric(14,2) NOT NULL,
  e_wallet_amount numeric(14,2) NOT NULL,
  patient_collection_amount numeric(14,2) NOT NULL,
  outstanding_amount numeric(14,2) NOT NULL,
  outstanding_payment numeric(14,2) NOT NULL,
  raw_labels jsonb NOT NULL CHECK (jsonb_typeof(raw_labels) = 'object'),
  payment_allocations jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(payment_allocations) = 'array'),
  reconciliation_status text NOT NULL
    CHECK (reconciliation_status IN (
      'importable', 'loaded', 'unresolved_identity', 'cardinality_mismatch',
      'billing_delay_out_of_window', 'invoice_total_imbalance',
      'mixed_panel_self_pay', 'zero_total_ledger_only'
    )),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  UNIQUE (batch_id, bill_number),
  UNIQUE (batch_id, idempotency_key),
  UNIQUE (batch_id, source_key_hash),
  CHECK (
    corporate_amount >= 0 AND cash_sales_amount >= 0 AND gross_amount >= 0
    AND cash_amount >= 0 AND transfer_amount >= 0 AND card_amount >= 0
    AND e_wallet_amount >= 0 AND patient_collection_amount >= 0
    AND outstanding_amount >= 0 AND outstanding_payment >= 0
  ),
  CHECK (
    round(corporate_amount, 2) = corporate_amount
    AND round(cash_sales_amount, 2) = cash_sales_amount
    AND round(gross_amount, 2) = gross_amount
    AND round(cash_amount, 2) = cash_amount
    AND round(transfer_amount, 2) = transfer_amount
    AND round(card_amount, 2) = card_amount
    AND round(e_wallet_amount, 2) = e_wallet_amount
    AND round(patient_collection_amount, 2) = patient_collection_amount
    AND round(outstanding_amount, 2) = outstanding_amount
    AND round(outstanding_payment, 2) = outstanding_payment
  )
);

CREATE TABLE private.remedi_import_conflicts (
  id uuid PRIMARY KEY,
  batch_id uuid NOT NULL REFERENCES private.remedi_import_batches(id) ON DELETE RESTRICT,
  conflict_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('warning', 'error', 'blocking')),
  status text NOT NULL CHECK (status IN ('open', 'resolved', 'accepted_private_only')),
  source_key_hash text NOT NULL CHECK (source_key_hash ~ '^[0-9a-f]{64}$'),
  details jsonb NOT NULL CHECK (jsonb_typeof(details) = 'object'),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  resolved_at timestamptz,
  UNIQUE (batch_id, source_key_hash),
  CHECK (resolved_at IS NULL OR status = 'resolved')
);

CREATE TABLE private.remedi_import_context (
  transaction_id bigint NOT NULL,
  batch_id uuid NOT NULL REFERENCES private.remedi_import_batches(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  PRIMARY KEY (transaction_id, batch_id)
);

CREATE INDEX remedi_source_files_batch_id_idx ON private.remedi_source_files(batch_id);
CREATE INDEX remedi_patient_map_patient_id_idx ON private.remedi_patient_map(patient_id);
CREATE INDEX remedi_encounter_map_patient_id_idx ON private.remedi_encounter_map(patient_id);
CREATE INDEX remedi_encounter_map_queue_id_idx ON private.remedi_encounter_map(queue_entry_id);
CREATE INDEX remedi_encounter_map_consultation_id_idx ON private.remedi_encounter_map(consultation_id);
CREATE INDEX remedi_invoice_map_patient_id_idx ON private.remedi_invoice_map(patient_id);
CREATE INDEX remedi_invoice_map_queue_id_idx ON private.remedi_invoice_map(queue_entry_id);
CREATE INDEX remedi_invoice_map_consultation_id_idx ON private.remedi_invoice_map(consultation_id);
CREATE INDEX remedi_invoice_map_panel_claim_id_idx ON private.remedi_invoice_map(panel_claim_id);
CREATE INDEX remedi_import_conflicts_batch_id_idx ON private.remedi_import_conflicts(batch_id);
CREATE INDEX remedi_import_context_actor_id_idx ON private.remedi_import_context(actor_id);

ALTER TABLE private.remedi_import_batches OWNER TO postgres;
ALTER TABLE private.remedi_source_files OWNER TO postgres;
ALTER TABLE private.remedi_patient_map OWNER TO postgres;
ALTER TABLE private.remedi_encounter_map OWNER TO postgres;
ALTER TABLE private.remedi_invoice_map OWNER TO postgres;
ALTER TABLE private.remedi_import_conflicts OWNER TO postgres;
ALTER TABLE private.remedi_import_context OWNER TO postgres;

ALTER TABLE private.remedi_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.remedi_import_batches FORCE ROW LEVEL SECURITY;
ALTER TABLE private.remedi_source_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.remedi_source_files FORCE ROW LEVEL SECURITY;
ALTER TABLE private.remedi_patient_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.remedi_patient_map FORCE ROW LEVEL SECURITY;
ALTER TABLE private.remedi_encounter_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.remedi_encounter_map FORCE ROW LEVEL SECURITY;
ALTER TABLE private.remedi_invoice_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.remedi_invoice_map FORCE ROW LEVEL SECURITY;
ALTER TABLE private.remedi_import_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.remedi_import_conflicts FORCE ROW LEVEL SECURITY;
ALTER TABLE private.remedi_import_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.remedi_import_context FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE private.remedi_import_batches FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE private.remedi_source_files FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE private.remedi_patient_map FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE private.remedi_encounter_map FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE private.remedi_invoice_map FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE private.remedi_import_conflicts FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE private.remedi_import_context FROM PUBLIC, anon, authenticated, service_role;

-- Preserve every current queue type and add the explicit historical boundary.
ALTER TABLE public.queue_entries DROP CONSTRAINT IF EXISTS queue_entries_visit_type_check;
ALTER TABLE public.queue_entries
  ADD CONSTRAINT queue_entries_visit_type_check
  CHECK (visit_type IN ('consultation', 'direct_sale', 'payment_only', 'historical_import'));

-- Historical rows have no queue number. Include them explicitly while continuing
-- to exclude payment-only rows. The existing called_at guard naturally leaves
-- historical waiting time NULL.
DO $attendance$
DECLARE
  v_definition text;
  v_original text;
  v_function regprocedure;
BEGIN
  FOREACH v_function IN ARRAY ARRAY[
    'public.get_clinical_attendance_heatmap(date,date,uuid)'::regprocedure,
    'public._get_insight_clinical_attendance_heatmap_round3(date,date,uuid)'::regprocedure
  ]
  LOOP
    SELECT pg_catalog.pg_get_functiondef(v_function) INTO v_definition;
    v_original := v_definition;
    v_definition := replace(
      v_definition,
      'WHERE qe.queue_number IS NOT NULL',
      'WHERE (qe.queue_number IS NOT NULL OR qe.visit_type::text = ''historical_import'')'
    );
    IF v_definition = v_original
       OR v_definition NOT LIKE '%queue_number IS NOT NULL OR qe.visit_type::text = ''historical_import''%'
       OR v_definition NOT LIKE '%qe.visit_type::text <> ''payment_only''%'
       OR v_definition NOT LIKE '%called_at >= qe.created_at%' THEN
      RAISE EXCEPTION 'REMEDI_PRECHECK_ATTENDANCE_PATCH_FAILED: %', v_function;
    END IF;
    EXECUTE v_definition;
  END LOOP;
END;
$attendance$;

CREATE INDEX remedi_historical_attendance_created_idx
  ON public.queue_entries(created_at, id)
  WHERE deleted_at IS NULL
    AND cancelled_at IS NULL
    AND visit_type::text = 'historical_import';

CREATE FUNCTION private.begin_remedi_import_context(
  _batch_id uuid,
  _actor_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $function$
BEGIN
  IF session_user <> 'postgres' THEN
    RAISE EXCEPTION 'REMEDI_OWNER_CONNECTION_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM private.remedi_import_batches AS batch
    WHERE batch.id = _batch_id AND batch.status = 'loading'
  ) THEN
    RAISE EXCEPTION 'REMEDI_BATCH_NOT_LOADING' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _actor_id) THEN
    RAISE EXCEPTION 'REMEDI_ACTOR_NOT_FOUND' USING ERRCODE = '23503';
  END IF;
  INSERT INTO private.remedi_import_context(transaction_id, batch_id, actor_id)
  VALUES (pg_catalog.txid_current(), _batch_id, _actor_id)
  ON CONFLICT (transaction_id, batch_id) DO UPDATE
    SET actor_id = EXCLUDED.actor_id, created_at = pg_catalog.now();
  PERFORM pg_catalog.set_config('private.remedi_import_batch_id', _batch_id::text, true);
  PERFORM pg_catalog.set_config('private.remedi_import_actor_id', _actor_id::text, true);
END;
$function$;
ALTER FUNCTION private.begin_remedi_import_context(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.begin_remedi_import_context(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- Add one tightly bounded owner-import branch before the existing trigger body.
-- The ordinary auth.uid()/statement_timestamp() branch remains verbatim.
DO $payment_trigger_patch$
DECLARE
  v_definition text;
  v_original text;
  v_needle text := E'BEGIN\n  -- Direct INSERT remains available only for the bounded cached-client window,\n  -- so authorship and event time must still be owned by the server. Overwrite\n  -- caller values instead of freezing forged provenance after the fact.\n  NEW.created_by := auth.uid();\n  NEW.created_at := pg_catalog.statement_timestamp();';
  v_replacement text := E'BEGIN\n  IF nullif(pg_catalog.current_setting(''private.remedi_import_batch_id'', true), '''') IS NOT NULL THEN\n    IF session_user <> ''postgres'' OR NOT EXISTS (\n      SELECT 1\n      FROM private.remedi_import_context AS context\n      JOIN private.remedi_import_batches AS batch ON batch.id = context.batch_id\n      JOIN public.profiles AS actor ON actor.id = context.actor_id\n      JOIN private.remedi_invoice_map AS invoice\n        ON invoice.batch_id = context.batch_id\n       AND invoice.queue_entry_id = NEW.queue_entry_id\n       AND invoice.consultation_id = NEW.consultation_id\n       AND invoice.patient_id = (SELECT queue.patient_id FROM public.queue_entries AS queue WHERE queue.id = NEW.queue_entry_id)\n       AND invoice.source_created_at = NEW.created_at\n       AND invoice.reconciliation_status = ''importable''\n      CROSS JOIN LATERAL jsonb_array_elements(invoice.payment_allocations) AS allocation(value)\n      WHERE context.transaction_id = pg_catalog.txid_current()\n        AND context.batch_id::text = pg_catalog.current_setting(''private.remedi_import_batch_id'', true)\n        AND context.actor_id::text = pg_catalog.current_setting(''private.remedi_import_actor_id'', true)\n        AND NEW.created_by = context.actor_id\n        AND (allocation.value->>''payment_id'')::uuid = NEW.id\n        AND allocation.value->>''payment_method'' = lower(btrim(NEW.payment_method))\n        AND round((allocation.value->>''amount'')::numeric, 2) = round(NEW.amount, 2)\n        AND lower(btrim(NEW.payment_method)) IN (''cash'', ''transfer'', ''card'', ''qr_pay'')\n        AND NEW.payment_type = ''self_pay''\n    ) THEN\n      RAISE EXCEPTION ''REMEDI_IMPORT_CONTEXT_INVALID'' USING ERRCODE = ''42501'';\n    END IF;\n    RETURN NEW;\n  END IF;\n\n  -- Direct INSERT remains available only for the bounded cached-client window,\n  -- so authorship and event time must still be owned by the server. Overwrite\n  -- caller values instead of freezing forged provenance after the fact.\n  NEW.created_by := auth.uid();\n  NEW.created_at := pg_catalog.statement_timestamp();';
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'private.validate_payment_insert()'::regprocedure
  ) INTO v_definition;
  v_original := v_definition;
  v_definition := replace(v_definition, v_needle, v_replacement);
  IF v_definition = v_original
     OR v_definition NOT LIKE '%REMEDI_IMPORT_CONTEXT_INVALID%'
     OR v_definition NOT LIKE '%NEW.created_by := auth.uid();%'
     OR v_definition NOT LIKE '%NEW.created_at := pg_catalog.statement_timestamp();%'
     OR v_definition NOT LIKE '%STALE_PATIENT_OUTSTANDING%' THEN
    RAISE EXCEPTION 'REMEDI_PRECHECK_PAYMENT_TRIGGER_PATCH_FAILED';
  END IF;
  EXECUTE v_definition;
END;
$payment_trigger_patch$;
ALTER FUNCTION private.validate_payment_insert() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.validate_payment_insert()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.import_remedi_payment(
  _batch_id uuid,
  _bill_number text,
  _payment_id uuid,
  _queue_entry_id uuid,
  _consultation_id uuid,
  _actor_id uuid,
  _amount numeric,
  _payment_method text,
  _source_created_at timestamptz
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $function$
DECLARE
  v_allowed_methods constant text[] := ARRAY['cash', 'transfer', 'card', 'qr_pay'];
  v_inserted_id uuid;
BEGIN
  IF session_user <> 'postgres' THEN
    RAISE EXCEPTION 'REMEDI_OWNER_CONNECTION_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF NOT (lower(btrim(coalesce(_payment_method, ''))) = ANY(v_allowed_methods)) THEN
    RAISE EXCEPTION 'REMEDI_PAYMENT_METHOD_INVALID' USING ERRCODE = '22023';
  END IF;
  IF _amount IS NULL OR _amount <= 0 OR round(_amount, 2) <> _amount THEN
    RAISE EXCEPTION 'REMEDI_PAYMENT_AMOUNT_INVALID' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM private.remedi_import_context AS context
    JOIN private.remedi_import_batches AS batch ON batch.id = context.batch_id
    JOIN public.profiles AS actor ON actor.id = context.actor_id
    JOIN private.remedi_invoice_map AS invoice
      ON invoice.batch_id = context.batch_id
     AND invoice.bill_number = _bill_number
    CROSS JOIN LATERAL jsonb_array_elements(invoice.payment_allocations) AS allocation(value)
    WHERE context.transaction_id = pg_catalog.txid_current()
      AND context.batch_id = _batch_id
      AND context.actor_id = _actor_id
      AND batch.status = 'loading'
      AND invoice.reconciliation_status = 'importable'
      AND invoice.queue_entry_id = _queue_entry_id
      AND invoice.consultation_id = _consultation_id
      AND invoice.source_created_at = _source_created_at
      AND invoice.gross_amount = invoice.corporate_amount + invoice.cash_sales_amount
      AND invoice.cash_sales_amount = invoice.patient_collection_amount
      AND invoice.patient_collection_amount =
        invoice.cash_amount + invoice.transfer_amount + invoice.card_amount + invoice.e_wallet_amount
      AND invoice.outstanding_amount = 0
      AND invoice.outstanding_payment = 0
      AND (
        SELECT coalesce(sum(round((expected.value->>'amount')::numeric, 2)), 0)
        FROM jsonb_array_elements(invoice.payment_allocations) AS expected(value)
      ) = invoice.patient_collection_amount
      AND (allocation.value->>'payment_id')::uuid = _payment_id
      AND allocation.value->>'payment_method' = lower(btrim(_payment_method))
      AND round((allocation.value->>'amount')::numeric, 2) = round(_amount, 2)
  ) THEN
    RAISE EXCEPTION 'REMEDI_PAYMENT_LEDGER_MISMATCH' USING ERRCODE = '23503';
  END IF;

  SELECT payment.id INTO v_inserted_id
  FROM public.payments AS payment
  WHERE payment.id = _payment_id
    AND payment.queue_entry_id = _queue_entry_id
    AND payment.consultation_id = _consultation_id
    AND payment.created_by = _actor_id
    AND payment.created_at = _source_created_at
    AND payment.payment_type = 'self_pay'
    AND lower(btrim(payment.payment_method)) = lower(btrim(_payment_method))
    AND payment.amount = _amount
    AND payment.deleted_at IS NULL;
  IF FOUND THEN
    RETURN v_inserted_id;
  ELSIF EXISTS (SELECT 1 FROM public.payments WHERE id = _payment_id) THEN
    RAISE EXCEPTION 'REMEDI_PAYMENT_IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.payments(
    id, queue_entry_id, consultation_id, created_by, created_at,
    payment_type, payment_method, amount, notes
  ) VALUES (
    _payment_id, _queue_entry_id, _consultation_id, _actor_id, _source_created_at,
    'self_pay', lower(btrim(_payment_method)), _amount,
    'Historical Remedi import'
  )
  RETURNING id INTO v_inserted_id;
  RETURN v_inserted_id;
END;
$function$;
ALTER FUNCTION private.import_remedi_payment(
  uuid, text, uuid, uuid, uuid, uuid, numeric, text, timestamptz
) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.import_remedi_payment(
  uuid, text, uuid, uuid, uuid, uuid, numeric, text, timestamptz
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.import_remedi_panel_claim(
  _batch_id uuid,
  _bill_number text,
  _claim_id uuid,
  _queue_entry_id uuid,
  _patient_id uuid,
  _provider_id uuid,
  _amount numeric,
  _source_created_at timestamptz
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $function$
DECLARE
  v_inserted_id uuid;
BEGIN
  IF session_user <> 'postgres' THEN
    RAISE EXCEPTION 'REMEDI_OWNER_CONNECTION_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF _amount IS NULL OR _amount <= 0 OR round(_amount, 2) <> _amount THEN
    RAISE EXCEPTION 'REMEDI_PANEL_AMOUNT_INVALID' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM private.remedi_import_context AS context
    JOIN private.remedi_import_batches AS batch ON batch.id = context.batch_id
    JOIN private.remedi_invoice_map AS invoice
      ON invoice.batch_id = context.batch_id
     AND invoice.bill_number = _bill_number
    JOIN public.queue_entries AS queue ON queue.id = invoice.queue_entry_id
    JOIN public.insurance_providers AS provider ON provider.id = _provider_id
    WHERE context.transaction_id = pg_catalog.txid_current()
      AND context.batch_id = _batch_id
      AND context.batch_id::text = pg_catalog.current_setting('private.remedi_import_batch_id', true)
      AND batch.status = 'loading'
      AND invoice.reconciliation_status = 'importable'
      AND invoice.panel_claim_id = _claim_id
      AND invoice.queue_entry_id = _queue_entry_id
      AND invoice.patient_id = _patient_id
      AND queue.patient_id = _patient_id
      AND invoice.source_created_at = _source_created_at
      AND invoice.corporate_amount = _amount
      AND invoice.corporate_amount > 0
      AND invoice.cash_sales_amount = 0
      AND invoice.patient_collection_amount = 0
      AND invoice.gross_amount = invoice.corporate_amount
      AND invoice.outstanding_amount = 0
      AND invoice.outstanding_payment = 0
      AND provider.name = 'Legacy Remedi Corporate - Provider Unspecified'
      AND provider.status = 'inactive'
  ) THEN
    RAISE EXCEPTION 'REMEDI_PANEL_LEDGER_MISMATCH' USING ERRCODE = '23503';
  END IF;

  SELECT claim.id INTO v_inserted_id
  FROM public.panel_claims AS claim
  WHERE claim.id = _claim_id
    AND claim.queue_entry_id = _queue_entry_id
    AND claim.patient_id = _patient_id
    AND claim.panel_id = _provider_id
    AND claim.amount = _amount
    AND claim.created_at = _source_created_at;
  IF FOUND THEN
    RETURN v_inserted_id;
  ELSIF EXISTS (SELECT 1 FROM public.panel_claims WHERE id = _claim_id) THEN
    RAISE EXCEPTION 'REMEDI_PANEL_IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.panel_claims(
    id, claim_no, queue_entry_id, patient_id, panel_id,
    amount, claim_date, status, created_at, remarks
  ) VALUES (
    _claim_id,
    'REM-' || replace(_claim_id::text, '-', ''),
    _queue_entry_id,
    _patient_id,
    _provider_id,
    _amount,
    (_source_created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date,
    'pending',
    _source_created_at,
    'Historical Remedi corporate receivable; provider unspecified in source'
  )
  RETURNING id INTO v_inserted_id;
  RETURN v_inserted_id;
END;
$function$;
ALTER FUNCTION private.import_remedi_panel_claim(
  uuid, text, uuid, uuid, uuid, uuid, numeric, timestamptz
) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.import_remedi_panel_claim(
  uuid, text, uuid, uuid, uuid, uuid, numeric, timestamptz
) FROM PUBLIC, anon, authenticated, service_role;

-- Retain the reviewed privilege surface after dynamically replacing functions.
ALTER FUNCTION public.get_clinical_attendance_heatmap(date, date, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_clinical_attendance_heatmap(date, date, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_clinical_attendance_heatmap(date, date, uuid)
  TO authenticated;
ALTER FUNCTION public._get_insight_clinical_attendance_heatmap_round3(date, date, uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public._get_insight_clinical_attendance_heatmap_round3(date, date, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
