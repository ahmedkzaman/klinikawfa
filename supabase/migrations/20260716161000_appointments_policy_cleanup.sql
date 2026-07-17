-- Remove the out-of-band blanket appointments policy reported by the
-- production scanner and reassert the three intended least-privilege policies.

BEGIN;

DO $preflight$
DECLARE
  insecure record;
BEGIN
  SELECT * INTO insecure
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'appointments'
     AND policyname = 'Staff can manage appointments';

  IF FOUND AND NOT (
    insecure.cmd = 'ALL'
    AND regexp_replace(lower(coalesce(insecure.qual,'')), '[[:space:]()]', '', 'g') = 'true'
    AND regexp_replace(lower(coalesce(insecure.with_check,'')), '[[:space:]()]', '', 'g') = 'true'
  ) THEN
    RAISE EXCEPTION 'appointments preflight: named policy exists with an unexpected definition';
  END IF;
END
$preflight$;

DROP POLICY IF EXISTS "Staff can manage appointments" ON public.appointments;
DROP POLICY IF EXISTS "Staff/Admin can view appointments" ON public.appointments;
DROP POLICY IF EXISTS "Staff/Admin can update appointments" ON public.appointments;
DROP POLICY IF EXISTS "Staff/Admin can delete appointments" ON public.appointments;

CREATE POLICY "Staff/Admin can view appointments"
  ON public.appointments FOR SELECT TO authenticated
  USING (public.is_staff_or_clinical(auth.uid()));

CREATE POLICY "Staff/Admin can update appointments"
  ON public.appointments FOR UPDATE TO authenticated
  USING (public.is_staff_or_clinical(auth.uid()))
  WITH CHECK (public.is_staff_or_clinical(auth.uid()));

CREATE POLICY "Staff/Admin can delete appointments"
  ON public.appointments FOR DELETE TO authenticated
  USING (public.is_staff_or_clinical(auth.uid()));

DO $postflight$
DECLARE
  bad_count integer;
  exact_count integer;
BEGIN
  SELECT count(*) INTO exact_count
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'appointments'
     AND policyname IN (
       'Staff/Admin can view appointments',
       'Staff/Admin can update appointments',
       'Staff/Admin can delete appointments'
     )
     AND roles = '{authenticated}'::name[]
     AND regexp_replace(lower(coalesce(qual,'')), '[[:space:]()]', '', 'g')
         = 'is_staff_or_clinicalauth.uid';

  SELECT count(*) INTO bad_count
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'appointments'
     AND (
       policyname = 'Staff can manage appointments'
       OR cmd = 'ALL'
       OR regexp_replace(lower(coalesce(qual,'')), '[[:space:]()]', '', 'g') = 'true'
     );

  IF exact_count <> 3 OR bad_count <> 0 THEN
    RAISE EXCEPTION 'appointments postflight failed: exact=% unsafe=%', exact_count, bad_count;
  END IF;
END
$postflight$;

COMMIT;
