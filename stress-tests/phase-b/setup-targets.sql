-- Phase B target seeds. Idempotent (ON CONFLICT DO NOTHING).
-- Run BEFORE k6 scenarios; teardown lives in setup-targets-teardown.sql.
-- Schema-corrected vs the original draft:
--   - patients column is `national_id` not `ic_number`
--   - inventory table is `inventory_item_batches` not `inventory_batches`
--   - inventory_items uses `stock` not `stock_level`
--   - batches use quantity_initial + quantity_remaining
--   - queue_entries needs queue_sequence (NOT NULL in some envs)

-- =============================================================
-- 1. checkout-race: isolated unpaid consultation
-- =============================================================
INSERT INTO public.patients (id, name, national_id, phone)
VALUES ('c0000000-0000-0000-0000-000000000001', 'K6 Checkout Target', '990101145555', '+60100000001')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.queue_entries
  (id, patient_id, visit_type, clinic_status, visit_purpose, queue_sequence)
VALUES
  ('q0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000001',
   'consultation', 'sent_to_dispensary', 'k6-checkout', 9001)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.consultations
  (id, patient_id, queue_entry_id, status)
VALUES
  ('x0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000001',
   'q0000000-0000-0000-0000-000000000001', 'in_progress')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.consultation_items
  (id, consultation_id, item_name, quantity, price)
VALUES
  ('i0000000-0000-0000-0000-000000000099',
   'x0000000-0000-0000-0000-000000000001',
   'K6 Race Consultation Fee', 1, 50.00)
ON CONFLICT (id) DO NOTHING;

-- =============================================================
-- 2. settle-debt-race: payment_only ticket + historical RM150 debt
-- =============================================================
INSERT INTO public.queue_entries
  (id, patient_id, visit_type, clinic_status, visit_purpose, queue_sequence)
VALUES
  ('q0000000-0000-0000-0000-000000000002',
   'c0000000-0000-0000-0000-000000000001',
   'payment_only', 'sent_to_dispensary', 'k6-settle', 9002)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.consultations
  (id, patient_id, status, created_at)
VALUES
  ('x0000000-0000-0000-0000-000000000002',
   'c0000000-0000-0000-0000-000000000001',
   'completed', '2023-01-01'::timestamptz)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.consultation_items
  (id, consultation_id, item_name, price, quantity)
VALUES
  ('i0000000-0000-0000-0000-000000000001',
   'x0000000-0000-0000-0000-000000000002',
   'K6 Race Outstanding Debt', 150.00, 1)
ON CONFLICT (id) DO NOTHING;
-- NO payments row → debt is exactly RM150.

-- =============================================================
-- 3. fefo-race: capped 50-unit batch
-- =============================================================
INSERT INTO public.inventory_items
  (id, name, status, stock)
VALUES
  ('11110000-0000-0000-0000-000000000001', 'K6 Race Panadol', 'active', 50)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.inventory_item_batches
  (id, inventory_item_id, batch_number, expiry_date, quantity_initial, quantity_remaining)
VALUES
  ('b0000000-0000-0000-0000-000000000001',
   '11110000-0000-0000-0000-000000000001',
   'K6BATCH01', '2030-12-31', 50, 50)
ON CONFLICT (id) DO NOTHING;

-- =============================================================
-- 4. owe-slip-race: open slip with 10 owed
-- =============================================================
INSERT INTO public.consultations
  (id, patient_id, status, created_at)
VALUES
  ('x0000000-0000-0000-0000-000000000003',
   'c0000000-0000-0000-0000-000000000001',
   'completed', '2024-06-01'::timestamptz)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.consultation_items
  (id, consultation_id, item_name, quantity, price)
VALUES
  ('i0000000-0000-0000-0000-000000000003',
   'x0000000-0000-0000-0000-000000000003',
   'K6 Race Panadol', 10, 2.50)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.pharmacy_owe_slips
  (id, consultation_item_id, consultation_id, patient_id,
   inventory_item_id, qty_owed, qty_fulfilled, status)
VALUES
  ('05100000-0000-0000-0000-000000000001',
   'i0000000-0000-0000-0000-000000000003',
   'x0000000-0000-0000-0000-000000000003',
   'c0000000-0000-0000-0000-000000000001',
   '11110000-0000-0000-0000-000000000001',
   10, 0, 'open')
ON CONFLICT (id) DO NOTHING;

-- =============================================================
-- 5. queue-status-race: live registered ticket
-- =============================================================
INSERT INTO public.queue_entries
  (id, patient_id, visit_type, clinic_status, visit_purpose, queue_sequence)
VALUES
  ('q0000000-0000-0000-0000-000000000003',
   'c0000000-0000-0000-0000-000000000001',
   'consultation', 'registered', 'k6-status', 9003)
ON CONFLICT (id) DO NOTHING;
