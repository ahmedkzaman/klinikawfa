-- Cross-doctor clinical history is limited to completed consultations and
-- remains read-only. Operational roles keep the row visibility required by
-- dispensary, billing, and patient administration workflows.

CREATE OR REPLACE FUNCTION public.can_read_cross_doctor_consultation(
  _user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN ('resident_doctor', 'doctor_admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.can_read_operational_consultations(
  _user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN (
        'admin',
        'special_admin',
        'staff',
        'ops_staff',
        'operations',
        'staff_nurse',
        'purchaser'
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_read_cross_doctor_consultation(uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_read_operational_consultations(uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_cross_doctor_consultation(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_read_operational_consultations(uuid)
  TO authenticated, service_role;

DROP POLICY IF EXISTS consultations_select ON public.consultations;
CREATE POLICY consultations_select
  ON public.consultations
  FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      public.is_current_user_consultation_doctor(consultations.id)
      OR public.can_read_operational_consultations(auth.uid())
      OR (
        consultations.status = 'completed'
        AND public.can_read_cross_doctor_consultation(auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS consultations_update ON public.consultations;
CREATE POLICY consultations_update
  ON public.consultations
  FOR UPDATE
  TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      (
        public.is_clinical(auth.uid())
        AND consultations.doctor_id =
          public.get_doctor_id_for_user(auth.uid())
      )
      OR (
        consultations.doctor_id IS NULL
        AND public.can_read_operational_consultations(auth.uid())
      )
    )
  )
  WITH CHECK (
    deleted_at IS NULL
    AND (
      (
        public.is_clinical(auth.uid())
        AND consultations.doctor_id =
          public.get_doctor_id_for_user(auth.uid())
      )
      OR (
        consultations.doctor_id IS NULL
        AND public.can_read_operational_consultations(auth.uid())
      )
    )
  );

DO $$
BEGIN
  IF to_regprocedure(
    'public.can_read_cross_doctor_consultation(uuid)'
  ) IS NULL THEN
    RAISE EXCEPTION
      'consultation history postflight failed: cross-doctor helper missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'consultations'
      AND policyname = 'consultations_select'
      AND cmd = 'SELECT'
  ) THEN
    RAISE EXCEPTION
      'consultation history postflight failed: select policy missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'consultations'
      AND policyname = 'consultations_update'
      AND cmd = 'UPDATE'
  ) THEN
    RAISE EXCEPTION
      'consultation history postflight failed: update policy missing';
  END IF;
END
$$;
