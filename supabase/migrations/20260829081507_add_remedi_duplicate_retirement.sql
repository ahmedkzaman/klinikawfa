-- Private, forward-only support for retiring Remedi historical encounters that
-- duplicate live, natively-entered Verdamed visits (dual-running window Jun–Aug 2026).
-- This migration contains no patient, encounter, invoice, or other PHI rows.

--------------------------------------------------------------------------------
-- Preflight: fail before any DDL if the reviewed boundaries are not in place.
--------------------------------------------------------------------------------
DO $preflight$
DECLARE
  v_payment_trigger_function text;
  v_provenance_function text;
BEGIN
  -- Payment insert guard must still be the reviewed definition.
  SELECT pg_catalog.pg_get_functiondef(
    'private.validate_payment_insert()'::regprocedure
  ) INTO v_payment_trigger_function;
  IF v_payment_trigger_function IS NULL
     OR v_payment_trigger_function NOT LIKE '%NEW.created_by := auth.uid();%'
     OR v_payment_trigger_function NOT LIKE '%PAYMENT_ACTOR_REQUIRED%'
     OR v_payment_trigger_function NOT LIKE '%STALE_PATIENT_OUTSTANDING%' THEN
    RAISE EXCEPTION 'REMEDI_RETIRE_PRECHECK_PAYMENT_TRIGGER_DEFINITION_MISMATCH';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger
    WHERE trigger.tgrelid = 'public.payments'::regclass
      AND trigger.tgname = 'validate_payment_insert'
      AND NOT trigger.tgisinternal
      AND trigger.tgfoid = 'private.validate_payment_insert()'::regprocedure
  ) THEN
    RAISE EXCEPTION 'REMEDI_RETIRE_PRECHECK_PAYMENT_TRIGGER_MISSING';
  END IF;

  -- Payment provenance guard must still forbid re-pointing payments.
  SELECT pg_catalog.pg_get_functiondef(
    'private.prevent_payment_provenance_change()'::regprocedure
  ) INTO v_provenance_function;
  IF v_provenance_function IS NULL
     OR v_provenance_function NOT LIKE '%PAYMENT_PROVENANCE_IMMUTABLE%' THEN
    RAISE EXCEPTION 'REMEDI_RETIRE_PRECHECK_PAYMENT_PROVENANCE_MISMATCH';
  END IF;

  -- Encounter/invoice maps must carry the reviewed reconciliation statuses.
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'private.remedi_encounter_map'::regclass
      AND pg_catalog.pg_get_constraintdef(oid) LIKE '%historical_import%'
  ) THEN
    RAISE EXCEPTION 'REMEDI_RETIRE_PRECHECK_ENCOUNTER_MAP_CONSTRAINT_MISSING';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'private.remedi_invoice_map'::regclass
      AND pg_catalog.pg_get_constraintdef(oid) LIKE '%loaded%'
  ) THEN
    RAISE EXCEPTION 'REMEDI_RETIRE_PRECHECK_INVOICE_MAP_CONSTRAINT_MISSING';
  END IF;
END
$preflight$;

--------------------------------------------------------------------------------
-- Retirement batches ledger (counts-only summaries; never PHI).
--------------------------------------------------------------------------------
CREATE TABLE private.remedi_retirement_batches (
  id uuid PRIMARY KEY,
  base_batch_id uuid NOT NULL REFERENCES private.remedi_import_batches(id) ON DELETE RESTRICT,
  status text NOT NULL
    CHECK (status IN ('planned', 'rehearsed', 'applied', 'rolled_back')),
  retirement_list_sha256 text
    CHECK (retirement_list_sha256 IS NULL OR retirement_list_sha256 ~ '^[0-9a-f]{64}$'),
  planned_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  rehearsed_at timestamptz,
  applied_at timestamptz,
  counts_summary jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(counts_summary) = 'object'),
  CHECK (applied_at IS NULL OR status = 'applied'),
  CHECK (rehearsed_at IS NULL OR status IN ('rehearsed', 'applied', 'rolled_back'))
);

