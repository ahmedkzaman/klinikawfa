-- =====================================================
-- 1. Defensive dedup of user_roles
-- =====================================================
WITH ranked AS (
  SELECT ctid, user_id, ROW_NUMBER() OVER (
    PARTITION BY user_id
    ORDER BY CASE role
      WHEN 'special_admin' THEN 4
      WHEN 'admin' THEN 3
      WHEN 'operations' THEN 2
      ELSE 1
    END DESC,
    ctid ASC
  ) AS rn
  FROM public.user_roles
)
DELETE FROM public.user_roles ur
USING ranked r
WHERE ur.ctid = r.ctid AND r.rn > 1;

-- =====================================================
-- 2. Helper functions (SECURITY DEFINER, STABLE)
-- =====================================================
CREATE OR REPLACE FUNCTION public.is_special_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'special_admin'
  )
$$;
ALTER FUNCTION public.is_special_admin(uuid) OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.is_ops_or_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('operations', 'admin', 'special_admin')
  )
$$;
ALTER FUNCTION public.is_ops_or_admin(uuid) OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.get_doctor_id_for_user(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.doctors WHERE user_id = _user_id LIMIT 1
$$;
ALTER FUNCTION public.get_doctor_id_for_user(uuid) OWNER TO postgres;

-- =====================================================
-- 3. Rewrite admin_assign_role with special_admin gate
-- =====================================================
CREATE OR REPLACE FUNCTION public.admin_assign_role(target_user_id uuid, new_role app_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_special_admin(auth.uid()) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  IF target_user_id = auth.uid() AND new_role <> 'special_admin' THEN
    RAISE EXCEPTION 'CANNOT_DEMOTE_SELF' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (target_user_id, new_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;
END;
$$;
ALTER FUNCTION public.admin_assign_role(uuid, app_role) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_assign_role(uuid, app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_assign_role(uuid, app_role) TO authenticated;

-- =====================================================
-- 4. Write RLS backfill on clinic tables
-- Pattern: ops_write (INSERT/UPDATE) for operators/admins
--          ops_delete (DELETE) only on non-soft-delete tables
-- Soft-delete tables (consultations, consultation_items,
--   payments, queue_entries) get INSERT/UPDATE here;
--   their full RLS rewrite happens in Migration 3.
-- =====================================================

-- patients
CREATE POLICY "patients_ops_insert" ON public.patients
  FOR INSERT TO authenticated
  WITH CHECK (public.is_ops_or_admin(auth.uid()));
CREATE POLICY "patients_ops_update" ON public.patients
  FOR UPDATE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()))
  WITH CHECK (public.is_ops_or_admin(auth.uid()));
CREATE POLICY "patients_ops_delete" ON public.patients
  FOR DELETE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()));

-- doctors
CREATE POLICY "doctors_ops_insert" ON public.doctors
  FOR INSERT TO authenticated
  WITH CHECK (public.is_ops_or_admin(auth.uid()));
CREATE POLICY "doctors_ops_update" ON public.doctors
  FOR UPDATE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()))
  WITH CHECK (public.is_ops_or_admin(auth.uid()));
CREATE POLICY "doctors_ops_delete" ON public.doctors
  FOR DELETE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()));

-- inventory_items
CREATE POLICY "inventory_items_ops_insert" ON public.inventory_items
  FOR INSERT TO authenticated
  WITH CHECK (public.is_ops_or_admin(auth.uid()));
CREATE POLICY "inventory_items_ops_update" ON public.inventory_items
  FOR UPDATE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()))
  WITH CHECK (public.is_ops_or_admin(auth.uid()));
CREATE POLICY "inventory_items_ops_delete" ON public.inventory_items
  FOR DELETE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()));

-- inventory_item_prices
CREATE POLICY "inventory_item_prices_ops_insert" ON public.inventory_item_prices
  FOR INSERT TO authenticated
  WITH CHECK (public.is_ops_or_admin(auth.uid()));
CREATE POLICY "inventory_item_prices_ops_update" ON public.inventory_item_prices
  FOR UPDATE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()))
  WITH CHECK (public.is_ops_or_admin(auth.uid()));
CREATE POLICY "inventory_item_prices_ops_delete" ON public.inventory_item_prices
  FOR DELETE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()));

-- inventory_lists
CREATE POLICY "inventory_lists_ops_insert" ON public.inventory_lists
  FOR INSERT TO authenticated
  WITH CHECK (public.is_ops_or_admin(auth.uid()));
CREATE POLICY "inventory_lists_ops_update" ON public.inventory_lists
  FOR UPDATE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()))
  WITH CHECK (public.is_ops_or_admin(auth.uid()));
