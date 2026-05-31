-- ==============================================================================
-- R2-1: Clinical Record Immutability
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.guard_completed_consultation_notes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status = 'completed'
     AND (NEW.case_note IS DISTINCT FROM OLD.case_note
          OR NEW.dispense_note IS DISTINCT FROM OLD.dispense_note)
     AND NOT (public.is_admin(auth.uid()) OR public.has_strict_role(auth.uid(), 'doctor'))
  THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Completed consultation notes are immutable for this role'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_completed_consultation_notes ON public.consultations;
CREATE TRIGGER trg_guard_completed_consultation_notes
  BEFORE UPDATE ON public.consultations
  FOR EACH ROW EXECUTE FUNCTION public.guard_completed_consultation_notes();

-- ==============================================================================
-- R2-2: Close universal read leak on consultation_attachments
-- ==============================================================================
DROP POLICY IF EXISTS "attachments_read" ON public.consultation_attachments;
CREATE POLICY "attachments_read"
  ON public.consultation_attachments FOR SELECT
  TO authenticated
  USING (public.is_staff_or_clinical(auth.uid()));

-- ==============================================================================
-- R2-3 & R2-4: Transcripts cleanup
-- ==============================================================================
DROP POLICY IF EXISTS "consultation_transcripts_ops_insert" ON public.consultation_transcripts;
DROP POLICY IF EXISTS "consultation_transcripts_ops_update" ON public.consultation_transcripts;

DROP POLICY IF EXISTS "Staff/Admin can delete transcripts" ON public.consultation_transcripts;
CREATE POLICY "Admin only can delete transcripts"
  ON public.consultation_transcripts FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- ==============================================================================
-- R2-5: Harden consultation_documents (public -> authenticated)
-- Using EXACT policy names from pg_policies dump
-- ==============================================================================
DROP POLICY IF EXISTS "ops_or_admin can delete consultation_documents" ON public.consultation_documents;
CREATE POLICY "ops_or_admin can delete consultation_documents"
  ON public.consultation_documents FOR DELETE
  TO authenticated
  USING (public.is_ops_or_admin(auth.uid()));

DROP POLICY IF EXISTS "Staff can insert consultation documents" ON public.consultation_documents;
CREATE POLICY "Staff can insert consultation documents"
  ON public.consultation_documents FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff_or_clinical(auth.uid()));

DROP POLICY IF EXISTS "Staff can view consultation documents" ON public.consultation_documents;
CREATE POLICY "Staff can view consultation documents"
  ON public.consultation_documents FOR SELECT
  TO authenticated
  USING (public.is_staff_or_clinical(auth.uid()));

DROP POLICY IF EXISTS "Staff can update consultation documents" ON public.consultation_documents;
CREATE POLICY "Staff can update consultation documents"
  ON public.consultation_documents FOR UPDATE
  TO authenticated
  USING (public.is_staff_or_clinical(auth.uid()))
  WITH CHECK (public.is_staff_or_clinical(auth.uid()));