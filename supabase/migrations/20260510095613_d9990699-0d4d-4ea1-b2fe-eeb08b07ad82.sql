
-- Templates dictionary
CREATE TABLE public.clinic_document_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL DEFAULT 'memo',
  content text NOT NULL DEFAULT '',
  paper_size text NOT NULL DEFAULT 'A4',
  orientation text NOT NULL DEFAULT 'portrait',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.clinic_document_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view templates"
  ON public.clinic_document_templates FOR SELECT
  USING (public.is_staff_or_admin(auth.uid()));

CREATE POLICY "Ops/admin can insert templates"
  ON public.clinic_document_templates FOR INSERT
  WITH CHECK (public.is_ops_or_admin(auth.uid()));

CREATE POLICY "Ops/admin can update templates"
  ON public.clinic_document_templates FOR UPDATE
  USING (public.is_ops_or_admin(auth.uid()));

CREATE POLICY "Ops/admin can delete templates"
  ON public.clinic_document_templates FOR DELETE
  USING (public.is_ops_or_admin(auth.uid()));

CREATE TRIGGER trg_clinic_document_templates_updated_at
  BEFORE UPDATE ON public.clinic_document_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Issued documents
CREATE TABLE public.consultation_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id uuid NOT NULL REFERENCES public.consultations(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.clinic_document_templates(id) ON DELETE SET NULL,
  template_name text NOT NULL,
  type text,
  content text NOT NULL,
  paper_size text NOT NULL DEFAULT 'A4',
  orientation text NOT NULL DEFAULT 'portrait',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_consultation_documents_consultation ON public.consultation_documents(consultation_id);
CREATE INDEX idx_consultation_documents_patient ON public.consultation_documents(patient_id);

ALTER TABLE public.consultation_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view consultation documents"
  ON public.consultation_documents FOR SELECT
  USING (public.is_staff_or_admin(auth.uid()));

CREATE POLICY "Staff can insert consultation documents"
  ON public.consultation_documents FOR INSERT
  WITH CHECK (public.is_staff_or_admin(auth.uid()));

CREATE POLICY "Staff can update consultation documents"
  ON public.consultation_documents FOR UPDATE
  USING (public.is_staff_or_admin(auth.uid()));