CREATE POLICY "inventory_lists_ops_delete" ON public.inventory_lists
  FOR DELETE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()));

-- inventory_locations
CREATE POLICY "inventory_locations_ops_insert" ON public.inventory_locations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_ops_or_admin(auth.uid()));
CREATE POLICY "inventory_locations_ops_update" ON public.inventory_locations
  FOR UPDATE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()))
  WITH CHECK (public.is_ops_or_admin(auth.uid()));
CREATE POLICY "inventory_locations_ops_delete" ON public.inventory_locations
  FOR DELETE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()));

-- packages
CREATE POLICY "packages_ops_insert" ON public.packages
  FOR INSERT TO authenticated
  WITH CHECK (public.is_ops_or_admin(auth.uid()));
CREATE POLICY "packages_ops_update" ON public.packages
  FOR UPDATE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()))
  WITH CHECK (public.is_ops_or_admin(auth.uid()));
CREATE POLICY "packages_ops_delete" ON public.packages
  FOR DELETE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()));

-- diagnoses
CREATE POLICY "diagnoses_ops_insert" ON public.diagnoses
  FOR INSERT TO authenticated
  WITH CHECK (public.is_ops_or_admin(auth.uid()));
CREATE POLICY "diagnoses_ops_update" ON public.diagnoses
  FOR UPDATE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()))
  WITH CHECK (public.is_ops_or_admin(auth.uid()));
CREATE POLICY "diagnoses_ops_delete" ON public.diagnoses
  FOR DELETE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()));

-- panel_payment_methods
CREATE POLICY "panel_payment_methods_ops_insert" ON public.panel_payment_methods
  FOR INSERT TO authenticated
  WITH CHECK (public.is_ops_or_admin(auth.uid()));
CREATE POLICY "panel_payment_methods_ops_update" ON public.panel_payment_methods
  FOR UPDATE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()))
  WITH CHECK (public.is_ops_or_admin(auth.uid()));
CREATE POLICY "panel_payment_methods_ops_delete" ON public.panel_payment_methods
  FOR DELETE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()));

-- insurance_providers
CREATE POLICY "insurance_providers_ops_insert" ON public.insurance_providers
  FOR INSERT TO authenticated
  WITH CHECK (public.is_ops_or_admin(auth.uid()));
CREATE POLICY "insurance_providers_ops_update" ON public.insurance_providers
  FOR UPDATE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()))
  WITH CHECK (public.is_ops_or_admin(auth.uid()));
CREATE POLICY "insurance_providers_ops_delete" ON public.insurance_providers
  FOR DELETE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()));

-- clinic_appointments
CREATE POLICY "clinic_appointments_ops_insert" ON public.clinic_appointments
  FOR INSERT TO authenticated
  WITH CHECK (public.is_ops_or_admin(auth.uid()));
CREATE POLICY "clinic_appointments_ops_update" ON public.clinic_appointments
  FOR UPDATE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()))
  WITH CHECK (public.is_ops_or_admin(auth.uid()));
CREATE POLICY "clinic_appointments_ops_delete" ON public.clinic_appointments
  FOR DELETE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()));

-- clinic_preferences
CREATE POLICY "clinic_preferences_ops_insert" ON public.clinic_preferences
  FOR INSERT TO authenticated
  WITH CHECK (public.is_ops_or_admin(auth.uid()));
CREATE POLICY "clinic_preferences_ops_update" ON public.clinic_preferences
  FOR UPDATE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()))
  WITH CHECK (public.is_ops_or_admin(auth.uid()));
CREATE POLICY "clinic_preferences_ops_delete" ON public.clinic_preferences
  FOR DELETE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()));

-- clinic_feedback_form_fields
CREATE POLICY "clinic_feedback_form_fields_ops_insert" ON public.clinic_feedback_form_fields
  FOR INSERT TO authenticated
  WITH CHECK (public.is_ops_or_admin(auth.uid()));
CREATE POLICY "clinic_feedback_form_fields_ops_update" ON public.clinic_feedback_form_fields
  FOR UPDATE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()))
  WITH CHECK (public.is_ops_or_admin(auth.uid()));
CREATE POLICY "clinic_feedback_form_fields_ops_delete" ON public.clinic_feedback_form_fields
  FOR DELETE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()));

-- consultation_transcripts (NOT in soft-delete set; existing staff/admin policies remain)
-- Adding ops-tier write policies. Existing staff policies still apply via OR.
CREATE POLICY "consultation_transcripts_ops_insert" ON public.consultation_transcripts
  FOR INSERT TO authenticated
  WITH CHECK (public.is_ops_or_admin(auth.uid()));
