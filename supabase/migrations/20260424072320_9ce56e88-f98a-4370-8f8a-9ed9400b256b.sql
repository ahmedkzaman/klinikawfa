CREATE TYPE public.panel_claim_status AS ENUM (
  'pending', 'submitted', 'approved', 'rejected', 'received', 'cancelled'
);

CREATE TABLE public.panel_claims (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_no        text NOT NULL,
  panel_id        uuid NOT NULL REFERENCES public.insurance_providers(id) ON DELETE RESTRICT,
  patient_id      uuid NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  queue_entry_id  uuid REFERENCES public.queue_entries(id) ON DELETE SET NULL,
  amount          numeric(10,2) NOT NULL DEFAULT 0,
  received_amount numeric(10,2),
  status          public.panel_claim_status NOT NULL DEFAULT 'pending',
  claim_date      date NOT NULL DEFAULT CURRENT_DATE,
  due_date        date,
  remarks         text,
  updated_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_panel_claims_updated_by FOREIGN KEY (updated_by)
    REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX panel_claims_status_idx     ON public.panel_claims(status);
CREATE INDEX panel_claims_due_date_idx   ON public.panel_claims(due_date);
CREATE INDEX panel_claims_panel_idx      ON public.panel_claims(panel_id);
CREATE INDEX panel_claims_patient_idx    ON public.panel_claims(patient_id);
CREATE INDEX panel_claims_created_at_idx ON public.panel_claims(created_at DESC);

CREATE TRIGGER set_panel_claims_updated_at
  BEFORE UPDATE ON public.panel_claims
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE VIEW public.panel_claims_view
WITH (security_invoker = true) AS
SELECT
  pc.*,
  (pc.due_date IS NOT NULL
     AND pc.due_date < CURRENT_DATE
     AND pc.status IN ('pending','submitted','approved')) AS is_overdue
FROM public.panel_claims pc;

ALTER TABLE public.panel_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY panel_claims_read_all   ON public.panel_claims FOR SELECT TO authenticated USING (true);
CREATE POLICY panel_claims_ops_insert ON public.panel_claims FOR INSERT TO authenticated WITH CHECK (is_ops_or_admin(auth.uid()));
CREATE POLICY panel_claims_ops_update ON public.panel_claims FOR UPDATE TO authenticated USING (is_ops_or_admin(auth.uid())) WITH CHECK (is_ops_or_admin(auth.uid()));
CREATE POLICY panel_claims_ops_delete ON public.panel_claims FOR DELETE TO authenticated USING (is_ops_or_admin(auth.uid()));