--------------------------------------------------------------------------------
-- Full row images of every public row deleted by a retirement (restore source).
--------------------------------------------------------------------------------
CREATE TABLE private.remedi_retired_rows (
  id bigserial PRIMARY KEY,
  retirement_batch_id uuid NOT NULL
    REFERENCES private.remedi_retirement_batches(id) ON DELETE RESTRICT,
  schema_name text NOT NULL,
  table_name text NOT NULL,
  primary_key jsonb NOT NULL CHECK (jsonb_typeof(primary_key) = 'object'),
  row_image jsonb NOT NULL CHECK (jsonb_typeof(row_image) = 'object'),
  captured_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  UNIQUE (retirement_batch_id, schema_name, table_name, primary_key)
);

ALTER TABLE private.remedi_retirement_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.remedi_retirement_batches FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.remedi_retirement_batches
  FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE private.remedi_retired_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.remedi_retired_rows FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.remedi_retired_rows
  FROM PUBLIC, anon, authenticated, service_role;

--------------------------------------------------------------------------------
-- Extend the map statuses so retired rows stay ledger-visible forever.
--------------------------------------------------------------------------------
ALTER TABLE private.remedi_encounter_map
  DROP CONSTRAINT remedi_encounter_map_reconciliation_status_check,
  ADD CONSTRAINT remedi_encounter_map_reconciliation_status_check
    CHECK (reconciliation_status IN (
      'historical_import', 'financial_paired', 'financial_quarantined',
      'retired_duplicate_of_live'
    ));

ALTER TABLE private.remedi_invoice_map
  DROP CONSTRAINT remedi_invoice_map_reconciliation_status_check,
  ADD CONSTRAINT remedi_invoice_map_reconciliation_status_check
    CHECK (reconciliation_status IN (
      'importable', 'loaded', 'unresolved_identity', 'cardinality_mismatch',
      'billing_delay_out_of_window', 'invoice_total_imbalance',
      'mixed_panel_self_pay', 'zero_total_ledger_only',
      'retired_duplicate_of_live'
    ));

