-- Close cross-plan authorization gaps introduced when website_editor became an
-- authenticated application role. Preserve the established workforce role
-- union while keeping clinic reviews and private staff resources outside the
-- Website Editor boundary.

BEGIN;

DO $preflight$
DECLARE
  v_missing_policies text[];
BEGIN
  IF to_regclass('public.clinic_reviews') IS NULL
     OR to_regclass('public.attendance_records') IS NULL
     OR to_regclass('public.daily_reports') IS NULL
     OR to_regclass('public.website_tracking_settings') IS NULL
     OR to_regclass('storage.objects') IS NULL THEN
    RAISE EXCEPTION 'CMS integration hardening preflight failed; required tables are missing';
  END IF;

  IF to_regclass('public.user_roles') IS NULL
     OR to_regprocedure('private.can_manage_tracking_settings()') IS NULL THEN
    RAISE EXCEPTION 'CMS integration hardening preflight failed; authorization dependencies are missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM storage.buckets
    WHERE id = 'daily-reports'
      AND public = false
  ) THEN
    RAISE EXCEPTION 'CMS integration hardening preflight failed; daily-reports bucket is missing or public';
  END IF;

  SELECT array_agg(expected.policyname ORDER BY expected.schemaname, expected.tablename, expected.policyname)
    INTO v_missing_policies
    FROM (
      VALUES
        ('public', 'clinic_reviews', 'Public can read clinic_reviews active'),
        ('public', 'attendance_records', 'Staff can view own attendance'),
        ('public', 'attendance_records', 'Staff can insert own attendance'),
        ('public', 'daily_reports', 'Staff can view own daily reports'),
        ('public', 'daily_reports', 'Staff can insert own daily reports'),
        ('public', 'daily_reports', 'Staff can update own daily reports'),
        ('storage', 'objects', 'Staff view own daily report files'),
        ('storage', 'objects', 'Staff can upload own daily report files'),
        ('storage', 'objects', 'Staff can update own daily report files'),
        ('storage', 'objects', 'Staff can delete own daily report files')
    ) AS expected(schemaname, tablename, policyname)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_policies AS actual
      WHERE actual.schemaname = expected.schemaname
        AND actual.tablename = expected.tablename
        AND actual.policyname = expected.policyname
    );

  IF v_missing_policies IS NOT NULL THEN
    RAISE EXCEPTION 'CMS integration hardening preflight failed; missing legacy policies: %',
      v_missing_policies;
  END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION private.is_workforce_self_service_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles AS ur
    WHERE ur.user_id = (SELECT auth.uid())
      AND ur.role::text IN ('admin', 'special_admin', 'doctor_admin', 'ops_staff', 'operations', 'staff', 'locum', 'resident_doctor')
  );
$$;

REVOKE ALL ON FUNCTION private.is_workforce_self_service_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_workforce_self_service_user() TO authenticated;

DROP POLICY IF EXISTS "Public can read clinic_reviews active"
  ON public.clinic_reviews;
REVOKE SELECT ON TABLE public.clinic_reviews FROM anon;

DROP POLICY IF EXISTS "Staff can view own attendance"
  ON public.attendance_records;
DROP POLICY IF EXISTS "Staff can insert own attendance"
  ON public.attendance_records;

CREATE POLICY "Workforce can view own attendance"
  ON public.attendance_records
  FOR SELECT
  TO authenticated
  USING (
    (SELECT private.is_workforce_self_service_user())
    AND auth.uid() = user_id
  );

CREATE POLICY "Workforce can insert own attendance"
  ON public.attendance_records
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT private.is_workforce_self_service_user())
    AND auth.uid() = user_id
  );

DROP POLICY IF EXISTS "Staff can view own daily reports"
  ON public.daily_reports;
DROP POLICY IF EXISTS "Staff can insert own daily reports"
  ON public.daily_reports;
DROP POLICY IF EXISTS "Staff can update own daily reports"
  ON public.daily_reports;

