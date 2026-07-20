-- =============================================================================
-- Phase-D RLS matrix fixture cleanup. Deletes ONLY the reserved fixture IDs.
-- Same internal guard as the seed.
-- =============================================================================

\set ON_ERROR_STOP on

SELECT set_config(
  'app.rls_claimed_staging_ref', :'STAGING_PROJECT_REF', false
) AS guard_claimed_ref
\gset
SELECT set_config(
  'app.rls_production_ref', :'PRODUCTION_PROJECT_REF', false
) AS guard_production_ref
\gset

DO $guard$
DECLARE
  marker           text := current_setting('app.staging_project_ref', true);
  claimed          text := current_setting('app.rls_claimed_staging_ref', true);
  production       text := current_setting('app.rls_production_ref', true);
  known_production constant text := 'ncysmppzfjtiekfnomdv';
BEGIN
  IF marker IS NULL OR marker = '' THEN
    RAISE EXCEPTION 'cleanup refused: app.staging_project_ref not set via PGOPTIONS';
  END IF;
  IF marker <> claimed THEN
    RAISE EXCEPTION 'cleanup refused: PGOPTIONS marker does not match STAGING_PROJECT_REF psql var';
  END IF;
  IF marker !~ '^[a-z0-9]{20}$' THEN
    RAISE EXCEPTION 'cleanup refused: project ref does not match ^[a-z0-9]{20}$';
  END IF;
  IF production IS DISTINCT FROM known_production
     OR marker = known_production THEN
    RAISE EXCEPTION 'cleanup refused: project ref equals production ref';
  END IF;
END
$guard$;

BEGIN;

DELETE FROM public.website_page_drafts WHERE page_id IN (
  'cafe5005-0000-4000-8000-000000000002',
  'cafe5005-0000-4000-8000-000000000003',
  'cafe5005-0000-4000-8000-000000000005'
);

DELETE FROM public.website_pages WHERE id IN (
  'cafe5005-0000-4000-8000-000000000001',
  'cafe5005-0000-4000-8000-000000000002',
  'cafe5005-0000-4000-8000-000000000003',
  'cafe5005-0000-4000-8000-000000000005'
);

DELETE FROM public.clinic_reviews WHERE id IN (
  'cafe5005-0000-4000-8000-000000000004'
);

DELETE FROM public.panel_claims        WHERE id IN ('c1a10001-0000-4000-8000-000000000001');

DELETE FROM public.payments            WHERE id IN (
  'fee00001-0000-4000-8000-000000000001',
  'fee00002-0000-4000-8000-000000000002',
  'fee0000f-0000-4000-8000-00000000000f'
);

DELETE FROM public.consultation_items  WHERE id IN (
  'dead0001-0000-4000-8000-000000000001',
  'dead0002-0000-4000-8000-000000000002',
  'dead000f-0000-4000-8000-00000000000f'
);

DELETE FROM public.clinic_appointments WHERE id IN (
  'a99caaaa-0000-4000-8000-000000000001',
  'a99cbbbb-0000-4000-8000-000000000002'
);

DELETE FROM public.consultations       WHERE id IN (
  'c0f0aaaa-0000-4000-8000-000000000001',
  'c0f0bbbb-0000-4000-8000-000000000002'
);

DELETE FROM public.patients            WHERE id IN (
  'babeaaaa-0000-4000-8000-000000000001',
  'babebbbb-0000-4000-8000-000000000002'
);

DELETE FROM public.doctors             WHERE id IN (
  'd0c0aaaa-0000-4000-8000-000000000001',
  'd0c0bbbb-0000-4000-8000-000000000002'
);

-- Remove every exact role row inserted by seed. The pre-existing, separately
-- verified Website Editor role is intentionally not a seed-owned row.
DELETE FROM public.user_roles
 WHERE (user_id, role::text) IN (
   (:'RLS_LOCUM_UID'::uuid,         'locum'),
   (:'RLS_RESIDENT_UID'::uuid,      'resident_doctor'),
   (:'RLS_STAFF_UID'::uuid,         'staff'),
   (:'RLS_OPS_UID'::uuid,           'operations'),
   (:'RLS_OPS_STAFF_UID'::uuid,     'ops_staff'),
   (:'RLS_DOCTOR_ADMIN_UID'::uuid,  'doctor_admin'),
   (:'RLS_ADMIN_UID'::uuid,         'admin'),
   (:'RLS_SPECIAL_ADMIN_UID'::uuid, 'special_admin'),
   (:'RLS_GUEST_UID'::uuid,         'guest')
 );

COMMIT;