--------------------------------------------------------------------------------
-- Row-image capture + FK-safe delete helpers (SECURITY DEFINER, owner-only).
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.remedi_retire_capture_row(
  _retirement_batch_id uuid,
  _schema_name text,
  _table_name text,
  _row anyelement
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_pk jsonb;
BEGIN
  v_pk := jsonb_build_object('id', (_row).id);
  INSERT INTO private.remedi_retired_rows
    (retirement_batch_id, schema_name, table_name, primary_key, row_image)
  VALUES
    (_retirement_batch_id, _schema_name, _table_name, v_pk, to_jsonb(_row))
  ON CONFLICT (retirement_batch_id, schema_name, table_name, primary_key)
  DO NOTHING;
END
$function$;

REVOKE ALL ON FUNCTION private.remedi_retire_capture_row(uuid, text, text, anyelement) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.remedi_retire_capture_row(uuid, text, text, anyelement) FROM anon, authenticated, service_role;

--------------------------------------------------------------------------------
-- The retirement function: retire ONE mapped duplicate encounter.
-- _financial_subcase ∈ {'A_clinical_only','D_with_payments','E_with_claim'}
--   A: imported side has no money — delete clinical rows only.
--   D: imported side has payments — delete payments after clinical rows.
--   E: imported side has a panel claim — delete claim after clinical rows.
-- Money safety is asserted by the caller (bundle) before invoking.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.retire_remedi_duplicate(
  _retirement_batch_id uuid,
  _encounter_hash text,
  _financial_subcase text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_batch uuid;
  v_map private.remedi_encounter_map%ROWTYPE;
  v_invoice private.remedi_invoice_map%ROWTYPE;
  v_payment_ids uuid[];
  v_claim_id uuid;
  v_deleted integer := 0;
  v_row record;
BEGIN
  -- 1) Retirement batch must exist and be planned/rehearsed.
  SELECT base_batch_id INTO v_batch
  FROM private.remedi_retirement_batches
  WHERE id = _retirement_batch_id
    AND status IN ('planned', 'rehearsed')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REMEDI_RETIRE_BATCH_NOT_ELIGIBLE';
  END IF;

  -- 2) Encounter map row must exist for this batch + hash.
  SELECT * INTO v_map
  FROM private.remedi_encounter_map
  WHERE batch_id = v_batch
    AND encounter_hash = _encounter_hash
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REMEDI_RETIRE_ENCOUNTER_NOT_MAPPED';
  END IF;
  IF v_map.reconciliation_status = 'retired_duplicate_of_live' THEN
    RETURN 0; -- idempotent no-op
  END IF;

  -- 3) Verify subcase against actual money on the imported side.
  SELECT array_agg(p.id) INTO v_payment_ids
  FROM public.payments p
  WHERE p.queue_entry_id = v_map.queue_entry_id;
  SELECT pc.id INTO v_claim_id
  FROM public.panel_claims pc
  WHERE pc.queue_entry_id = v_map.queue_entry_id
  LIMIT 1;

  IF _financial_subcase = 'A_clinical_only'
     AND (v_payment_ids IS NOT NULL OR v_claim_id IS NOT NULL) THEN
    RAISE EXCEPTION 'REMEDI_RETIRE_SUBCASE_MISMATCH: money present on imported side';
  END IF;
  IF _financial_subcase = 'D_with_payments' AND v_payment_ids IS NULL THEN
    RAISE EXCEPTION 'REMEDI_RETIRE_SUBCASE_MISMATCH: no payments present';
  END IF;
  IF _financial_subcase = 'E_with_claim' AND v_claim_id IS NULL THEN
    RAISE EXCEPTION 'REMEDI_RETIRE_SUBCASE_MISMATCH: no panel claim present';
  END IF;

  -- 4) Invoice map row (may not exist for zero-total invoices).
  SELECT * INTO v_invoice
  FROM private.remedi_invoice_map
  WHERE batch_id = v_batch
    AND queue_entry_id = v_map.queue_entry_id
  FOR UPDATE;

  -- 5) Capture full row images BEFORE any delete (FK-safe order: children first).
  FOR v_row IN
    SELECT * FROM public.consultation_items ci
    WHERE ci.consultation_id = v_map.consultation_id
  LOOP
    PERFORM private.remedi_retire_capture_row(_retirement_batch_id, 'public', 'consultation_items', v_row);
  END LOOP;
  FOR v_row IN
    SELECT * FROM public.vital_signs vs
    WHERE vs.queue_entry_id = v_map.queue_entry_id
  LOOP
    PERFORM private.remedi_retire_capture_row(_retirement_batch_id, 'public', 'vital_signs', v_row);
  END LOOP;
  FOR v_row IN
    SELECT * FROM public.payments p
    WHERE p.queue_entry_id = v_map.queue_entry_id
  LOOP
    PERFORM private.remedi_retire_capture_row(_retirement_batch_id, 'public', 'payments', v_row);
  END LOOP;
  IF v_claim_id IS NOT NULL THEN
    FOR v_row IN
      SELECT * FROM public.panel_claims pc WHERE pc.id = v_claim_id
    LOOP
      PERFORM private.remedi_retire_capture_row(_retirement_batch_id, 'public', 'panel_claims', v_row);
    END LOOP;
  END IF;
  FOR v_row IN
    SELECT * FROM public.consultations c WHERE c.id = v_map.consultation_id
  LOOP
    PERFORM private.remedi_retire_capture_row(_retirement_batch_id, 'public', 'consultations', v_row);
  END LOOP;
  FOR v_row IN
    SELECT * FROM public.queue_entries q WHERE q.id = v_map.queue_entry_id
  LOOP
    PERFORM private.remedi_retire_capture_row(_retirement_batch_id, 'public', 'queue_entries', v_row);
  END LOOP;

  -- 6) Delete in FK-safe order. v_map.queue_entry_id is ONLY the imported row
  --    (guaranteed by the UNIQUE map constraint) — live rows are unreachable.
  DELETE FROM public.panel_claims pc WHERE pc.id = v_claim_id;
  IF v_payment_ids IS NOT NULL THEN
    DELETE FROM public.payments p WHERE p.id = ANY(v_payment_ids);
  END IF;
  DELETE FROM public.consultation_items ci WHERE ci.consultation_id = v_map.consultation_id;
  DELETE FROM public.vital_signs vs WHERE vs.queue_entry_id = v_map.queue_entry_id;
  DELETE FROM public.consultations c WHERE c.id = v_map.consultation_id;
  DELETE FROM public.queue_entries q WHERE q.id = v_map.queue_entry_id;
  v_deleted := 1;

  -- 7) Update the maps.
  UPDATE private.remedi_encounter_map
  SET reconciliation_status = 'retired_duplicate_of_live'
  WHERE batch_id = v_batch AND encounter_hash = _encounter_hash;

  IF v_invoice.id IS NOT NULL THEN
    UPDATE private.remedi_invoice_map
    SET reconciliation_status = 'retired_duplicate_of_live'
    WHERE id = v_invoice.id;
  END IF;

  -- 8) Record the conflict resolution (upsert: UNIQUE (batch_id, source_key_hash)).
  INSERT INTO private.remedi_import_conflicts
    (batch_id, conflict_type, severity, status, source_key_hash, details, resolved_at)
  VALUES
    (v_batch, 'duplicate_of_live_visit', 'warning', 'resolved',
     v_map.source_key_hash,
     jsonb_build_object(
       'retirement_batch_id', _retirement_batch_id,
       'financial_subcase', _financial_subcase,
       'encounter_hash', _encounter_hash
     ),
     pg_catalog.now())
  ON CONFLICT (batch_id, source_key_hash) DO UPDATE
  SET conflict_type = EXCLUDED.conflict_type,
      severity = EXCLUDED.severity,
      status = 'resolved',
      details = EXCLUDED.details,
      resolved_at = EXCLUDED.resolved_at;

  RETURN v_deleted;
