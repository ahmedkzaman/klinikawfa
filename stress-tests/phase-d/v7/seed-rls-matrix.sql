-- =============================================================================
-- Phase-D RLS matrix fixture seed (v7). Schema-correct and fail-closed.
--
-- Fixes over v6:
--   * consultations gets required queue_entry_id.
--   * clinic_appointments gets appointment_date + appointment_time.
--   * consultation_items gets required item_name.
--   * payments gets required queue_entry_id + payment_method.
--   * panel_claims drops non-existent consultation_id; provides claim_no,
--     panel_id, patient_id.
--   * Supporting queue_entries + insurance_providers fixtures added so all
--     NOT NULL/FK constraints resolve deterministically.
--
-- Internal guard: refuses unless the locked database-side staging marker
-- exists and equals the runner's externally guarded STAGING_PROJECT_REF.
-- =============================================================================

\set ON_ERROR_STOP on

-- psql variables are not expanded inside dollar-quoted PL/pgSQL blocks.
-- Copy the externally guarded ref into a session setting before entering the
-- block, then compare the two independently supplied settings there.
SELECT set_config('app.claimed_staging_project_ref', :'STAGING_PROJECT_REF', false);

DO $guard$
DECLARE
  marker  text;
  claimed text := current_setting('app.claimed_staging_project_ref', true);
BEGIN
  IF to_regclass('rls_test_support.environment_marker') IS NULL THEN
    RAISE EXCEPTION 'seed refused: locked staging environment marker is missing';
  END IF;
  EXECUTE 'SELECT project_ref FROM rls_test_support.environment_marker WHERE singleton = true'
    INTO marker;
  IF marker IS NULL OR marker = '' THEN
    RAISE EXCEPTION 'seed refused: locked staging environment marker is empty';
  END IF;
  IF marker <> claimed THEN
    RAISE EXCEPTION 'seed refused: database marker does not match guarded STAGING_PROJECT_REF';
  END IF;
  IF marker !~ '^[a-z0-9]{20}$' THEN
    RAISE EXCEPTION 'seed refused: project ref does not match ^[a-z0-9]{20}$';
  END IF;
  IF marker = 'ncysmppzfjtiekfnomdv' THEN
    RAISE EXCEPTION 'seed refused: project ref equals production ref';
  END IF;
END
$guard$;

BEGIN;