CREATE POLICY "consultation_transcripts_ops_update" ON public.consultation_transcripts
  FOR UPDATE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()))
  WITH CHECK (public.is_ops_or_admin(auth.uid()));

-- einvoices (NOT in soft-delete set)
CREATE POLICY "einvoices_ops_insert" ON public.einvoices
  FOR INSERT TO authenticated
  WITH CHECK (public.is_ops_or_admin(auth.uid()));
CREATE POLICY "einvoices_ops_update" ON public.einvoices
  FOR UPDATE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()))
  WITH CHECK (public.is_ops_or_admin(auth.uid()));
CREATE POLICY "einvoices_ops_delete" ON public.einvoices
  FOR DELETE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()));

-- einvoice_credentials — special_admin only (full lifecycle)
CREATE POLICY "einvoice_credentials_special_admin_select" ON public.einvoice_credentials
  FOR SELECT TO authenticated
  USING (public.is_special_admin(auth.uid()));
CREATE POLICY "einvoice_credentials_special_admin_insert" ON public.einvoice_credentials
  FOR INSERT TO authenticated
  WITH CHECK (public.is_special_admin(auth.uid()));
CREATE POLICY "einvoice_credentials_special_admin_update" ON public.einvoice_credentials
  FOR UPDATE TO authenticated
  USING (public.is_special_admin(auth.uid()))
  WITH CHECK (public.is_special_admin(auth.uid()));
CREATE POLICY "einvoice_credentials_special_admin_delete" ON public.einvoice_credentials
  FOR DELETE TO authenticated
  USING (public.is_special_admin(auth.uid()));

-- google_business_tokens — special_admin only (full lifecycle)
CREATE POLICY "google_business_tokens_special_admin_select" ON public.google_business_tokens
  FOR SELECT TO authenticated
  USING (public.is_special_admin(auth.uid()));
CREATE POLICY "google_business_tokens_special_admin_insert" ON public.google_business_tokens
  FOR INSERT TO authenticated
  WITH CHECK (public.is_special_admin(auth.uid()));
CREATE POLICY "google_business_tokens_special_admin_update" ON public.google_business_tokens
  FOR UPDATE TO authenticated
  USING (public.is_special_admin(auth.uid()))
  WITH CHECK (public.is_special_admin(auth.uid()));
CREATE POLICY "google_business_tokens_special_admin_delete" ON public.google_business_tokens
  FOR DELETE TO authenticated
  USING (public.is_special_admin(auth.uid()));

-- Soft-delete tables: INSERT/UPDATE only here (DELETE forbidden in Migration 3)
-- consultations
CREATE POLICY "consultations_ops_insert" ON public.consultations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_ops_or_admin(auth.uid()));
CREATE POLICY "consultations_ops_update" ON public.consultations
  FOR UPDATE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()))
  WITH CHECK (public.is_ops_or_admin(auth.uid()));

-- consultation_items
CREATE POLICY "consultation_items_ops_insert" ON public.consultation_items
  FOR INSERT TO authenticated
  WITH CHECK (public.is_ops_or_admin(auth.uid()));
CREATE POLICY "consultation_items_ops_update" ON public.consultation_items
  FOR UPDATE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()))
  WITH CHECK (public.is_ops_or_admin(auth.uid()));

-- payments
CREATE POLICY "payments_ops_insert" ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (public.is_ops_or_admin(auth.uid()));
CREATE POLICY "payments_ops_update" ON public.payments
  FOR UPDATE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()))
  WITH CHECK (public.is_ops_or_admin(auth.uid()));

-- queue_entries
CREATE POLICY "queue_entries_ops_insert" ON public.queue_entries
  FOR INSERT TO authenticated
  WITH CHECK (public.is_ops_or_admin(auth.uid()));
CREATE POLICY "queue_entries_ops_update" ON public.queue_entries
  FOR UPDATE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()))
  WITH CHECK (public.is_ops_or_admin(auth.uid()));

-- =====================================================
-- 5. Environment-aware bootstrap (non-fatal)
-- =====================================================
DO $$
DECLARE
  v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE email = 'ahmedkzaman@gmail.com';
  IF v_uid IS NULL THEN
    RAISE WARNING 'Bootstrap bypassed: Admin email not found in auth.users (Expected in local dev).';
    RETURN;
  END IF;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_uid, 'special_admin')
  ON CONFLICT (user_id) DO UPDATE SET role = 'special_admin';
END $$;