-- Locked database-side marker for the v7 staging harness.
-- The runner invokes this only after guard-not-prod.sh structurally verifies
-- the API URL and database pooler username against STAGING_PROJECT_REF.
\set ON_ERROR_STOP on

SELECT set_config('app.claimed_staging_project_ref', :'STAGING_PROJECT_REF', false);

BEGIN;

CREATE SCHEMA IF NOT EXISTS rls_test_support;
REVOKE ALL ON SCHEMA rls_test_support FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS rls_test_support.environment_marker (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  project_ref text NOT NULL CHECK (project_ref ~ '^[a-z0-9]{20}$')
);
REVOKE ALL ON TABLE rls_test_support.environment_marker FROM PUBLIC, anon, authenticated;

INSERT INTO rls_test_support.environment_marker (singleton, project_ref)
VALUES (true, :'STAGING_PROJECT_REF')
ON CONFLICT (singleton) DO NOTHING;

DO $verify$
DECLARE
  marker  text;
  claimed text := current_setting('app.claimed_staging_project_ref', true);
BEGIN
  SELECT project_ref INTO marker
    FROM rls_test_support.environment_marker
   WHERE singleton = true;

  IF marker IS NULL OR marker <> claimed THEN
    RAISE EXCEPTION 'staging marker mismatch: database marker does not equal guarded project ref';
  END IF;
  IF marker = 'ncysmppzfjtiekfnomdv' THEN
    RAISE EXCEPTION 'staging marker refused: project ref equals production ref';
  END IF;
END
$verify$;

COMMIT;
