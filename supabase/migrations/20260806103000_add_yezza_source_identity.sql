-- Preserve Yezza source identities and each import's audit trail without
-- modifying any existing patient, visit, or transaction records.

CREATE TABLE IF NOT EXISTS public.import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system text NOT NULL CHECK (btrim(source_system) <> ''),
  status text NOT NULL CHECK (btrim(status) <> ''),
  source_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  imported_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  CHECK (completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at)
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

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.import_batches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.patient_external_ids TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.visit_external_ids TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.transaction_external_ids TO authenticated;

DROP POLICY IF EXISTS "import operators manage batches" ON public.import_batches;
CREATE POLICY "import operators manage batches"
  ON public.import_batches
  FOR ALL
  TO authenticated
  USING (public.can_manage_clinic_permissions((SELECT auth.uid())))
  WITH CHECK (public.can_manage_clinic_permissions((SELECT auth.uid())));

DROP POLICY IF EXISTS "import operators manage patient external ids" ON public.patient_external_ids;
CREATE POLICY "import operators manage patient external ids"
  ON public.patient_external_ids
  FOR ALL
  TO authenticated
  USING (public.can_manage_clinic_permissions((SELECT auth.uid())))
  WITH CHECK (public.can_manage_clinic_permissions((SELECT auth.uid())));

DROP POLICY IF EXISTS "import operators manage visit external ids" ON public.visit_external_ids;
CREATE POLICY "import operators manage visit external ids"
  ON public.visit_external_ids
  FOR ALL
  TO authenticated
  USING (public.can_manage_clinic_permissions((SELECT auth.uid())))
  WITH CHECK (public.can_manage_clinic_permissions((SELECT auth.uid())));

DROP POLICY IF EXISTS "import operators manage transaction external ids" ON public.transaction_external_ids;
CREATE POLICY "import operators manage transaction external ids"
  ON public.transaction_external_ids
  FOR ALL
  TO authenticated
  USING (public.can_manage_clinic_permissions((SELECT auth.uid())))
  WITH CHECK (public.can_manage_clinic_permissions((SELECT auth.uid())));
