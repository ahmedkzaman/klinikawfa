-- =============================================================================
-- Phase-D RLS matrix fixture seed. Requires clean reserved IDs; stale CMS
-- fixtures fail closed and must be cleaned before a later approved run.
--
-- Internal guard: refuses to run unless the runner has exported
--   PGOPTIONS="-c app.staging_project_ref=<staging_ref>"
-- and passed -v STAGING_PROJECT_REF=<same_ref>. Both must match, must satisfy
-- ^[a-z0-9]{20}$, and must NOT equal the production ref.
--
-- All fixture UUIDs are hex-only. No real auth UIDs are hard-coded; the
-- runner passes them via -v RLS_*_UID.
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
    RAISE EXCEPTION 'seed refused: app.staging_project_ref not set via PGOPTIONS';
  END IF;
  IF marker <> claimed THEN
    RAISE EXCEPTION 'seed refused: PGOPTIONS marker does not match STAGING_PROJECT_REF psql var';
  END IF;
  IF marker !~ '^[a-z0-9]{20}$' THEN
    RAISE EXCEPTION 'seed refused: project ref does not match ^[a-z0-9]{20}$';
  END IF;
  IF production IS DISTINCT FROM known_production
     OR marker = known_production THEN
    RAISE EXCEPTION 'seed refused: project ref equals production ref';
  END IF;
END
$guard$;

BEGIN;

-- -----------------------------------------------------------------------------
-- Reserved fixture identifiers (hex-only UUIDs).
-- -----------------------------------------------------------------------------
-- Doctors
--   locum    : d0c0aaaa-0000-4000-8000-000000000001
--   resident : d0c0bbbb-0000-4000-8000-000000000002
-- Patients
--   A        : babeaaaa-0000-4000-8000-000000000001
--   B        : babebbbb-0000-4000-8000-000000000002
-- Consultations
--   locum    : c0f0aaaa-0000-4000-8000-000000000001
--   resident : c0f0bbbb-0000-4000-8000-000000000002
-- clinic_appointments
--   locum    : a99caaaa-0000-4000-8000-000000000001
--   resident : a99cbbbb-0000-4000-8000-000000000002
-- consultation_items
--   locum-active : dead0001-0000-4000-8000-000000000001
--   resident-active : dead0002-0000-4000-8000-000000000002
--   locum-voided : dead000f-0000-4000-8000-00000000000f
-- payments
--   locum-active : fee00001-0000-4000-8000-000000000001
--   resident-active : fee00002-0000-4000-8000-000000000002
--   locum-voided : fee0000f-0000-4000-8000-00000000000f
-- panel_claims
--   claim    : c1a10001-0000-4000-8000-000000000001
-- Website CMS
--   published page       : cafe5005-0000-4000-8000-000000000001
--   page with draft      : cafe5005-0000-4000-8000-000000000002
--   draft INSERT target  : cafe5005-0000-4000-8000-000000000003
--   private clinic review: cafe5005-0000-4000-8000-000000000004

-- -----------------------------------------------------------------------------
-- User role assignments (one row per dedicated account).
-- -----------------------------------------------------------------------------
INSERT INTO public.user_roles (user_id, role) VALUES
  (:'RLS_LOCUM_UID'::uuid,         'locum'),
  (:'RLS_RESIDENT_UID'::uuid,      'resident_doctor'),
  (:'RLS_STAFF_UID'::uuid,         'staff'),
  (:'RLS_OPS_UID'::uuid,           'operations'),
  (:'RLS_OPS_STAFF_UID'::uuid,     'ops_staff'),
  (:'RLS_DOCTOR_ADMIN_UID'::uuid,  'doctor_admin'),
  (:'RLS_ADMIN_UID'::uuid,         'admin'),
  (:'RLS_SPECIAL_ADMIN_UID'::uuid, 'special_admin'),
  (:'RLS_GUEST_UID'::uuid,         'guest')
ON CONFLICT (user_id, role) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Doctors: one locum + one resident, linked to the corresponding auth UIDs.
-- -----------------------------------------------------------------------------
INSERT INTO public.doctors (id, user_id, name)
VALUES
  ('d0c0aaaa-0000-4000-8000-000000000001', :'RLS_LOCUM_UID'::uuid,    'RLS Fixture Locum'),
  ('d0c0bbbb-0000-4000-8000-000000000002', :'RLS_RESIDENT_UID'::uuid, 'RLS Fixture Resident')
ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id;

