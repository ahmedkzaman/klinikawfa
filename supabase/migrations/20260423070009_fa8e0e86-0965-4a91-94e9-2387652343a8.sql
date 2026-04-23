
-- =============================================================
-- B.0 Consolidated Clinic Flow schema (clinic-prefixed where needed to avoid collisions)
-- =============================================================

-- Note: existing klinikawfa app_role enum already has admin/staff/guest.
-- B.1 will extend it with special_admin/operations.
-- Helpers (is_special_admin, is_ops_or_admin, get_doctor_id_for_user) created in B.1.
-- Therefore RLS policies in this migration must use has_role(uid, 'admin') as a fallback
-- for now and will be augmented in B.1. To avoid that complication, we will reference
-- has_role() with role text casts wrapped in a CASE that gracefully handles missing roles
-- via a transitional helper.
--
-- Strategy: create a LOCAL transitional has_role-style policy using the existing has_role
-- function with role param 'admin' until enum is extended. After B.1 we'll widen them.
-- Simpler: gate writes on existing is_admin OR is_staff_or_admin, then in B.1 we DROP these
-- and re-create with the new helpers. To keep this single-pass and clean, defer all
-- write-policy creation to B.1 (after helpers exist).
--
-- This migration creates: tables + SELECT policies (authenticated read) + indexes + triggers.
-- Write policies are added in B.1 once is_special_admin / is_ops_or_admin exist.

-- ---- Enums (clinic_status used by queue_entries; appointment status used by clinic_appointments)
DO $$ BEGIN
  CREATE TYPE public.clinic_status AS ENUM (
    'registered','ready_for_doctor','on_hold','with_doctor',
    'sent_to_dispensary','dispensing_payment','completed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.clinic_appointment_status AS ENUM (
    'scheduled','confirmed','in_progress','completed','cancelled','no_show'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---- patients (clinic-floor patient master)
CREATE TABLE public.patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  national_id TEXT,
  date_of_birth DATE,
  gender TEXT,
  state_of_birth TEXT,
  allergies TEXT,
  underlying_conditions TEXT,
  registration_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX idx_patients_national_id_unique ON public.patients (national_id) WHERE national_id IS NOT NULL;
CREATE INDEX idx_patients_phone ON public.patients (phone) WHERE phone IS NOT NULL;

-- ---- doctors (clinic-floor doctor roster, links to existing auth.users)
CREATE TABLE public.doctors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  avatar_url TEXT,
  on_duty BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_doctors_user_id ON public.doctors (user_id);

-- ---- rooms
CREATE TABLE public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

-- ---- room_assignments
CREATE TABLE public.room_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID REFERENCES public.doctors(id) ON DELETE CASCADE NOT NULL,
  room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (doctor_id),
  UNIQUE (room_id)
);
ALTER TABLE public.room_assignments ENABLE ROW LEVEL SECURITY;

-- ---- queue_entries (CORE)
CREATE SEQUENCE IF NOT EXISTS public.queue_number_seq START WITH 1001;

CREATE TABLE public.queue_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
  clinic_status public.clinic_status NOT NULL DEFAULT 'registered',
  assigned_doctor_id UUID REFERENCES public.doctors(id) ON DELETE SET NULL,
  assigned_room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  called_by_doctor_id UUID REFERENCES public.doctors(id) ON DELETE SET NULL,
  called_at TIMESTAMPTZ,
  queue_number INTEGER DEFAULT nextval('public.queue_number_seq'),
  visit_purpose TEXT NOT NULL DEFAULT 'consultation',
  visit_notes TEXT,
  payment_method TEXT,
  is_urgent BOOLEAN NOT NULL DEFAULT false,
  doctor_remarks TEXT,
  -- Forensic linkage to klinikawfa public appointments (online booking source)
  source_appointment_id UUID NULL REFERENCES public.appointments(id) ON DELETE SET NULL,
  created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.queue_entries ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_queue_entries_status ON public.queue_entries (clinic_status);
CREATE INDEX idx_queue_entries_patient ON public.queue_entries (patient_id);
CREATE INDEX idx_queue_entries_source_appointment ON public.queue_entries (source_appointment_id) WHERE source_appointment_id IS NOT NULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.queue_entries;

