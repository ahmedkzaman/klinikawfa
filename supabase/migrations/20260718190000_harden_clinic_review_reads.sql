-- Keep active marketing reviews public while limiting the full review table,
-- including patient linkage and inactive/rejected rows, to operations/admins.

BEGIN;

DO $preflight$
DECLARE
  v_review_table_exists boolean;
  v_rls_enabled boolean;
  v_full_read_qual text;
  v_public_read_qual text;
BEGIN
  IF to_regprocedure('public.is_ops_or_admin(uuid)') IS NULL THEN
    RAISE EXCEPTION 'clinic-reviews preflight failed; public.is_ops_or_admin(uuid) is missing';
  END IF;

  SELECT EXISTS (
           SELECT 1
             FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public'
              AND c.relname = 'clinic_reviews'
              AND c.relkind = 'r'
         ),
         COALESCE((
           SELECT c.relrowsecurity
             FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public'
              AND c.relname = 'clinic_reviews'
              AND c.relkind = 'r'
         ), false)
    INTO v_review_table_exists, v_rls_enabled;

  IF NOT v_review_table_exists OR NOT v_rls_enabled THEN
    RAISE EXCEPTION 'clinic-reviews preflight failed; clinic_reviews is missing or RLS is disabled';
  END IF;

  SELECT qual
    INTO v_full_read_qual
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'clinic_reviews'
     AND policyname IN (
       'Authenticated can read clinic_reviews',
       'Operations can read all clinic_reviews'
     )
     AND cmd = 'SELECT';

  IF v_full_read_qual IS NULL
     OR (
       v_full_read_qual <> 'true'
       AND position('is_ops_or_admin' in v_full_read_qual) = 0
     ) THEN
    RAISE EXCEPTION 'clinic-reviews preflight failed; unexpected full-read policy';
  END IF;

  SELECT qual
    INTO v_public_read_qual
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'clinic_reviews'
     AND policyname = 'Public can read clinic_reviews active'
     AND cmd = 'SELECT';

  IF v_public_read_qual IS NULL
     OR position('status' in v_public_read_qual) = 0
     OR position('active' in v_public_read_qual) = 0 THEN
    RAISE EXCEPTION 'clinic-reviews preflight failed; active-review public policy is missing';
  END IF;
END
$preflight$;

DROP POLICY IF EXISTS "Authenticated can read clinic_reviews" ON public.clinic_reviews;
DROP POLICY IF EXISTS "Operations can read all clinic_reviews"
  ON public.clinic_reviews;
DROP POLICY IF EXISTS "Public can read clinic_reviews active"
  ON public.clinic_reviews;

CREATE POLICY "Operations can read all clinic_reviews"
  ON public.clinic_reviews
  FOR SELECT
  TO authenticated
  USING (public.is_ops_or_admin(auth.uid()));

CREATE POLICY "Public can read clinic_reviews active"
  ON public.clinic_reviews
  FOR SELECT
  TO anon, authenticated
  USING (status = 'active');

DO $postflight$
DECLARE
  v_select_policy_count integer;
  v_full_read_qual text;
  v_full_read_roles name[];
  v_public_read_qual text;
  v_public_read_roles name[];
BEGIN
  SELECT count(*)
    INTO v_select_policy_count
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'clinic_reviews'
     AND cmd = 'SELECT';

  IF v_select_policy_count <> 2 THEN
    RAISE EXCEPTION 'clinic-reviews postflight failed; expected 2 SELECT policies, found %',
      v_select_policy_count;
  END IF;

  SELECT qual, roles
    INTO v_full_read_qual, v_full_read_roles
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'clinic_reviews'
     AND policyname = 'Operations can read all clinic_reviews'
     AND cmd = 'SELECT';

  IF v_full_read_qual IS NULL
     OR v_full_read_roles <> ARRAY['authenticated']::name[]
     OR position('is_ops_or_admin' in v_full_read_qual) = 0
     OR v_full_read_qual = 'true' THEN
    RAISE EXCEPTION 'clinic-reviews postflight failed; full-review reads are not operations-scoped';
  END IF;

  SELECT qual, roles
    INTO v_public_read_qual, v_public_read_roles
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'clinic_reviews'
     AND policyname = 'Public can read clinic_reviews active'
     AND cmd = 'SELECT';

  IF v_public_read_qual IS NULL
     OR cardinality(v_public_read_roles) <> 2
     OR NOT (v_public_read_roles @> ARRAY['anon', 'authenticated']::name[])
     OR position('status' in v_public_read_qual) = 0
     OR position('active' in v_public_read_qual) = 0
     OR v_public_read_qual = 'true' THEN
    RAISE EXCEPTION 'clinic-reviews postflight failed; public reads are not limited to active reviews';
  END IF;
END
$postflight$;

COMMIT;
