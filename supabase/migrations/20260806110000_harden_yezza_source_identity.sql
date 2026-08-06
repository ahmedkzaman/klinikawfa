-- Forward-only hardening for environments that already applied the source
-- identity foundation migration. Existing audit rows are not rewritten.

ALTER TABLE public.import_batches
  ADD COLUMN IF NOT EXISTS source_batch_id text;

ALTER TABLE public.import_batches
  DROP CONSTRAINT IF EXISTS import_batches_source_batch_id_not_blank;
ALTER TABLE public.import_batches
  ADD CONSTRAINT import_batches_source_batch_id_not_blank
  CHECK (source_batch_id IS NULL OR btrim(source_batch_id) <> '');

CREATE UNIQUE INDEX IF NOT EXISTS import_batches_source_system_source_batch_id_key
  ON public.import_batches (source_system, source_batch_id);

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

REVOKE DELETE ON TABLE public.import_batches FROM authenticated;
REVOKE UPDATE, DELETE ON TABLE public.patient_external_ids FROM authenticated;
REVOKE UPDATE, DELETE ON TABLE public.visit_external_ids FROM authenticated;
REVOKE UPDATE, DELETE ON TABLE public.transaction_external_ids FROM authenticated;

DROP POLICY IF EXISTS "import operators manage batches" ON public.import_batches;
DROP POLICY IF EXISTS "import operators read batches" ON public.import_batches;
CREATE POLICY "import operators read batches"
  ON public.import_batches
  FOR SELECT TO authenticated
  USING (public.can_manage_imports((SELECT auth.uid())));

DROP POLICY IF EXISTS "import operators create batches" ON public.import_batches;
CREATE POLICY "import operators create batches"
  ON public.import_batches
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_imports((SELECT auth.uid()))
    AND source_batch_id IS NOT NULL
    AND created_by = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "import operators update own batches" ON public.import_batches;
CREATE POLICY "import operators update own batches"
  ON public.import_batches
  FOR UPDATE TO authenticated
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
  FOR SELECT TO authenticated
  USING (public.can_manage_imports((SELECT auth.uid())));
DROP POLICY IF EXISTS "import operators create patient external ids" ON public.patient_external_ids;
CREATE POLICY "import operators create patient external ids"
  ON public.patient_external_ids
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_imports((SELECT auth.uid())));

DROP POLICY IF EXISTS "import operators manage visit external ids" ON public.visit_external_ids;
DROP POLICY IF EXISTS "import operators read visit external ids" ON public.visit_external_ids;
CREATE POLICY "import operators read visit external ids"
  ON public.visit_external_ids
  FOR SELECT TO authenticated
  USING (public.can_manage_imports((SELECT auth.uid())));
DROP POLICY IF EXISTS "import operators create visit external ids" ON public.visit_external_ids;
CREATE POLICY "import operators create visit external ids"
  ON public.visit_external_ids
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_imports((SELECT auth.uid())));

DROP POLICY IF EXISTS "import operators manage transaction external ids" ON public.transaction_external_ids;
DROP POLICY IF EXISTS "import operators read transaction external ids" ON public.transaction_external_ids;
CREATE POLICY "import operators read transaction external ids"
  ON public.transaction_external_ids
  FOR SELECT TO authenticated
  USING (public.can_manage_imports((SELECT auth.uid())));
DROP POLICY IF EXISTS "import operators create transaction external ids" ON public.transaction_external_ids;
CREATE POLICY "import operators create transaction external ids"
  ON public.transaction_external_ids
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_imports((SELECT auth.uid())));
