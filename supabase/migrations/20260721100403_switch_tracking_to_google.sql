BEGIN;

DO $preflight$
DECLARE
  v_tracking_helper text;
  v_tracking_roles text[];
  v_stamp_helper text;
BEGIN
  IF to_regclass('public.website_tracking_settings') IS NULL THEN
    RAISE EXCEPTION 'Google tracking preflight failed: website_tracking_settings is missing';
  END IF;

  IF to_regprocedure('private.can_manage_tracking_settings()') IS NULL
     OR to_regprocedure('private.stamp_website_tracking_settings_actor()') IS NULL THEN
    RAISE EXCEPTION 'Google tracking preflight failed: tracking authorization helpers are missing';
  END IF;

  SELECT prosrc
    INTO v_tracking_helper
    FROM pg_proc
    WHERE oid = 'private.can_manage_tracking_settings()'::regprocedure;
  -- Capability role set: 'admin', 'special_admin', 'doctor_admin', 'website_editor'.
  SELECT array_agg(role_capture[1] ORDER BY role_capture[1])
    INTO v_tracking_roles
    FROM regexp_matches(
      v_tracking_helper,
      $role_literal$'([a-z_]+)'$role_literal$,
      'g'
    ) AS role_capture;
  IF v_tracking_roles IS DISTINCT FROM ARRAY[
    'admin', 'doctor_admin', 'special_admin', 'website_editor'
  ]::text[] THEN
    RAISE EXCEPTION 'Google tracking preflight failed: tracking role capability changed';
  END IF;

  SELECT pg_get_functiondef('private.stamp_website_tracking_settings_actor()'::regprocedure)
    INTO v_stamp_helper;
  IF v_stamp_helper NOT LIKE '%private.can_manage_tracking_settings()%' THEN
    RAISE EXCEPTION 'Google tracking preflight failed: audit trigger does not reuse tracking authorization';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class
    WHERE oid = 'public.website_tracking_settings'::regclass
      AND relrowsecurity
  ) THEN
    RAISE EXCEPTION 'Google tracking preflight failed: RLS is not enabled';
  END IF;
END
$preflight$;

ALTER TABLE public.website_tracking_settings
  ADD COLUMN measurement_id text,
  ADD COLUMN ads_conversion_id text,
  ADD COLUMN ads_conversion_labels jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.website_tracking_settings
  DROP CONSTRAINT IF EXISTS website_tracking_settings_provider_check,
  DROP CONSTRAINT IF EXISTS website_tracking_settings_check;

DROP TRIGGER IF EXISTS stamp_website_tracking_settings_actor
  ON public.website_tracking_settings;

UPDATE public.website_tracking_settings
SET provider = 'google_tag',
    enabled = false,
    measurement_id = NULL,
    ads_conversion_id = NULL,
    ads_conversion_labels = '{}'::jsonb;

CREATE TRIGGER stamp_website_tracking_settings_actor
  BEFORE UPDATE ON public.website_tracking_settings
  FOR EACH ROW
  EXECUTE FUNCTION private.stamp_website_tracking_settings_actor();

ALTER TABLE public.website_tracking_settings
  ADD CONSTRAINT website_tracking_settings_provider_google_check
    CHECK (provider = 'google_tag'),
  ADD CONSTRAINT website_tracking_settings_measurement_id_check
    CHECK (measurement_id IS NULL OR measurement_id ~ '^G-[A-Z0-9]{10}$'),
  ADD CONSTRAINT website_tracking_settings_ads_conversion_id_check
    CHECK (ads_conversion_id IS NULL OR ads_conversion_id ~ '^AW-[0-9]{9,12}$'),
  ADD CONSTRAINT website_tracking_settings_ads_conversion_labels_check
    CHECK (
      jsonb_typeof(ads_conversion_labels) = 'object'
      AND ads_conversion_labels - 'contact_click' - 'phone_click' - 'whatsapp_click' = '{}'::jsonb
      AND (
        NOT (ads_conversion_labels ? 'contact_click')
        OR (
          jsonb_typeof(ads_conversion_labels -> 'contact_click') = 'string'
          AND ads_conversion_labels ->> 'contact_click' ~ '^[A-Za-z0-9_-]{1,100}$'
        )
      )
      AND (
        NOT (ads_conversion_labels ? 'phone_click')
        OR (
          jsonb_typeof(ads_conversion_labels -> 'phone_click') = 'string'
          AND ads_conversion_labels ->> 'phone_click' ~ '^[A-Za-z0-9_-]{1,100}$'
        )
      )
      AND (
        NOT (ads_conversion_labels ? 'whatsapp_click')
        OR (
          jsonb_typeof(ads_conversion_labels -> 'whatsapp_click') = 'string'
          AND ads_conversion_labels ->> 'whatsapp_click' ~ '^[A-Za-z0-9_-]{1,100}$'
        )
      )
    ),
  ADD CONSTRAINT website_tracking_settings_google_enablement_check
    CHECK (
      NOT enabled
      OR (
        measurement_id IS NOT NULL
        AND ads_conversion_id IS NOT NULL
        AND ads_conversion_labels ?& ARRAY['contact_click', 'phone_click', 'whatsapp_click']::text[]
      )
    );

