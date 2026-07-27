-- Keep the database definition of internal staff aligned with AuthContext.
CREATE OR REPLACE FUNCTION public.is_internal_staff(_user_id uuid)
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
      AND role IN (
        'admin',
        'special_admin',
        'doctor_admin',
        'staff',
        'ops_staff',
        'operations',
        'resident_doctor',
        'staff_nurse',
        'purchaser'
      )
  )
$$;

REVOKE ALL ON FUNCTION public.is_internal_staff(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_internal_staff(uuid) TO authenticated;

-- Replace the obsolete hard-coded role list with the shared staff helper.
DROP POLICY IF EXISTS "Privileged roles can read queue_entries"
  ON public.queue_entries;
DROP POLICY IF EXISTS "Internal clinic users can read queue entries"
  ON public.queue_entries;

CREATE POLICY "Internal clinic users can read queue entries"
  ON public.queue_entries
  FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      public.is_internal_staff((SELECT auth.uid()))
      OR public.is_clinical((SELECT auth.uid()))
    )
  );

NOTIFY pgrst, 'reload schema';
