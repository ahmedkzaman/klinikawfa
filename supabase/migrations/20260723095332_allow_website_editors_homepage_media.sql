BEGIN;

DO $preflight$
BEGIN
  IF to_regclass('public.app_settings') IS NULL THEN
    RAISE EXCEPTION 'Homepage media settings preflight failed: app_settings is missing';
  END IF;

  IF to_regprocedure('private.can_manage_website()') IS NULL THEN
    RAISE EXCEPTION 'Homepage media settings preflight failed: website authorization helper is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class
    WHERE oid = 'public.app_settings'::regclass
      AND relrowsecurity
  ) THEN
    RAISE EXCEPTION 'Homepage media settings preflight failed: app_settings RLS is disabled';
  END IF;
END
$preflight$;

GRANT SELECT (key, value)
  ON public.app_settings
  TO authenticated;
GRANT INSERT (key, value, description)
  ON public.app_settings
  TO authenticated;
GRANT UPDATE (value, description)
  ON public.app_settings
  TO authenticated;

DROP POLICY IF EXISTS "Website managers can insert homepage media settings"
  ON public.app_settings;
DROP POLICY IF EXISTS "Website managers can update homepage media settings"
  ON public.app_settings;

CREATE POLICY "Website managers can insert homepage media settings"
ON public.app_settings
FOR INSERT
TO authenticated
WITH CHECK (
  key IN ('homepage_video_url', 'homepage_video_poster')
  AND (SELECT private.can_manage_website())
);

CREATE POLICY "Website managers can update homepage media settings"
ON public.app_settings
FOR UPDATE
TO authenticated
USING (
  key IN ('homepage_video_url', 'homepage_video_poster')
  AND (SELECT private.can_manage_website())
)
WITH CHECK (
  key IN ('homepage_video_url', 'homepage_video_poster')
  AND (SELECT private.can_manage_website())
);

DO $postflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'app_settings'
      AND policyname = 'Website managers can insert homepage media settings'
      AND roles = ARRAY['authenticated']::name[]
      AND cmd = 'INSERT'
  ) THEN
    RAISE EXCEPTION 'Homepage media settings postflight failed: insert policy is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'app_settings'
      AND policyname = 'Website managers can update homepage media settings'
      AND roles = ARRAY['authenticated']::name[]
      AND cmd = 'UPDATE'
  ) THEN
    RAISE EXCEPTION 'Homepage media settings postflight failed: update policy is missing';
  END IF;
END
$postflight$;

COMMIT;