REVOKE ALL ON TABLE public.website_tracking_settings FROM anon, authenticated;
REVOKE SELECT (
  provider, enabled, pixel_id, measurement_id, ads_conversion_id,
  ads_conversion_labels, consent_version, updated_by, updated_at
) ON TABLE public.website_tracking_settings FROM anon, authenticated;
REVOKE UPDATE (
  provider, enabled, pixel_id, measurement_id, ads_conversion_id,
  ads_conversion_labels, consent_version, updated_by, updated_at
) ON TABLE public.website_tracking_settings FROM anon, authenticated;

GRANT SELECT (
  provider, enabled, measurement_id, ads_conversion_id, ads_conversion_labels, consent_version
) ON TABLE public.website_tracking_settings TO anon, authenticated;
GRANT UPDATE (
  enabled, measurement_id, ads_conversion_id, ads_conversion_labels, consent_version
) ON TABLE public.website_tracking_settings TO authenticated;

ALTER TABLE public.website_tracking_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enabled tracking settings are readable"
  ON public.website_tracking_settings;
DROP POLICY IF EXISTS "Tracking managers can read tracking settings"
  ON public.website_tracking_settings;
DROP POLICY IF EXISTS "Tracking managers can update tracking settings"
  ON public.website_tracking_settings;

CREATE POLICY "Enabled tracking settings are readable"
ON public.website_tracking_settings
FOR SELECT
TO anon, authenticated
USING (enabled = true);

CREATE POLICY "Tracking managers can read tracking settings"
ON public.website_tracking_settings
FOR SELECT
TO authenticated
USING ((SELECT private.can_manage_tracking_settings()));

CREATE POLICY "Tracking managers can update tracking settings"
ON public.website_tracking_settings
FOR UPDATE
TO authenticated
USING ((SELECT private.can_manage_tracking_settings()))
WITH CHECK ((SELECT private.can_manage_tracking_settings()));

DO $postflight$
DECLARE
  v_bad_column text;
  v_safe_column text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.website_tracking_settings
    WHERE provider = 'google_tag'
      AND enabled = false
  ) THEN
    RAISE EXCEPTION 'Google tracking postflight failed: disabled Google row is missing';
  END IF;

  FOREACH v_safe_column IN ARRAY ARRAY[
    'provider', 'enabled', 'measurement_id', 'ads_conversion_id',
    'ads_conversion_labels', 'consent_version'
  ] LOOP
    IF NOT has_column_privilege('anon', 'public.website_tracking_settings', v_safe_column, 'SELECT')
       OR NOT has_column_privilege('authenticated', 'public.website_tracking_settings', v_safe_column, 'SELECT') THEN
      RAISE EXCEPTION 'Google tracking postflight failed: public-safe read grant missing for %', v_safe_column;
    END IF;
  END LOOP;

  FOREACH v_bad_column IN ARRAY ARRAY['pixel_id', 'updated_by', 'updated_at'] LOOP
    IF has_column_privilege('anon', 'public.website_tracking_settings', v_bad_column, 'SELECT')
       OR has_column_privilege('authenticated', 'public.website_tracking_settings', v_bad_column, 'SELECT') THEN
      RAISE EXCEPTION 'Google tracking postflight failed: private read grant remains for %', v_bad_column;
    END IF;
  END LOOP;

  FOREACH v_safe_column IN ARRAY ARRAY[
    'enabled', 'measurement_id', 'ads_conversion_id',
    'ads_conversion_labels', 'consent_version'
  ] LOOP
    IF NOT has_column_privilege('authenticated', 'public.website_tracking_settings', v_safe_column, 'UPDATE') THEN
      RAISE EXCEPTION 'Google tracking postflight failed: manager update grant missing for %', v_safe_column;
    END IF;
  END LOOP;

  FOREACH v_bad_column IN ARRAY ARRAY['provider', 'pixel_id', 'updated_by', 'updated_at'] LOOP
    IF has_column_privilege('authenticated', 'public.website_tracking_settings', v_bad_column, 'UPDATE') THEN
      RAISE EXCEPTION 'Google tracking postflight failed: unsafe update grant remains for %', v_bad_column;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger AS trigger
    WHERE trigger.tgrelid = 'public.website_tracking_settings'::regclass
      AND trigger.tgname = 'stamp_website_tracking_settings_actor'
      AND trigger.tgfoid = 'private.stamp_website_tracking_settings_actor()'::regprocedure
      AND NOT trigger.tgisinternal
  ) THEN
    RAISE EXCEPTION 'Google tracking postflight failed: audit trigger is missing';
  END IF;
END
$postflight$;

COMMIT;
