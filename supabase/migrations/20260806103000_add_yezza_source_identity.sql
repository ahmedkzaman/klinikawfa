-- Preserve Yezza source identities and each import's audit trail without
-- modifying any existing patient, visit, or transaction records.

CREATE TABLE IF NOT EXISTS public.import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system text NOT NULL CHECK (btrim(source_system) <> ''),
  source_batch_id text NOT NULL CHECK (btrim(source_batch_id) <> ''),
  status text NOT NULL CHECK (btrim(status) <> ''),
  source_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  imported_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  CHECK (completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at),
  UNIQUE (source_system, source_batch_id)
);

CREATE TABLE IF NOT EXISTS public.patient_external_ids (
  source_system text NOT NULL CHECK (btrim(source_system) <> ''),
  source_patient_id text NOT NULL CHECK (btrim(source_patient_id) <> ''),
  patient_id uuid NOT NULL REFERENCES public.patients(id),
  import_batch_id uuid NOT NULL REFERENCES public.import_batches(id),
  PRIMARY KEY (source_system, source_patient_id)
);

CREATE TABLE IF NOT EXISTS public.visit_external_ids (
  source_system text NOT NULL CHECK (btrim(source_system) <> ''),
  source_visit_id text NOT NULL CHECK (btrim(source_visit_id) <> ''),
  queue_entry_id uuid NOT NULL REFERENCES public.queue_entries(id),
  import_batch_id uuid NOT NULL REFERENCES public.import_batches(id),
  PRIMARY KEY (source_system, source_visit_id)
);

CREATE TABLE IF NOT EXISTS public.transaction_external_ids (
  source_system text NOT NULL CHECK (btrim(source_system) <> ''),
  source_bill_id text NOT NULL CHECK (btrim(source_bill_id) <> ''),
  queue_entry_id uuid NOT NULL REFERENCES public.queue_entries(id),
  amount numeric NOT NULL,
  paid_amount numeric NOT NULL,
  import_batch_id uuid NOT NULL REFERENCES public.import_batches(id),
  PRIMARY KEY (source_system, source_bill_id)
);

CREATE INDEX IF NOT EXISTS import_batches_source_status_started_at_idx
  ON public.import_batches (source_system, status, started_at DESC);
CREATE INDEX IF NOT EXISTS patient_external_ids_patient_id_idx
  ON public.patient_external_ids (patient_id);
CREATE INDEX IF NOT EXISTS patient_external_ids_import_batch_id_idx
  ON public.patient_external_ids (import_batch_id);
CREATE INDEX IF NOT EXISTS visit_external_ids_queue_entry_id_idx
  ON public.visit_external_ids (queue_entry_id);
CREATE INDEX IF NOT EXISTS visit_external_ids_import_batch_id_idx
  ON public.visit_external_ids (import_batch_id);
CREATE INDEX IF NOT EXISTS transaction_external_ids_queue_entry_id_idx
  ON public.transaction_external_ids (queue_entry_id);
CREATE INDEX IF NOT EXISTS transaction_external_ids_import_batch_id_idx
  ON public.transaction_external_ids (import_batch_id);

ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_external_ids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visit_external_ids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_external_ids ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.import_batches FROM anon;
REVOKE ALL ON TABLE public.patient_external_ids FROM anon;
REVOKE ALL ON TABLE public.visit_external_ids FROM anon;
REVOKE ALL ON TABLE public.transaction_external_ids FROM anon;

GRANT SELECT, INSERT, UPDATE ON TABLE public.import_batches TO authenticated;
GRANT SELECT, INSERT ON TABLE public.patient_external_ids TO authenticated;
GRANT SELECT, INSERT ON TABLE public.visit_external_ids TO authenticated;
GRANT SELECT, INSERT ON TABLE public.transaction_external_ids TO authenticated;
REVOKE DELETE ON TABLE public.import_batches FROM authenticated;
REVOKE UPDATE, DELETE ON TABLE public.patient_external_ids FROM authenticated;
REVOKE UPDATE, DELETE ON TABLE public.visit_external_ids FROM authenticated;
REVOKE UPDATE, DELETE ON TABLE public.transaction_external_ids FROM authenticated;

CREATE OR REPLACE FUNCTION public.can_manage_imports(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'doctor_admin')
  )
$$;

