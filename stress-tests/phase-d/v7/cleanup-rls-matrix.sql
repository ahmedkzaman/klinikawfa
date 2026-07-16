-- =============================================================================
-- Phase-D RLS matrix fixture cleanup (v7). Deletes ONLY reserved fixture rows
-- in correct FK order. Removes each seeded (user_id, role) pair exactly.
-- Same internal guard as the seed.
-- =============================================================================

\set ON_ERROR_STOP on

-- psql variables are not expanded inside dollar-quoted PL/pgSQL blocks.
SELECT set_config('app.claimed_staging_project_ref', :'STAGING_PROJECT_REF', false);

DO $guard$
DECLARE
  marker  text;
  claimed text := current_setting('app.claimed_staging_project_ref', true);
BEGIN
  IF to_regclass('rls_test_support.environment_marker') IS NULL THEN
    RAISE EXCEPTION 'cleanup refused: locked staging environment marker is missing';
  END IF;
  EXECUTE 'SELECT project_ref FROM rls_test_support.environment_marker WHERE singleton = true'
    INTO marker;
  IF marker IS NULL OR marker = '' THEN
    RAISE EXCEPTION 'cleanup refused: locked staging environment marker is empty';
  END IF;
  IF marker <> claimed THEN
    RAISE EXCEPTION 'cleanup refused: database marker does not match guarded STAGING_PROJECT_REF';
  END IF;
  IF marker !~ '^[a-z0-9]{20}$' THEN
    RAISE EXCEPTION 'cleanup refused: project ref does not match ^[a-z0-9]{20}$';
  END IF;
  IF marker = 'ncysmppzfjtiekfnomdv' THEN
    RAISE EXCEPTION 'cleanup refused: project ref equals production ref';
  END IF;
END
$guard$;

BEGIN;

-- FK order: panel_claims → payments → consultation_items → clinic_appointments
--        → consultations (incl. reserved abuse UUID) → queue_entries (incl.
--        reserved abuse queue_entry) → insurance_providers → patients
--        → doctors → user_roles (ALL rows for the nine test UIDs).

DELETE FROM public.panel_claims WHERE id IN (
  'c1a10001-0000-4000-8000-000000000001'
);

DELETE FROM public.payments WHERE id IN (
  'fee00001-0000-4000-8000-000000000001',
  'fee00002-0000-4000-8000-000000000002',
  'fee0000f-0000-4000-8000-00000000000f'
);

DELETE FROM public.consultation_items WHERE id IN (
  'dead0001-0000-4000-8000-000000000001',
  'dead0002-0000-4000-8000-000000000002',
  'dead000f-0000-4000-8000-00000000000f'
);

DELETE FROM public.clinic_appointments WHERE id IN (
  'a99caaaa-0000-4000-8000-000000000001',
  'a99cbbbb-0000-4000-8000-000000000002'
);

-- Reserved insert-abuse consultation UUID: removed unconditionally in case a
-- broken RLS policy allowed the insertion.
DELETE FROM public.consultations WHERE id IN (
  'c0f0aaaa-0000-4000-8000-000000000001',
  'c0f0bbbb-0000-4000-8000-000000000002',
  'c0f0cccc-0000-4000-8000-000000000003'
);

DELETE FROM public.queue_entries WHERE id IN (
  '90e0aaaa-0000-4000-8000-000000000001',
  '90e0bbbb-0000-4000-8000-000000000002',
  '90e0cccc-0000-4000-8000-000000000003'
);

DELETE FROM public.insurance_providers WHERE id IN (
  '9a11e100-0000-4000-8000-000000000001'
);

DELETE FROM public.patients WHERE id IN (
  'babeaaaa-0000-4000-8000-000000000001',
  'babebbbb-0000-4000-8000-000000000002'
);

DELETE FROM public.doctors WHERE id IN (
  'd0c0aaaa-0000-4000-8000-000000000001',
  'd0c0bbbb-0000-4000-8000-000000000002'
);

-- Delete EVERY user_roles row belonging to the nine dedicated RLS test UIDs
-- regardless of role. If a privilege-escalation exploit slipped a
-- 'special_admin' row onto one of these accounts, cleanup must not leave
-- it behind. NULLIF guards against an empty psql variable (unset → NULL).
DELETE FROM public.user_roles WHERE user_id IN (
  NULLIF(:'RLS_LOCUM_UID','')::uuid,
  NULLIF(:'RLS_RESIDENT_UID','')::uuid,
  NULLIF(:'RLS_STAFF_UID','')::uuid,
  NULLIF(:'RLS_OPS_UID','')::uuid,
  NULLIF(:'RLS_OPS_STAFF_UID','')::uuid,
  NULLIF(:'RLS_DOCTOR_ADMIN_UID','')::uuid,
  NULLIF(:'RLS_ADMIN_UID','')::uuid,
  NULLIF(:'RLS_SPECIAL_ADMIN_UID','')::uuid,
  NULLIF(:'RLS_GUEST_UID','')::uuid
);

COMMIT;