-- ---- clinic_appointments (NOT the public appointments table — separate clinic-internal calendar)
CREATE TABLE public.clinic_appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
  doctor_id UUID REFERENCES public.doctors(id) ON DELETE SET NULL,
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  status public.clinic_appointment_status NOT NULL DEFAULT 'scheduled',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.clinic_appointments ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_clinic_appointments_date ON public.clinic_appointments (appointment_date);

-- ---- diagnoses
CREATE TABLE public.diagnoses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.diagnoses ENABLE ROW LEVEL SECURITY;

-- ---- consultations (will be soft-deletable in B.2)
CREATE TABLE public.consultations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_entry_id UUID NOT NULL REFERENCES public.queue_entries(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  case_note TEXT NOT NULL DEFAULT '',
  diagnosis_id UUID REFERENCES public.diagnoses(id) ON DELETE SET NULL,
  diagnosis_text TEXT NOT NULL DEFAULT '',
  dispense_note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'in_progress',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.consultations ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_consultations_queue ON public.consultations (queue_entry_id);
CREATE INDEX idx_consultations_patient ON public.consultations (patient_id);
ALTER PUBLICATION supabase_realtime ADD TABLE public.consultations;

-- ---- vital_signs
CREATE TABLE public.vital_signs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_entry_id UUID REFERENCES public.queue_entries(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  height_cm NUMERIC,
  weight_kg NUMERIC,
  temperature_c NUMERIC,
  bp_systolic INTEGER,
  bp_diastolic INTEGER,
  heart_rate INTEGER,
  spo2 NUMERIC,
  blood_glucose NUMERIC,
  respiratory_rate INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.vital_signs ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_vital_signs_patient ON public.vital_signs (patient_id);
ALTER PUBLICATION supabase_realtime ADD TABLE public.vital_signs;

-- ---- consultation_items (line items, soft-deletable in B.2)
CREATE TABLE public.consultation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id UUID NOT NULL REFERENCES public.consultations(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  dosage TEXT,
  price NUMERIC NOT NULL DEFAULT 0,
  price_tier TEXT,
  indication TEXT,
  dosage_qty NUMERIC,
  dosage_unit TEXT,
  frequency TEXT,
  instruction TEXT,
  duration TEXT,
  precaution TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.consultation_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_consultation_items_consultation ON public.consultation_items (consultation_id);

-- ---- inventory_locations
CREATE TABLE public.inventory_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  inventories TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory_locations ENABLE ROW LEVEL SECURITY;

-- ---- inventory_items (allocation column added in B.3)
CREATE TABLE public.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  generic_name TEXT,
  category TEXT NOT NULL DEFAULT 'Medication',
  groups TEXT,
  unit_of_measure TEXT,
  cost_price NUMERIC NOT NULL DEFAULT 0,
  price_to_patient_min NUMERIC NOT NULL DEFAULT 0,
  price_to_patient_max NUMERIC NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  stock_amount_warning INTEGER,
  stock_expiry_warning_days INTEGER NOT NULL DEFAULT 0,
  nearest_expiry_date DATE,
  latest_expiry_date DATE,
  remarks TEXT,
  dosage_instructions_enabled BOOLEAN NOT NULL DEFAULT false,
  dosage_instructions TEXT,
  location_id UUID REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_inventory_items_name ON public.inventory_items (name);

-- ---- inventory_item_prices
CREATE TABLE public.inventory_item_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  tier_key TEXT NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (item_id, tier_key)
);
ALTER TABLE public.inventory_item_prices ENABLE ROW LEVEL SECURITY;

-- ---- inventory_lists
CREATE TABLE public.inventory_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  total_item INTEGER NOT NULL DEFAULT 0,
  order_frequency TEXT,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory_lists ENABLE ROW LEVEL SECURITY;

-- ---- services
CREATE TABLE public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'Service',
  description TEXT,
  cost NUMERIC NOT NULL DEFAULT 0,
  price_to_patient NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

-- ---- packages
CREATE TABLE public.packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0,
  price NUMERIC NOT NULL DEFAULT 0,
  items JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;

-- ---- stock_takes
CREATE TABLE public.stock_takes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  user_name TEXT,
  inventories TEXT,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'in_progress',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.stock_takes ENABLE ROW LEVEL SECURITY;

-- ---- stock_take_counts
CREATE TABLE public.stock_take_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_take_id UUID NOT NULL REFERENCES public.stock_takes(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  actual_stock NUMERIC,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (stock_take_id, item_id)
);
ALTER TABLE public.stock_take_counts ENABLE ROW LEVEL SECURITY;

-- ---- panel_payment_methods
CREATE TABLE public.panel_payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  verify_link TEXT,
  price_tier TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.panel_payment_methods ENABLE ROW LEVEL SECURITY;

-- ---- self_pay_payment_methods
CREATE TABLE public.self_pay_payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  price_tier TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.self_pay_payment_methods ENABLE ROW LEVEL SECURITY;

-- ---- insurance_providers
CREATE TABLE public.insurance_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  price_tier TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  panel_type TEXT NOT NULL DEFAULT 'tpa',
  submission_preference TEXT NOT NULL DEFAULT 'bulk_claim',
  company_reg_number TEXT,
  company_name TEXT,
  panel_code TEXT,
  person_in_charge TEXT,
  phone TEXT,
  email TEXT,
  address_line_1 TEXT,
  address_line_2 TEXT,
  postcode TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  verification_type TEXT NOT NULL DEFAULT 'url',
  verification_link TEXT,
  claim_due_date_type TEXT,
  tin_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.insurance_providers ENABLE ROW LEVEL SECURITY;

-- ---- payments (soft-deletable in B.2)
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_entry_id UUID NOT NULL REFERENCES public.queue_entries(id) ON DELETE CASCADE,
  consultation_id UUID REFERENCES public.consultations(id) ON DELETE SET NULL,
  payment_type TEXT NOT NULL DEFAULT 'self_pay',
  payment_method TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_payments_queue ON public.payments (queue_entry_id);

-- ---- einvoices
CREATE TABLE public.einvoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_entry_id UUID NOT NULL REFERENCES public.queue_entries(id) ON DELETE CASCADE,
  consultation_id UUID REFERENCES public.consultations(id) ON DELETE SET NULL,
  lhdn_uuid TEXT,
  lhdn_long_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  submission_uid TEXT,
  error_details JSONB,
  invoice_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.einvoices ENABLE ROW LEVEL SECURITY;

-- ---- einvoice_credentials
CREATE TABLE public.einvoice_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.einvoice_credentials ENABLE ROW LEVEL SECURITY;

-- ---- clinic_reviews (separate from existing public reviews table)
CREATE TABLE public.clinic_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  patient_name TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT,
  source TEXT NOT NULL DEFAULT 'local',
  google_review_id TEXT,
  google_synced BOOLEAN NOT NULL DEFAULT false,
  whatsapp_sent BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.clinic_reviews ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX clinic_reviews_google_id_unique ON public.clinic_reviews (google_review_id) WHERE google_review_id IS NOT NULL;

-- ---- clinic_feedback_form_fields (separate from anything in klinikawfa)
CREATE TABLE public.clinic_feedback_form_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  field_type TEXT NOT NULL DEFAULT 'short_text',
  is_required BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.clinic_feedback_form_fields ENABLE ROW LEVEL SECURITY;

-- ---- clinic_preferences (key-value store for clinic settings)
CREATE TABLE public.clinic_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.clinic_preferences ENABLE ROW LEVEL SECURITY;

-- ---- user_activity_logs
CREATE TABLE public.user_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  user_name TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_activity_logs ENABLE ROW LEVEL SECURITY;

-- ---- user_permissions
CREATE TABLE public.user_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  permission_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, permission_key)
);
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