END
$function$;

REVOKE ALL ON FUNCTION private.retire_remedi_duplicate(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.retire_remedi_duplicate(uuid, text, text) FROM anon, authenticated, service_role;

--------------------------------------------------------------------------------
-- Restore: reinsert captured rows in reverse FK order (rollback drill / restore).
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.restore_remedi_retirement(
  _retirement_batch_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_status text;
  v_restored integer := 0;
  r record;
BEGIN
  IF session_user <> 'postgres' THEN
    RAISE EXCEPTION 'REMEDI_RESTORE_OWNER_CONNECTION_REQUIRED' USING ERRCODE = '42501';
  END IF;
  SELECT status INTO v_status
  FROM private.remedi_retirement_batches
  WHERE id = _retirement_batch_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REMEDI_RESTORE_BATCH_NOT_FOUND';
  END IF;
  IF v_status NOT IN ('applied', 'rolled_back') THEN
    RAISE EXCEPTION 'REMEDI_RESTORE_BATCH_NOT_ELIGIBLE: status=%', v_status;
  END IF;

  -- Reverse FK order: queue_entries → consultations → vital_signs →
  -- consultation_items → payments → panel_claims.
  FOR r IN
    SELECT row_image FROM private.remedi_retired_rows
    WHERE retirement_batch_id = _retirement_batch_id
      AND schema_name = 'public' AND table_name = 'queue_entries'
  LOOP
    INSERT INTO public.queue_entries SELECT * FROM jsonb_populate_record(null::public.queue_entries, r.row_image)
    ON CONFLICT (id) DO NOTHING;
    v_restored := v_restored + 1;
  END LOOP;

  FOR r IN
    SELECT row_image FROM private.remedi_retired_rows
    WHERE retirement_batch_id = _retirement_batch_id
      AND schema_name = 'public' AND table_name = 'consultations'
  LOOP
    INSERT INTO public.consultations SELECT * FROM jsonb_populate_record(null::public.consultations, r.row_image)
    ON CONFLICT (id) DO NOTHING;
    v_restored := v_restored + 1;
  END LOOP;

  FOR r IN
    SELECT row_image FROM private.remedi_retired_rows
    WHERE retirement_batch_id = _retirement_batch_id
      AND schema_name = 'public' AND table_name = 'vital_signs'
  LOOP
    INSERT INTO public.vital_signs SELECT * FROM jsonb_populate_record(null::public.vital_signs, r.row_image)
    ON CONFLICT (id) DO NOTHING;
    v_restored := v_restored + 1;
  END LOOP;

  FOR r IN
    SELECT row_image FROM private.remedi_retired_rows
    WHERE retirement_batch_id = _retirement_batch_id
      AND schema_name = 'public' AND table_name = 'consultation_items'
  LOOP
    INSERT INTO public.consultation_items SELECT * FROM jsonb_populate_record(null::public.consultation_items, r.row_image)
    ON CONFLICT (id) DO NOTHING;
    v_restored := v_restored + 1;
  END LOOP;

  FOR r IN
    SELECT row_image FROM private.remedi_retired_rows
    WHERE retirement_batch_id = _retirement_batch_id
      AND schema_name = 'public' AND table_name = 'payments'
  LOOP
    -- Bypass the auth.uid()/outstanding guards: we are re-inserting a captured
    -- row image verbatim. The restore-mode GUC is scoped to this transaction.
    PERFORM pg_catalog.set_config('private.remedi_retirement_restore_mode', '1', true);
    INSERT INTO public.payments SELECT * FROM jsonb_populate_record(null::public.payments, r.row_image)
    ON CONFLICT (id) DO NOTHING;
    v_restored := v_restored + 1;
  END LOOP;
  PERFORM pg_catalog.set_config('private.remedi_retirement_restore_mode', '', true);

  FOR r IN
    SELECT row_image FROM private.remedi_retired_rows
    WHERE retirement_batch_id = _retirement_batch_id
      AND schema_name = 'public' AND table_name = 'panel_claims'
  LOOP
    INSERT INTO public.panel_claims SELECT * FROM jsonb_populate_record(null::public.panel_claims, r.row_image)
    ON CONFLICT (id) DO NOTHING;
    v_restored := v_restored + 1;
  END LOOP;

  RETURN v_restored;
END
$function$;

REVOKE ALL ON FUNCTION private.restore_remedi_retirement(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.restore_remedi_retirement(uuid) FROM anon, authenticated, service_role;

--------------------------------------------------------------------------------
-- Extend validate_payment_insert with a retirement-restore branch so captured
-- payment row images can be re-inserted without the auth.uid()/outstanding
-- guards firing (the original values are preserved verbatim from the backup).
-- The branch is gated on a session GUC set only by the restore function and
-- only when session_user = 'postgres'.
--------------------------------------------------------------------------------
DO $restore_trigger_patch$
DECLARE
  v_definition text;
  v_original text;
  v_needle text := E'BEGIN\n  IF nullif(pg_catalog.current_setting(''private.remedi_import_batch_id'', true), '''') IS NOT NULL THEN';
  v_replacement text := E'BEGIN\n  IF nullif(pg_catalog.current_setting(''private.remedi_retirement_restore_mode'', true), '''') IS NOT NULL THEN\n    IF session_user <> ''postgres'' THEN\n      RAISE EXCEPTION ''REMEDI_RESTORE_OWNER_CONNECTION_REQUIRED'' USING ERRCODE = ''42501'';\n    END IF;\n    RETURN NEW;\n  END IF;\n  IF nullif(pg_catalog.current_setting(''private.remedi_import_batch_id'', true), '''') IS NOT NULL THEN';
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'private.validate_payment_insert()'::regprocedure
  ) INTO v_definition;
  v_original := v_definition;
  v_definition := replace(v_definition, v_needle, v_replacement);
  IF v_definition = v_original
     OR v_definition NOT LIKE '%REMEDI_RESTORE_OWNER_CONNECTION_REQUIRED%'
     OR v_definition NOT LIKE '%REMEDI_IMPORT_CONTEXT_INVALID%'
     OR v_definition NOT LIKE '%NEW.created_by := auth.uid();%'
     OR v_definition NOT LIKE '%STALE_PATIENT_OUTSTANDING%' THEN
    RAISE EXCEPTION 'REMEDI_RETIRE_RESTORE_TRIGGER_PATCH_FAILED';
  END IF;
  EXECUTE v_definition;
END;
$restore_trigger_patch$;
ALTER FUNCTION private.validate_payment_insert() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.validate_payment_insert()
  FROM PUBLIC, anon, authenticated, service_role;