-- -----------------------------------------------------------------------------
-- Patients (minimal).
-- -----------------------------------------------------------------------------
INSERT INTO public.patients (id, name)
VALUES
  ('babeaaaa-0000-4000-8000-000000000001', 'RLS Fixture Patient A'),
  ('babebbbb-0000-4000-8000-000000000002', 'RLS Fixture Patient B')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Website CMS evidence. Deliberately no ON CONFLICT: stale fixtures fail closed
-- instead of allowing a false-positive matrix run.
-- -----------------------------------------------------------------------------
INSERT INTO public.website_pages (
  id, kind, slug, published_content, status, revision,
  published_at, published_by
)
VALUES
  (
    'cafe5005-0000-4000-8000-000000000001',
    'content',
    'rls-matrix-published-page',
    '{"title":"RLS matrix published","body":"Public fixture"}'::jsonb,
    'published',
    1,
    now(),
    :'RLS_WEBSITE_EDITOR_UID'::uuid
  ),
  (
    'cafe5005-0000-4000-8000-000000000002',
    'content',
    'rls-matrix-private-draft',
    '{}'::jsonb,
    'draft',
    0,
    NULL,
    NULL
  ),
  (
    'cafe5005-0000-4000-8000-000000000003',
    'content',
    'rls-matrix-insert-target',
    '{}'::jsonb,
    'draft',
    0,
    NULL,
    NULL
  );

INSERT INTO public.website_page_drafts (
  page_id, draft_content, base_revision, updated_by
)
VALUES (
  'cafe5005-0000-4000-8000-000000000002',
  '{"title":"RLS matrix private draft"}'::jsonb,
  0,
  :'RLS_WEBSITE_EDITOR_UID'::uuid
);

INSERT INTO public.clinic_reviews (
  id, patient_id, patient_name, rating, review_text, status
)
VALUES (
  'cafe5005-0000-4000-8000-000000000004',
  'babeaaaa-0000-4000-8000-000000000001',
  'RLS Fixture Patient A',
  5,
  'RLS matrix private review',
  'pending'
);

-- -----------------------------------------------------------------------------
-- Consultations.
-- -----------------------------------------------------------------------------
INSERT INTO public.consultations (id, doctor_id, patient_id)
VALUES
  ('c0f0aaaa-0000-4000-8000-000000000001',
   'd0c0aaaa-0000-4000-8000-000000000001',
   'babeaaaa-0000-4000-8000-000000000001'),
  ('c0f0bbbb-0000-4000-8000-000000000002',
   'd0c0bbbb-0000-4000-8000-000000000002',
   'babebbbb-0000-4000-8000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- clinic_appointments.
-- -----------------------------------------------------------------------------
INSERT INTO public.clinic_appointments (id, doctor_id, patient_id)
VALUES
  ('a99caaaa-0000-4000-8000-000000000001',
   'd0c0aaaa-0000-4000-8000-000000000001',
   'babeaaaa-0000-4000-8000-000000000001'),
  ('a99cbbbb-0000-4000-8000-000000000002',
   'd0c0bbbb-0000-4000-8000-000000000002',
   'babebbbb-0000-4000-8000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- consultation_items (2 active + 1 voided).
-- -----------------------------------------------------------------------------
INSERT INTO public.consultation_items (id, consultation_id, deleted_at, deleted_by)
VALUES
  ('dead0001-0000-4000-8000-000000000001',
   'c0f0aaaa-0000-4000-8000-000000000001', NULL, NULL),
  ('dead0002-0000-4000-8000-000000000002',
   'c0f0bbbb-0000-4000-8000-000000000002', NULL, NULL),
  ('dead000f-0000-4000-8000-00000000000f',
   'c0f0aaaa-0000-4000-8000-000000000001', now(), :'RLS_SPECIAL_ADMIN_UID'::uuid)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- payments (2 active + 1 voided).
-- -----------------------------------------------------------------------------
INSERT INTO public.payments (id, consultation_id, deleted_at, deleted_by)
VALUES
  ('fee00001-0000-4000-8000-000000000001',
   'c0f0aaaa-0000-4000-8000-000000000001', NULL, NULL),
  ('fee00002-0000-4000-8000-000000000002',
   'c0f0bbbb-0000-4000-8000-000000000002', NULL, NULL),
  ('fee0000f-0000-4000-8000-00000000000f',
   'c0f0aaaa-0000-4000-8000-000000000001', now(), :'RLS_SPECIAL_ADMIN_UID'::uuid)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- panel_claims.
-- -----------------------------------------------------------------------------
INSERT INTO public.panel_claims (id, consultation_id)
VALUES
  ('c1a10001-0000-4000-8000-000000000001',
   'c0f0aaaa-0000-4000-8000-000000000001')
ON CONFLICT (id) DO NOTHING;

COMMIT;