-- ---- google_business_tokens
CREATE TABLE public.google_business_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  business_account_id TEXT,
  location_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.google_business_tokens ENABLE ROW LEVEL SECURITY;

-- =============================================================
-- Updated_at triggers (using existing public.update_updated_at_column())
-- =============================================================
CREATE TRIGGER update_patients_updated_at BEFORE UPDATE ON public.patients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_doctors_updated_at BEFORE UPDATE ON public.doctors FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_queue_entries_updated_at BEFORE UPDATE ON public.queue_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_clinic_appointments_updated_at BEFORE UPDATE ON public.clinic_appointments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_diagnoses_updated_at BEFORE UPDATE ON public.diagnoses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_consultations_updated_at BEFORE UPDATE ON public.consultations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_vital_signs_updated_at BEFORE UPDATE ON public.vital_signs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_inventory_items_updated_at BEFORE UPDATE ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_einvoices_updated_at BEFORE UPDATE ON public.einvoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_google_business_tokens_updated_at BEFORE UPDATE ON public.google_business_tokens FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================
-- SELECT-only policies (write policies created in B.1 once helpers exist)
-- =============================================================
CREATE POLICY "Authenticated can read patients"               ON public.patients               FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can read doctors"                ON public.doctors                FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can read rooms"                  ON public.rooms                  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can read room_assignments"       ON public.room_assignments       FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can read queue_entries"          ON public.queue_entries          FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can read clinic_appointments"    ON public.clinic_appointments    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can read diagnoses"              ON public.diagnoses              FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can read consultations"          ON public.consultations          FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can read vital_signs"            ON public.vital_signs            FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can read consultation_items"     ON public.consultation_items     FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can read inventory_locations"    ON public.inventory_locations    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can read inventory_items"        ON public.inventory_items        FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can read inventory_item_prices"  ON public.inventory_item_prices  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can read inventory_lists"        ON public.inventory_lists        FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can read services"               ON public.services               FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can read packages"               ON public.packages               FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can read stock_takes"            ON public.stock_takes            FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can read stock_take_counts"      ON public.stock_take_counts      FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can read panel_payment_methods"  ON public.panel_payment_methods  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can read self_pay_payment_methods" ON public.self_pay_payment_methods FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can read insurance_providers"    ON public.insurance_providers    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can read payments"               ON public.payments               FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can read einvoices"              ON public.einvoices              FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can read clinic_reviews"         ON public.clinic_reviews         FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can read clinic_preferences"     ON public.clinic_preferences     FOR SELECT TO authenticated USING (true);

