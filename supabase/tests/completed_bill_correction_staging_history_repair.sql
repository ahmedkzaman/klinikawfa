-- STAGING-ONLY one-time history repair.
--
-- This script never runs feature DDL. It only maps the three API-assigned
-- staging versions to the exact committed migration filename versions. Every
-- source and target is checked before mutation, so rerunning it or running it
-- against another environment aborts without changes.

BEGIN;

DO $repair$
DECLARE
  v_source_count integer;
  v_target_count integer;
  v_changed_count integer;
  v_final_count integer;
BEGIN
  SELECT count(*) INTO v_source_count
  FROM supabase_migrations.schema_migrations
  WHERE (version, name) IN (
    ('20260729002310', 'add_completed_bill_corrections'),
    ('20260729002320', 'reconcile_completed_bill_financial_reporting'),
    ('20260729003026', 'index_completed_bill_correction_foreign_keys')
  );
  IF v_source_count <> 3 THEN
    RAISE EXCEPTION
      'STAGING_HISTORY_SOURCE_MISMATCH: expected 3, found %',
      v_source_count;
  END IF;

  SELECT count(*) INTO v_target_count
  FROM supabase_migrations.schema_migrations
  WHERE version IN (
    '20260728150000',
    '20260728153000',
    '20260729003007'
  );
  IF v_target_count <> 0 THEN
    RAISE EXCEPTION
      'STAGING_HISTORY_TARGET_VERSION_ALREADY_EXISTS: %',
      v_target_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM supabase_migrations.schema_migrations
    WHERE name IN (
      'add_completed_bill_corrections',
      'reconcile_completed_bill_financial_reporting',
      'index_completed_bill_correction_foreign_keys'
    )
      AND (version, name) NOT IN (
        ('20260729002310', 'add_completed_bill_corrections'),
        ('20260729002320', 'reconcile_completed_bill_financial_reporting'),
        ('20260729003026', 'index_completed_bill_correction_foreign_keys')
      )
  ) THEN
    RAISE EXCEPTION 'STAGING_HISTORY_DUPLICATE_FEATURE_NAME';
  END IF;

  UPDATE supabase_migrations.schema_migrations
  SET version = CASE version
    WHEN '20260729002310' THEN '20260728150000'
    WHEN '20260729002320' THEN '20260728153000'
    WHEN '20260729003026' THEN '20260729003007'
  END
  WHERE (version, name) IN (
    ('20260729002310', 'add_completed_bill_corrections'),
    ('20260729002320', 'reconcile_completed_bill_financial_reporting'),
    ('20260729003026', 'index_completed_bill_correction_foreign_keys')
  );

  GET DIAGNOSTICS v_changed_count = ROW_COUNT;
  IF v_changed_count <> 3 THEN
    RAISE EXCEPTION
      'STAGING_HISTORY_REPAIR_ROWCOUNT: expected 3, changed %',
      v_changed_count;
  END IF;

  SELECT count(*) INTO v_final_count
  FROM supabase_migrations.schema_migrations
  WHERE (version, name) IN (
    ('20260728150000', 'add_completed_bill_corrections'),
    ('20260728153000', 'reconcile_completed_bill_financial_reporting'),
    ('20260729003007', 'index_completed_bill_correction_foreign_keys')
  );
  IF v_final_count <> 3 THEN
    RAISE EXCEPTION
      'STAGING_HISTORY_REPAIR_POSTCONDITION: expected 3, found %',
      v_final_count;
  END IF;
END
$repair$;

COMMIT;

SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE name IN (
  'add_completed_bill_corrections',
  'reconcile_completed_bill_financial_reporting',
  'index_completed_bill_correction_foreign_keys'
)
ORDER BY version;
