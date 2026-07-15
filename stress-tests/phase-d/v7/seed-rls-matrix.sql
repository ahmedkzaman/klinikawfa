-- =============================================================================
-- Phase-D RLS matrix fixture seed (v7). Schema-correct; idempotent.
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
-- Internal guard: refuses unless the runner exports
--   PGOPTIONS="-c app.staging_project_ref=<staging_ref>"
-- and passes -v STAGING_PROJECT_REF=<same_ref>.
-- =============================================================================

\set ON_ERROR_STOP on

DO $guard$
DECLARE
  marker  text := current_setting('app.staging_project_ref', true);
  claimed text := :'STAGING_PROJECT_REF';
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
  IF marker = 'ncysmppzfjtiekfnomdv' THEN
    RAISE EXCEPTION 'seed refused: project ref equals production ref';
  END IF;
END
$guard$;

BEGIN;

-- -----------------------------------------------------------------------------
-- Reserved fixture identifiers (hex-only UUIDs).
--   doctors:              d0c0aaaa/d0c0bbbb-...
--   patients:              babeaaaa/babebbbb-...
--   queue_entries:         90e0aaaa/90e0bbbb-...   (v7)
--   consultations:         c0f0aaaa/c0f0bbbb-...
--   clinic_appointments:   a99caaaa/a99cbbbb-...
--   consultation_items:    dead0001/dead0002/dead000f-...
--   payments:              fee00001/fee00002/fee0000f-...
--   insurance_providers:   9a11e100-...             (v7)
--   panel_claims:          c1a10001-...
-- -----------------------------------------------------------------------------

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
ON CONFLICT (user_id, role) DO NOTHING;

-- Doctors.
INSERT INTO public.doctors (id, user_id, name) VALUES
  ('d0c0aaaa-0000-4000-8000-000000000001', :'RLS_LOCUM_UID'::uuid,    'RLS Fixture Locum'),
  ('d0c0bbbb-0000-4000-8000-000000000002', :'RLS_RESIDENT_UID'::uuid, 'RLS Fixture Resident')
ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id;

-- Patients.
INSERT INTO public.patients (id, name) VALUES
  ('babeaaaa-0000-4000-8000-000000000001', 'RLS Fixture Patient A'),
  ('babebbbb-0000-4000-8000-000000000002', 'RLS Fixture Patient B')
ON CONFLICT (id) DO NOTHING;

-- Insurance provider (panel) — required by panel_claims.panel_id.
INSERT INTO public.insurance_providers (id, name) VALUES
  ('9a11e100-0000-4000-8000-000000000001', 'RLS Fixture Panel')
ON CONFLICT (id) DO NOTHING;

-- Queue entries — required by consultations.queue_entry_id and payments.queue_entry_id.
INSERT INTO public.queue_entries (id, patient_id) VALUES
  ('90e0aaaa-0000-4000-8000-000000000001', 'babeaaaa-0000-4000-8000-000000000001'),
  ('90e0bbbb-0000-4000-8000-000000000002', 'babebbbb-0000-4000-8000-000000000002')
ON CONFLICT (id) DO NOTHING;

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
ON CONFLICT (id) DO NOTHING;

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
ON CONFLICT (id) DO NOTHING;

-- consultation_items (item_name required).
INSERT INTO public.consultation_items (id, consultation_id, item_name, deleted_at, deleted_by) VALUES
  ('dead0001-0000-4000-8000-000000000001',
   'c0f0aaaa-0000-4000-8000-000000000001', 'RLS Fixture Item A', NULL, NULL),
  ('dead0002-0000-4000-8000-000000000002',
   'c0f0bbbb-0000-4000-8000-000000000002', 'RLS Fixture Item B', NULL, NULL),
  ('dead000f-0000-4000-8000-00000000000f',
   'c0f0aaaa-0000-4000-8000-000000000001', 'RLS Fixture Item Voided',
   now(), :'RLS_SPECIAL_ADMIN_UID'::uuid)
ON CONFLICT (id) DO NOTHING;

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
ON CONFLICT (id) DO NOTHING;

-- panel_claims (claim_no + panel_id + patient_id required; no consultation_id column).
INSERT INTO public.panel_claims (id, claim_no, panel_id, patient_id, queue_entry_id) VALUES
  ('c1a10001-0000-4000-8000-000000000001',
   'RLS-FIX-0001',
   '9a11e100-0000-4000-8000-000000000001',
   'babeaaaa-0000-4000-8000-000000000001',
   '90e0aaaa-0000-4000-8000-000000000001')
ON CONFLICT (id) DO NOTHING;

COMMIT;
