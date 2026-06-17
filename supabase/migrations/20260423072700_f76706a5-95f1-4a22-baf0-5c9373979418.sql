-- =====================================================
-- 1. Add soft-delete columns
-- =====================================================
ALTER TABLE public.consultations
  ADD COLUMN deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN deleted_by UUID NULL REFERENCES auth.users(id);

ALTER TABLE public.consultation_items
  ADD COLUMN deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN deleted_by UUID NULL REFERENCES auth.users(id);

ALTER TABLE public.payments
  ADD COLUMN deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN deleted_by UUID NULL REFERENCES auth.users(id);

ALTER TABLE public.queue_entries
  ADD COLUMN deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN deleted_by UUID NULL REFERENCES auth.users(id);

-- =====================================================
-- 2. Active-row partial indexes (hot lookup columns)
-- =====================================================
CREATE INDEX consultations_queue_entry_id_active_idx
  ON public.consultations (queue_entry_id) WHERE deleted_at IS NULL;
CREATE INDEX consultations_patient_id_active_idx
  ON public.consultations (patient_id) WHERE deleted_at IS NULL;

CREATE INDEX consultation_items_consultation_id_active_idx
  ON public.consultation_items (consultation_id) WHERE deleted_at IS NULL;

CREATE INDEX payments_queue_entry_id_active_idx
  ON public.payments (queue_entry_id) WHERE deleted_at IS NULL;
CREATE INDEX payments_consultation_id_active_idx
  ON public.payments (consultation_id) WHERE deleted_at IS NULL;

CREATE INDEX queue_entries_clinic_status_active_idx
  ON public.queue_entries (clinic_status) WHERE deleted_at IS NULL;
CREATE INDEX queue_entries_created_at_active_idx
  ON public.queue_entries (created_at) WHERE deleted_at IS NULL;

-- =====================================================
-- 3. Replace any existing UNIQUE on these tables with
--    partial unique indexes (active rows only).
--    Uses IF EXISTS — safe across schemas that may or may
--    not have these constraints from B.0.
-- =====================================================
ALTER TABLE public.consultations
  DROP CONSTRAINT IF EXISTS consultations_queue_entry_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS consultations_queue_entry_id_active_uidx
  ON public.consultations (queue_entry_id) WHERE deleted_at IS NULL;

-- =====================================================
-- 4. RLS rewrite — consultations
-- =====================================================
DROP POLICY IF EXISTS "Authenticated can read consultations" ON public.consultations;

CREATE POLICY "consultations_read_active" ON public.consultations
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL);

CREATE POLICY "consultations_special_admin_read_voided" ON public.consultations
  FOR SELECT TO authenticated
  USING (public.is_special_admin(auth.uid()) AND deleted_at IS NOT NULL);

-- Replace ops_update with split USING/CHECK to permit soft-delete transition
DROP POLICY IF EXISTS "consultations_ops_update" ON public.consultations;
CREATE POLICY "consultations_update_active" ON public.consultations
  FOR UPDATE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()) AND deleted_at IS NULL)
  WITH CHECK (public.is_ops_or_admin(auth.uid()));

-- INSERT policy already created in Migration 2 (consultations_ops_insert).
-- No DELETE policy — DB-level deletion forbidden on this table.

-- =====================================================
-- 5. RLS rewrite — consultation_items
-- =====================================================
DROP POLICY IF EXISTS "Authenticated can read consultation_items" ON public.consultation_items;

CREATE POLICY "consultation_items_read_active" ON public.consultation_items
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL);

CREATE POLICY "consultation_items_special_admin_read_voided" ON public.consultation_items
  FOR SELECT TO authenticated
  USING (public.is_special_admin(auth.uid()) AND deleted_at IS NOT NULL);

DROP POLICY IF EXISTS "consultation_items_ops_update" ON public.consultation_items;
CREATE POLICY "consultation_items_update_active" ON public.consultation_items
  FOR UPDATE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()) AND deleted_at IS NULL)
  WITH CHECK (public.is_ops_or_admin(auth.uid()));

-- =====================================================
-- 6. RLS rewrite — payments
-- =====================================================
DROP POLICY IF EXISTS "Authenticated can read payments" ON public.payments;

CREATE POLICY "payments_read_active" ON public.payments
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL);

CREATE POLICY "payments_special_admin_read_voided" ON public.payments
  FOR SELECT TO authenticated
  USING (public.is_special_admin(auth.uid()) AND deleted_at IS NOT NULL);

DROP POLICY IF EXISTS "payments_ops_update" ON public.payments;
CREATE POLICY "payments_update_active" ON public.payments
  FOR UPDATE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()) AND deleted_at IS NULL)
  WITH CHECK (public.is_ops_or_admin(auth.uid()));

-- =====================================================
-- 7. RLS rewrite — queue_entries
-- =====================================================
-- queue_entries had no pre-existing SELECT policy from B.0;
-- create the active-only read policy now.
CREATE POLICY "queue_entries_read_active" ON public.queue_entries
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL);

CREATE POLICY "queue_entries_special_admin_read_voided" ON public.queue_entries
  FOR SELECT TO authenticated
  USING (public.is_special_admin(auth.uid()) AND deleted_at IS NOT NULL);

DROP POLICY IF EXISTS "queue_entries_ops_update" ON public.queue_entries;
CREATE POLICY "queue_entries_update_active" ON public.queue_entries
  FOR UPDATE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()) AND deleted_at IS NULL)
  WITH CHECK (public.is_ops_or_admin(auth.uid()));