-- Public reads for caller-display + public review submission
CREATE POLICY "Public can read clinic_reviews active" ON public.clinic_reviews FOR SELECT USING (status = 'active');
CREATE POLICY "Anyone can read active feedback fields" ON public.clinic_feedback_form_fields FOR SELECT USING (is_active = true);
CREATE POLICY "Public can insert clinic_reviews with required fields"
  ON public.clinic_reviews FOR INSERT
  WITH CHECK (
    patient_name IS NOT NULL
    AND rating IS NOT NULL
    AND rating >= 1
    AND rating <= 5
  );

-- Note: queue_entries SELECT will be replaced in B.2 with deleted_at-aware policy
-- Note: einvoice_credentials, user_activity_logs, user_permissions, google_business_tokens
--       have NO SELECT policy yet — admin-only read created in B.1

-- =============================================================
-- Storage bucket: clinic-assets
-- =============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('clinic-assets', 'clinic-assets', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated can upload clinic assets"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'clinic-assets' AND auth.uid() IS NOT NULL);

CREATE POLICY "Public can read clinic assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'clinic-assets');

CREATE POLICY "Authenticated can update clinic assets"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'clinic-assets' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can delete clinic assets"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'clinic-assets' AND auth.uid() IS NOT NULL);

-- =============================================================
-- Seeds
-- =============================================================
INSERT INTO public.rooms (label) VALUES ('Room 1'), ('Room 2');

INSERT INTO public.clinic_preferences (key, value) VALUES
  ('bell_enabled', 'true'),
  ('speak_name_enabled', 'true');

INSERT INTO public.clinic_feedback_form_fields (label, field_type, is_required, is_active, sort_order)
VALUES
  ('Name', 'short_text', true, true, 1),
  ('Phone', 'phone', true, true, 2),
  ('Feedback', 'paragraph', false, true, 3);
