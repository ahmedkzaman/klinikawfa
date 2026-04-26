-- A. New columns on panel_claims
ALTER TABLE public.panel_claims
  ADD COLUMN IF NOT EXISTS submitted_date date,
  ADD COLUMN IF NOT EXISTS approved_amount numeric(10,2),
  ADD COLUMN IF NOT EXISTS write_off_amount numeric(10,2)
    GENERATED ALWAYS AS (amount - COALESCE(approved_amount, amount)) STORED,
  ADD COLUMN IF NOT EXISTS payment_reference text,
  ADD COLUMN IF NOT EXISTS received_date date,
  ADD COLUMN IF NOT EXISTS gl_document_url text;

-- B. Refresh the view to expose new columns
DROP VIEW IF EXISTS public.panel_claims_view;

CREATE VIEW public.panel_claims_view
WITH (security_invoker = true)
AS
SELECT
  pc.id,
  pc.claim_no,
  pc.panel_id,
  pc.patient_id,
  pc.queue_entry_id,
  pc.amount,
  pc.received_amount,
  pc.status,
  pc.claim_date,
  pc.due_date,
  pc.submitted_date,
  pc.approved_amount,
  pc.write_off_amount,
  pc.payment_reference,
  pc.received_date,
  pc.gl_document_url,
  pc.remarks,
  pc.updated_by,
  pc.created_at,
  pc.updated_at,
  (
    pc.due_date IS NOT NULL
    AND pc.due_date < CURRENT_DATE
    AND pc.status = ANY (ARRAY['pending'::panel_claim_status, 'submitted'::panel_claim_status, 'approved'::panel_claim_status])
  ) AS is_overdue
FROM public.panel_claims pc;

-- C. Storage bucket for Guarantee Letters / receipts (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('panel-claim-docs', 'panel-claim-docs', false)
ON CONFLICT (id) DO NOTHING;

-- D. Storage RLS — ops/admin only
DROP POLICY IF EXISTS "panel_claim_docs_select" ON storage.objects;
DROP POLICY IF EXISTS "panel_claim_docs_insert" ON storage.objects;
DROP POLICY IF EXISTS "panel_claim_docs_update" ON storage.objects;
DROP POLICY IF EXISTS "panel_claim_docs_delete" ON storage.objects;

CREATE POLICY "panel_claim_docs_select"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'panel-claim-docs' AND public.is_ops_or_admin(auth.uid()));

CREATE POLICY "panel_claim_docs_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'panel-claim-docs' AND public.is_ops_or_admin(auth.uid()));

CREATE POLICY "panel_claim_docs_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'panel-claim-docs' AND public.is_ops_or_admin(auth.uid()))
WITH CHECK (bucket_id = 'panel-claim-docs' AND public.is_ops_or_admin(auth.uid()));

CREATE POLICY "panel_claim_docs_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'panel-claim-docs' AND public.is_ops_or_admin(auth.uid()));