-- 1. Migrate existing data: collapse legacy 'operations'/'staff' into 'ops_staff'.
UPDATE public.user_roles
   SET role = 'ops_staff'
 WHERE role IN ('operations','staff');

-- 2. Tighten administrative helpers — clinical roles are NO LONGER included.
-- Legacy 'operations' / 'staff' enum values are retained as accepted aliases
-- because they cannot be removed from the enum (Postgres limitation) and may
-- exist on unmigrated rows or stale in-flight sessions.
CREATE OR REPLACE FUNCTION public.is_staff_or_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin','special_admin','doctor_admin','ops_staff','operations','staff')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_ops_or_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin','special_admin','doctor_admin','ops_staff','operations','staff')
  )
$$;

-- 3. New clinical-only helper for doctors.
CREATE OR REPLACE FUNCTION public.is_clinical(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('locum','resident_doctor')
  )
$$;

-- 4. Union helper for policies that must accept BOTH administrative
-- staff AND clinical staff (e.g. consultations, owe-slip fulfilment).
CREATE OR REPLACE FUNCTION public.is_staff_or_clinical(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_staff_or_admin(_user_id) OR public.is_clinical(_user_id)
$$;

-- 5. Rewrite RLS policies on clinical-touching tables so doctors keep access.
-- Strategy: replace `is_staff_or_admin(auth.uid())` with `is_staff_or_clinical(auth.uid())`.
-- Financial/admin tables (invoices, suppliers, purchase orders, blog, etc.)
-- are intentionally NOT touched here — they remain strictly admin-only.

-- appointments
DROP POLICY IF EXISTS "Staff/Admin can view appointments"    ON public.appointments;
DROP POLICY IF EXISTS "Staff/Admin can update appointments"  ON public.appointments;
DROP POLICY IF EXISTS "Staff/Admin can delete appointments"  ON public.appointments;
CREATE POLICY "Staff/Admin can view appointments"   ON public.appointments FOR SELECT USING (public.is_staff_or_clinical(auth.uid()));
CREATE POLICY "Staff/Admin can update appointments" ON public.appointments FOR UPDATE USING (public.is_staff_or_clinical(auth.uid()));
CREATE POLICY "Staff/Admin can delete appointments" ON public.appointments FOR DELETE USING (public.is_staff_or_clinical(auth.uid()));

-- circular_notices (every employee, incl. doctors, must acknowledge)
DROP POLICY IF EXISTS "Staff can view active notices" ON public.circular_notices;
CREATE POLICY "Staff can view active notices" ON public.circular_notices FOR SELECT
  USING ((is_active = true) AND public.is_staff_or_clinical(auth.uid()));

-- consultation_documents
DROP POLICY IF EXISTS "Staff can view consultation documents"   ON public.consultation_documents;
DROP POLICY IF EXISTS "Staff can insert consultation documents" ON public.consultation_documents;
DROP POLICY IF EXISTS "Staff can update consultation documents" ON public.consultation_documents;
CREATE POLICY "Staff can view consultation documents"   ON public.consultation_documents FOR SELECT USING (public.is_staff_or_clinical(auth.uid()));
CREATE POLICY "Staff can insert consultation documents" ON public.consultation_documents FOR INSERT WITH CHECK (public.is_staff_or_clinical(auth.uid()));
CREATE POLICY "Staff can update consultation documents" ON public.consultation_documents FOR UPDATE USING (public.is_staff_or_clinical(auth.uid()));

-- consultation_items
DROP POLICY IF EXISTS "consultation_items_staff_insert"        ON public.consultation_items;
DROP POLICY IF EXISTS "consultation_items_staff_update_active" ON public.consultation_items;
CREATE POLICY "consultation_items_staff_insert" ON public.consultation_items FOR INSERT
  WITH CHECK (public.is_staff_or_clinical(auth.uid()));
CREATE POLICY "consultation_items_staff_update_active" ON public.consultation_items FOR UPDATE
  USING ((deleted_at IS NULL) AND public.is_staff_or_clinical(auth.uid()))
  WITH CHECK (public.is_staff_or_clinical(auth.uid()));

-- consultation_transcripts
DROP POLICY IF EXISTS "Staff/Admin can view transcripts"   ON public.consultation_transcripts;
DROP POLICY IF EXISTS "Staff/Admin can insert transcripts" ON public.consultation_transcripts;
DROP POLICY IF EXISTS "Staff/Admin can update transcripts" ON public.consultation_transcripts;
DROP POLICY IF EXISTS "Staff/Admin can delete transcripts" ON public.consultation_transcripts;
CREATE POLICY "Staff/Admin can view transcripts"   ON public.consultation_transcripts FOR SELECT USING (public.is_staff_or_clinical(auth.uid()));
CREATE POLICY "Staff/Admin can insert transcripts" ON public.consultation_transcripts FOR INSERT WITH CHECK (public.is_staff_or_clinical(auth.uid()));
CREATE POLICY "Staff/Admin can update transcripts" ON public.consultation_transcripts FOR UPDATE USING (public.is_staff_or_clinical(auth.uid()));
CREATE POLICY "Staff/Admin can delete transcripts" ON public.consultation_transcripts FOR DELETE USING (public.is_staff_or_clinical(auth.uid()));

-- geofence_zones (doctors punch in)
DROP POLICY IF EXISTS "Staff/Admin can view zones" ON public.geofence_zones;
CREATE POLICY "Staff/Admin can view zones" ON public.geofence_zones FOR SELECT USING (public.is_staff_or_clinical(auth.uid()));

-- internal_messages (doctors chat with staff)
DROP POLICY IF EXISTS "im_insert_self_staff" ON public.internal_messages;
CREATE POLICY "im_insert_self_staff" ON public.internal_messages FOR INSERT
  WITH CHECK ((auth.uid() = sender_id) AND public.is_staff_or_clinical(auth.uid()));

-- inventory_item_batches / inventory_transactions (clinical reads stock)
DROP POLICY IF EXISTS "staff_can_view_batches" ON public.inventory_item_batches;
DROP POLICY IF EXISTS "staff_can_view_invtx"   ON public.inventory_transactions;
CREATE POLICY "staff_can_view_batches" ON public.inventory_item_batches FOR SELECT USING (public.is_staff_or_clinical(auth.uid()));
CREATE POLICY "staff_can_view_invtx"   ON public.inventory_transactions  FOR SELECT USING (public.is_staff_or_clinical(auth.uid()));

-- pharmacy_owe_slips (doctors view; fulfilment RPC remains admin-only)
DROP POLICY IF EXISTS "staff_can_view_owe" ON public.pharmacy_owe_slips;
CREATE POLICY "staff_can_view_owe" ON public.pharmacy_owe_slips FOR SELECT USING (public.is_staff_or_clinical(auth.uid()));

-- profiles (every employee can see colleagues)
DROP POLICY IF EXISTS "Staff/Admin can view all profiles" ON public.profiles;
CREATE POLICY "Staff/Admin can view all profiles" ON public.profiles FOR SELECT USING (public.is_staff_or_clinical(auth.uid()));

-- public_holidays
DROP POLICY IF EXISTS "Staff can view holidays" ON public.public_holidays;
CREATE POLICY "Staff can view holidays" ON public.public_holidays FOR SELECT USING (public.is_staff_or_clinical(auth.uid()));

-- restock_requests (doctors request restocks too)
DROP POLICY IF EXISTS "staff_view_restock"   ON public.restock_requests;
DROP POLICY IF EXISTS "staff_insert_restock" ON public.restock_requests;
CREATE POLICY "staff_view_restock"   ON public.restock_requests FOR SELECT USING (public.is_staff_or_clinical(auth.uid()));
CREATE POLICY "staff_insert_restock" ON public.restock_requests FOR INSERT
  WITH CHECK (public.is_staff_or_clinical(auth.uid()) AND (requested_by = auth.uid()));

-- saved_rosters (clinical can view their own roster; edits stay admin-only)
DROP POLICY IF EXISTS "Staff/Admin can view saved rosters" ON public.saved_rosters;
CREATE POLICY "Staff/Admin can view saved rosters" ON public.saved_rosters FOR SELECT USING (public.is_staff_or_clinical(auth.uid()));
-- INSERT/UPDATE/DELETE intentionally remain `is_staff_or_admin` (admin-only).

-- staff_notifications / staff_tasks / task_delete_requests
DROP POLICY IF EXISTS "Staff/Admin can insert notifications" ON public.staff_notifications;
CREATE POLICY "Staff/Admin can insert notifications" ON public.staff_notifications FOR INSERT
  WITH CHECK (public.is_staff_or_clinical(auth.uid()));

DROP POLICY IF EXISTS "Staff can insert tasks"          ON public.staff_tasks;
DROP POLICY IF EXISTS "Staff can view visible tasks"    ON public.staff_tasks;
DROP POLICY IF EXISTS "Staff can update visible tasks"  ON public.staff_tasks;
CREATE POLICY "Staff can insert tasks" ON public.staff_tasks FOR INSERT
  WITH CHECK (public.is_staff_or_clinical(auth.uid()));
CREATE POLICY "Staff can view visible tasks" ON public.staff_tasks FOR SELECT
  USING (public.is_admin(auth.uid()) OR (public.is_staff_or_clinical(auth.uid()) AND (visibility = 'all'::text)));
CREATE POLICY "Staff can update visible tasks" ON public.staff_tasks FOR UPDATE
  USING (public.is_admin(auth.uid()) OR (public.is_staff_or_clinical(auth.uid()) AND (visibility = 'all'::text)));

DROP POLICY IF EXISTS "Staff can insert delete requests" ON public.task_delete_requests;
CREATE POLICY "Staff can insert delete requests" ON public.task_delete_requests FOR INSERT
  WITH CHECK (public.is_staff_or_clinical(auth.uid()));

-- charge types / document templates / packages: doctors need to read these
-- during consultations. Write paths remain admin-only.
DROP POLICY IF EXISTS "Staff can view charge types" ON public.clinic_charge_types;
CREATE POLICY "Staff can view charge types" ON public.clinic_charge_types FOR SELECT USING (public.is_staff_or_clinical(auth.uid()));

DROP POLICY IF EXISTS "Staff can view templates" ON public.clinic_document_templates;
CREATE POLICY "Staff can view templates" ON public.clinic_document_templates FOR SELECT USING (public.is_staff_or_clinical(auth.uid()));