CREATE POLICY "Workforce can view own daily reports"
  ON public.daily_reports
  FOR SELECT
  TO authenticated
  USING (
    (SELECT private.is_workforce_self_service_user())
    AND auth.uid() = user_id
  );

CREATE POLICY "Workforce can insert own daily reports"
  ON public.daily_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT private.is_workforce_self_service_user())
    AND auth.uid() = user_id
  );

CREATE POLICY "Workforce can update own daily reports"
  ON public.daily_reports
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT private.is_workforce_self_service_user())
    AND auth.uid() = user_id
  )
  WITH CHECK (
    (SELECT private.is_workforce_self_service_user())
    AND auth.uid() = user_id
  );

DROP POLICY IF EXISTS "Staff view own daily report files"
  ON storage.objects;
DROP POLICY IF EXISTS "Staff can upload own daily report files"
  ON storage.objects;
DROP POLICY IF EXISTS "Staff can update own daily report files"
  ON storage.objects;
DROP POLICY IF EXISTS "Staff can delete own daily report files"
  ON storage.objects;

CREATE POLICY "Workforce can view own daily report files"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'daily-reports'
    AND (SELECT private.is_workforce_self_service_user())
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Workforce can upload own daily report files"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'daily-reports'
    AND (SELECT private.is_workforce_self_service_user())
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Workforce can update own daily report files"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'daily-reports'
    AND (SELECT private.is_workforce_self_service_user())
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'daily-reports'
    AND (SELECT private.is_workforce_self_service_user())
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Workforce can delete own daily report files"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'daily-reports'
    AND (SELECT private.is_workforce_self_service_user())
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE OR REPLACE FUNCTION private.stamp_website_tracking_settings_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF NOT private.can_manage_tracking_settings() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  NEW.updated_by := (SELECT auth.uid());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.stamp_website_tracking_settings_actor() FROM PUBLIC;

DROP TRIGGER IF EXISTS stamp_website_tracking_settings_actor
  ON public.website_tracking_settings;
CREATE TRIGGER stamp_website_tracking_settings_actor
  BEFORE UPDATE ON public.website_tracking_settings
  FOR EACH ROW
  EXECUTE FUNCTION private.stamp_website_tracking_settings_actor();

DO $postflight$
DECLARE
  v_new_policy_count integer;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'clinic_reviews'
      AND policyname = 'Public can read clinic_reviews active'
  ) THEN
    RAISE EXCEPTION 'CMS integration hardening postflight failed; public clinic review read remains';
  END IF;

  SELECT count(*)
    INTO v_new_policy_count
    FROM pg_policies
    WHERE (schemaname, tablename, policyname) IN (
      ('public', 'attendance_records', 'Workforce can view own attendance'),
      ('public', 'attendance_records', 'Workforce can insert own attendance'),
      ('public', 'daily_reports', 'Workforce can view own daily reports'),
      ('public', 'daily_reports', 'Workforce can insert own daily reports'),
      ('public', 'daily_reports', 'Workforce can update own daily reports'),
      ('storage', 'objects', 'Workforce can view own daily report files'),
      ('storage', 'objects', 'Workforce can upload own daily report files'),
      ('storage', 'objects', 'Workforce can update own daily report files'),
      ('storage', 'objects', 'Workforce can delete own daily report files')
    );

  IF v_new_policy_count <> 9 THEN
    RAISE EXCEPTION 'CMS integration hardening postflight failed; expected 9 workforce policies, found %',
      v_new_policy_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger AS t
    WHERE t.tgrelid = 'public.website_tracking_settings'::regclass
      AND t.tgname = 'stamp_website_tracking_settings_actor'
      AND t.tgfoid = 'private.stamp_website_tracking_settings_actor()'::regprocedure
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'CMS integration hardening postflight failed; tracking actor trigger is missing';
  END IF;
END
$postflight$;

COMMIT;