-- Materialize the regex-validated runner UUID variables outside PL/pgSQL so
-- psql can substitute them. The temporary table disappears at COMMIT.
CREATE TEMP TABLE _rls_fixture_actor_ids (
  uid uuid PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO _rls_fixture_actor_ids (uid) VALUES
  (:'RLS_LOCUM_UID'::uuid),
  (:'RLS_RESIDENT_UID'::uuid),
  (:'RLS_STAFF_UID'::uuid),
  (:'RLS_OPS_UID'::uuid),
  (:'RLS_OPS_STAFF_UID'::uuid),
  (:'RLS_DOCTOR_ADMIN_UID'::uuid),
  (:'RLS_ADMIN_UID'::uuid),
  (:'RLS_SPECIAL_ADMIN_UID'::uuid),
  (:'RLS_GUEST_UID'::uuid);

-- -----------------------------------------------------------------------------
-- Reserved fixture identifiers (hex-only UUIDs).
--   doctors:              d0c0aaaa/d0c0bbbb-...
--   patients:              babeaaaa/babebbbb-...
--   queue_entries:         90e0aaaa/90e0bbbb/90e0cccc-...   (v7)
--   consultations:         c0f0aaaa/c0f0bbbb plus c0f0cccc abuse ID
--   clinic_appointments:   a99caaaa/a99cbbbb-...
--   consultation_items:    dead0001/dead0002/dead000f-...
--   payments:              fee00001/fee00002/fee0000f-...
--   insurance_providers:   9a11e100-...             (v7)
--   panel_claims:          c1a10001-...
-- -----------------------------------------------------------------------------

-- Refuse to overwrite existing rows or reuse accounts that already have roles.
-- This makes cleanup safe: the nine accounts are proven dedicated to this run.
DO $fixture_preflight$
DECLARE
  existing_roles integer;
  existing_rows  integer;
BEGIN
  SELECT count(*) INTO existing_roles
    FROM public.user_roles
   WHERE user_id IN (SELECT uid FROM _rls_fixture_actor_ids);

  IF existing_roles <> 0 THEN
    RAISE EXCEPTION
      'seed refused: the dedicated RLS test accounts already have % user_roles row(s)',
      existing_roles;
  END IF;

  SELECT
      (SELECT count(*) FROM public.doctors WHERE id IN (
        'd0c0aaaa-0000-4000-8000-000000000001',
        'd0c0bbbb-0000-4000-8000-000000000002'))
    + (SELECT count(*) FROM public.patients WHERE id IN (
        'babeaaaa-0000-4000-8000-000000000001',
        'babebbbb-0000-4000-8000-000000000002'))
    + (SELECT count(*) FROM public.insurance_providers WHERE id =
        '9a11e100-0000-4000-8000-000000000001')
    + (SELECT count(*) FROM public.queue_entries WHERE id IN (
        '90e0aaaa-0000-4000-8000-000000000001',
        '90e0bbbb-0000-4000-8000-000000000002',
        '90e0cccc-0000-4000-8000-000000000003'))
    + (SELECT count(*) FROM public.consultations WHERE id IN (
        'c0f0aaaa-0000-4000-8000-000000000001',
        'c0f0bbbb-0000-4000-8000-000000000002',
        'c0f0cccc-0000-4000-8000-000000000003'))
    + (SELECT count(*) FROM public.clinic_appointments WHERE id IN (
        'a99caaaa-0000-4000-8000-000000000001',
        'a99cbbbb-0000-4000-8000-000000000002'))
    + (SELECT count(*) FROM public.consultation_items WHERE id IN (
        'dead0001-0000-4000-8000-000000000001',
        'dead0002-0000-4000-8000-000000000002',
        'dead000f-0000-4000-8000-00000000000f'))
    + (SELECT count(*) FROM public.payments WHERE id IN (
        'fee00001-0000-4000-8000-000000000001',
        'fee00002-0000-4000-8000-000000000002',
        'fee0000f-0000-4000-8000-00000000000f'))
    + (SELECT count(*) FROM public.panel_claims WHERE id =
        'c1a10001-0000-4000-8000-000000000001')
    INTO existing_rows;

  IF existing_rows <> 0 THEN
    RAISE EXCEPTION
      'seed refused: % reserved fixture row(s) already exist; run guarded cleanup and investigate first',
      existing_rows;
  END IF;
END
$fixture_preflight$;

-- User role assignments.
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
;

-- Doctors.
INSERT INTO public.doctors (id, user_id, name) VALUES
  ('d0c0aaaa-0000-4000-8000-000000000001', :'RLS_LOCUM_UID'::uuid,    'RLS Fixture Locum'),
  ('d0c0bbbb-0000-4000-8000-000000000002', :'RLS_RESIDENT_UID'::uuid, 'RLS Fixture Resident')
;

-- Patients.
INSERT INTO public.patients (id, name) VALUES
  ('babeaaaa-0000-4000-8000-000000000001', 'RLS Fixture Patient A'),
  ('babebbbb-0000-4000-8000-000000000002', 'RLS Fixture Patient B')
;

-- Insurance provider (panel) — required by panel_claims.panel_id.
INSERT INTO public.insurance_providers (id, name) VALUES
  ('9a11e100-0000-4000-8000-000000000001', 'RLS Fixture Panel')
;

-- Queue entries — required by consultations.queue_entry_id and payments.queue_entry_id.
INSERT INTO public.queue_entries (id, patient_id) VALUES
  ('90e0aaaa-0000-4000-8000-000000000001', 'babeaaaa-0000-4000-8000-000000000001'),
  ('90e0bbbb-0000-4000-8000-000000000002', 'babebbbb-0000-4000-8000-000000000002'),
  ('90e0cccc-0000-4000-8000-000000000003', 'babebbbb-0000-4000-8000-000000000002')
;

-- Consultations.
INSERT INTO public.consultations (id, queue_entry_id, doctor_id, patient_id) VALUES
  ('c0f0aaaa-0000-4000-8000-000000000001',
   '90e0aaaa-0000-4000-8000-000000000001',
   'd0c0aaaa-0000-4000-8000-000000000001',
   'babeaaaa-0000-4000-8000-000000000001'),
  ('c0f0bbbb-0000-4000-8000-000000000002',
   '90e0bbbb-0000-4000-8000-000000000002',
   'd0c0bbbb-0000-4000-8000-000000000002',
   'babebbbb-0000-4000-8000-000000000002')
;

-- clinic_appointments (date + time required).
INSERT INTO public.clinic_appointments
  (id, doctor_id, patient_id, appointment_date, appointment_time)
VALUES
  ('a99caaaa-0000-4000-8000-000000000001',
   'd0c0aaaa-0000-4000-8000-000000000001',
   'babeaaaa-0000-4000-8000-000000000001',
   DATE '2099-01-01', TIME '09:00:00'),
  ('a99cbbbb-0000-4000-8000-000000000002',
   'd0c0bbbb-0000-4000-8000-000000000002',
   'babebbbb-0000-4000-8000-000000000002',
   DATE '2099-01-01', TIME '10:00:00')
;

-- consultation_items (item_name required).
INSERT INTO public.consultation_items (id, consultation_id, item_name, deleted_at, deleted_by) VALUES
  ('dead0001-0000-4000-8000-000000000001',
   'c0f0aaaa-0000-4000-8000-000000000001', 'RLS Fixture Item A', NULL, NULL),
  ('dead0002-0000-4000-8000-000000000002',
   'c0f0bbbb-0000-4000-8000-000000000002', 'RLS Fixture Item B', NULL, NULL),
  ('dead000f-0000-4000-8000-00000000000f',
   'c0f0aaaa-0000-4000-8000-000000000001', 'RLS Fixture Item Voided',
   now(), :'RLS_SPECIAL_ADMIN_UID'::uuid)
;

-- payments (queue_entry_id + payment_method required).
INSERT INTO public.payments
  (id, queue_entry_id, consultation_id, payment_method, deleted_at, deleted_by)
VALUES
  ('fee00001-0000-4000-8000-000000000001',
   '90e0aaaa-0000-4000-8000-000000000001',
   'c0f0aaaa-0000-4000-8000-000000000001', 'cash', NULL, NULL),
  ('fee00002-0000-4000-8000-000000000002',
   '90e0bbbb-0000-4000-8000-000000000002',
   'c0f0bbbb-0000-4000-8000-000000000002', 'cash', NULL, NULL),
  ('fee0000f-0000-4000-8000-00000000000f',
   '90e0aaaa-0000-4000-8000-000000000001',
   'c0f0aaaa-0000-4000-8000-000000000001', 'cash',
   now(), :'RLS_SPECIAL_ADMIN_UID'::uuid)
;

-- panel_claims (claim_no + panel_id + patient_id required; no consultation_id column).
INSERT INTO public.panel_claims (id, claim_no, panel_id, patient_id, queue_entry_id) VALUES
  ('c1a10001-0000-4000-8000-000000000001',
   'RLS-FIX-0001',
   '9a11e100-0000-4000-8000-000000000001',
   'babeaaaa-0000-4000-8000-000000000001',
   '90e0aaaa-0000-4000-8000-000000000001')
;

COMMIT;