REVOKE ALL ON FUNCTION public.can_manage_imports(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_imports(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.prevent_import_batch_identity_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.source_system IS DISTINCT FROM OLD.source_system
     OR NEW.source_batch_id IS DISTINCT FROM OLD.source_batch_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'IMPORT_BATCH_IDENTITY_IMMUTABLE' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_import_mapping_batch_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_source_system text;
BEGIN
  SELECT b.source_system
  INTO v_batch_source_system
  FROM public.import_batches AS b
  WHERE b.id = NEW.import_batch_id;

  -- Let the foreign key report a missing batch; this trigger owns only the
  -- cross-source invariant for batches that exist.
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF v_batch_source_system IS DISTINCT FROM NEW.source_system THEN
    RAISE EXCEPTION 'IMPORT_BATCH_SOURCE_SYSTEM_MISMATCH' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_import_batch_identity_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_import_mapping_batch_source() FROM PUBLIC;

DROP TRIGGER IF EXISTS prevent_import_batch_identity_mutation ON public.import_batches;
CREATE TRIGGER prevent_import_batch_identity_mutation
  BEFORE UPDATE ON public.import_batches
  FOR EACH ROW EXECUTE FUNCTION public.prevent_import_batch_identity_mutation();

DROP TRIGGER IF EXISTS validate_patient_external_id_batch_source ON public.patient_external_ids;
CREATE TRIGGER validate_patient_external_id_batch_source
  BEFORE INSERT ON public.patient_external_ids
  FOR EACH ROW EXECUTE FUNCTION public.validate_import_mapping_batch_source();

DROP TRIGGER IF EXISTS validate_visit_external_id_batch_source ON public.visit_external_ids;
CREATE TRIGGER validate_visit_external_id_batch_source
  BEFORE INSERT ON public.visit_external_ids
  FOR EACH ROW EXECUTE FUNCTION public.validate_import_mapping_batch_source();

DROP TRIGGER IF EXISTS validate_transaction_external_id_batch_source ON public.transaction_external_ids;
CREATE TRIGGER validate_transaction_external_id_batch_source
  BEFORE INSERT ON public.transaction_external_ids
  FOR EACH ROW EXECUTE FUNCTION public.validate_import_mapping_batch_source();

DROP POLICY IF EXISTS "import operators manage batches" ON public.import_batches;
DROP POLICY IF EXISTS "import operators read batches" ON public.import_batches;
CREATE POLICY "import operators read batches"
  ON public.import_batches
  FOR SELECT
  TO authenticated
  USING (public.can_manage_imports((SELECT auth.uid())));
DROP POLICY IF EXISTS "import operators create batches" ON public.import_batches;
CREATE POLICY "import operators create batches"
  ON public.import_batches
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_manage_imports((SELECT auth.uid()))
    AND created_by = (SELECT auth.uid())
  );
DROP POLICY IF EXISTS "import operators update own batches" ON public.import_batches;
CREATE POLICY "import operators update own batches"
  ON public.import_batches
  FOR UPDATE
  TO authenticated
  USING (
    public.can_manage_imports((SELECT auth.uid()))
    AND created_by = (SELECT auth.uid())
  )
  WITH CHECK (
    public.can_manage_imports((SELECT auth.uid()))
    AND created_by = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "import operators manage patient external ids" ON public.patient_external_ids;
DROP POLICY IF EXISTS "import operators read patient external ids" ON public.patient_external_ids;
CREATE POLICY "import operators read patient external ids"
  ON public.patient_external_ids
  FOR SELECT
  TO authenticated
  USING (public.can_manage_imports((SELECT auth.uid())));
DROP POLICY IF EXISTS "import operators create patient external ids" ON public.patient_external_ids;
CREATE POLICY "import operators create patient external ids"
  ON public.patient_external_ids
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_imports((SELECT auth.uid())));

DROP POLICY IF EXISTS "import operators manage visit external ids" ON public.visit_external_ids;
DROP POLICY IF EXISTS "import operators read visit external ids" ON public.visit_external_ids;
CREATE POLICY "import operators read visit external ids"
  ON public.visit_external_ids
  FOR SELECT
  TO authenticated
  USING (public.can_manage_imports((SELECT auth.uid())));
DROP POLICY IF EXISTS "import operators create visit external ids" ON public.visit_external_ids;
CREATE POLICY "import operators create visit external ids"
  ON public.visit_external_ids
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_imports((SELECT auth.uid())));

DROP POLICY IF EXISTS "import operators manage transaction external ids" ON public.transaction_external_ids;
DROP POLICY IF EXISTS "import operators read transaction external ids" ON public.transaction_external_ids;
CREATE POLICY "import operators read transaction external ids"
  ON public.transaction_external_ids
  FOR SELECT
  TO authenticated
  USING (public.can_manage_imports((SELECT auth.uid())));
DROP POLICY IF EXISTS "import operators create transaction external ids" ON public.transaction_external_ids;
CREATE POLICY "import operators create transaction external ids"
  ON public.transaction_external_ids
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_imports((SELECT auth.uid())));
