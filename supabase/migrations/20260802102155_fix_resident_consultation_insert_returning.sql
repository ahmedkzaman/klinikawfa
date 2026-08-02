-- INSERT ... RETURNING must evaluate the new consultation row directly.
-- The prior STABLE helper re-read consultations and could not see a row
-- inserted by the same statement, causing valid clinical inserts to fail RLS.

DROP POLICY IF EXISTS consultations_select ON public.consultations;
CREATE POLICY consultations_select
  ON public.consultations
  FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      (
        public.is_clinical(auth.uid())
        AND consultations.doctor_id =
          public.get_doctor_id_for_user(auth.uid())
      )
      OR public.can_read_operational_consultations(auth.uid())
      OR (
        consultations.status = 'completed'
        AND public.can_read_cross_doctor_consultation(auth.uid())
      )
    )
  );

DO $$
DECLARE
  v_qual text;
BEGIN
  SELECT qual
    INTO v_qual
    FROM pg_catalog.pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'consultations'
     AND policyname = 'consultations_select'
     AND cmd = 'SELECT';

  IF v_qual IS NULL
     OR position('doctor_id = get_doctor_id_for_user(auth.uid())' in v_qual) = 0
     OR position('is_current_user_consultation_doctor' in v_qual) > 0
     OR position('can_read_operational_consultations' in v_qual) = 0
     OR position('can_read_cross_doctor_consultation' in v_qual) = 0 THEN
    RAISE EXCEPTION
      'resident consultation policy postflight failed';
  END IF;
END
$$;
