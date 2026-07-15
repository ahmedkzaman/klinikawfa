-- =============================================================================
-- Phase-D RLS matrix fixture cleanup. Deletes ONLY the reserved fixture IDs.
-- Same internal guard as the seed.
-- =============================================================================

\set ON_ERROR_STOP on

DO $guard$
DECLARE
  marker  text := current_setting('app.staging_project_ref', true);
  claimed text := :'STAGING_PROJECT_REF';
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
  IF marker = 'ncysmppzfjtiekfnomdv' THEN
    RAISE EXCEPTION 'cleanup refused: project ref equals production ref';
  END IF;
END
$guard$;

BEGIN;

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

-- user_roles: remove only the reserved-account rows created by seed.
DELETE FROM public.user_roles
 WHERE user_id::text = current_setting('app.staging_project_ref', true) -- never matches; placeholder
    OR user_id IN (
      -- These UIDs come from psql -v, expanded before execution.
      NULLIF(:'RLS_SPECIAL_ADMIN_UID','')::uuid
    );

COMMIT;
