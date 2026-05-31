## Goal

Replace the multi-step JS checkout in `DispenseCheckout.tsx` with a single atomic `checkout_visit` RPC, and let the cashier record a partial payment (paid < total) without blocking checkout. Keep the existing FEFO inventory, panel-claim, and owe-slip triggers — the RPC just orchestrates the calls already made today.

## 1. Database — `checkout_visit` RPC

New `SECURITY DEFINER` PL/pgSQL function in a migration.

**Signature**
```
checkout_visit(
  p_queue_entry_id     uuid,
  p_consultation_id    uuid,         -- nullable (no payment-only flows here, but safe)
  p_total_amount       numeric,
  p_amount_paid        numeric,
  p_payment_method     text,         -- canonical code: cash | qr_pay | card | transfer | "Panel: <name>"
  p_payment_type       text,         -- 'self_pay' | 'panel'
  p_panel_provider_id  uuid,         -- nullable
  p_other_charges      jsonb,        -- [{ name, amount }] — appended as consultation_items first
  p_notes              text
) RETURNS jsonb  -- { payment_id, balance_due, status: 'paid'|'partial' }
```

**Auth gate**: `is_staff_or_admin(auth.uid())` else `NOT_AUTHORIZED`.

**Steps (single transaction)**
1. Lock the queue entry `FOR UPDATE`; reject if already `completed`.
2. For each element in `p_other_charges`, `INSERT INTO consultation_items(consultation_id, item_name, quantity=1, price)`. (Triggers `trg_resolve_selling_price`, `trg_lock_cogs`, `trg_consultation_items_inventory` fire as today.)
3. Insert one `payments` row (`p_amount_paid` may be `< p_total_amount` → "partial"; may equal → "paid"; reject if `> p_total_amount + 0.01`).
4. Compute `v_status := CASE WHEN p_amount_paid >= p_total_amount THEN 'paid' ELSE 'partial' END`. Status is returned to the client — **no new invoice table** (per user choice).
5. Only if `v_status = 'paid'`:
   - `UPDATE consultations SET status='completed'` (fires `trg_consultations_inventory` → FEFO + owe-slips, and `trg_generate_panel_claim`).
   - `UPDATE queue_entries SET clinic_status='completed'`.
6. If `v_status = 'partial'`: leave consultation/queue open so cashier can collect more later (matches today's "outstanding > 0 blocks Complete" behaviour, just now atomic & with a real payment row recorded).
7. `RETURN jsonb_build_object('payment_id', …, 'status', v_status, 'balance_due', GREATEST(p_total_amount - p_amount_paid, 0))`.

Any exception (e.g. `insufficient_stock` from FEFO/reserve) rolls the whole thing back.

**Grants**: `GRANT EXECUTE ON FUNCTION public.checkout_visit(...) TO authenticated;`

**Why no `invoices` table**: per user decision — `payments` rows linked to the consultation/queue entry remain the financial record; "partial" is derived as `sum(payments) < items_total`.

## 2. Frontend — `src/pages/clinic/DispenseCheckout.tsx`

- Replace the body of `handleComplete` with a single `supabase.rpc('checkout_visit', {...})` call. Stop using `addConsultationItem.mutateAsync` loop, `updateConsultation`, `updateQueue` for the checkout step.
- Add **partial-payment** controls in the footer bar:
  - "Amount Paid (RM)" numeric input, default = `outstanding`.
  - Live "Balance Due: RM x.xx" display next to the existing Outstanding figure.
  - Payment method `<Select>` (reuse `PAYMENT_METHOD_OPTIONS` from `@/lib/clinic/paymentMethod`).
  - Keep the existing `anyPartialMissingReason` and "no consultation" guards.
  - Remove the `outstanding > 0` disabled rule — partial is now allowed. Instead, disable only when `amountPaid <= 0` AND `outstanding > 0`, or when `amountPaid > outstanding + 0.01`.
- On RPC success:
  - `toast.success(...)` ("Payment recorded · Visit checked out" if `status==='paid'`, "Partial payment recorded · Balance RM x.xx" if `partial`).
  - Refresh `payments` query.
  - If `status === 'paid'` → navigate to `/clinic/queue` (per user spec). If `partial` → stay on page (cashier collects rest later) and refresh.
  - Existing "Print Receipt" button keeps working off `latestPaymentId`.

No changes to batch tracking — FEFO stays automatic per user decision; nothing in the payload references `batch_id`.

## 3. Out of scope (explicit)

- No new `invoices`/`inventory_batches` tables.
- No changes to `RecordPaymentDialog` (it's used by `VisitDetail`, not the dispensary flow) — can be migrated in a follow-up if desired.
- No changes to FEFO / panel-claim / owe-slip triggers.

## Files touched

- `supabase/migrations/<ts>_checkout_visit_rpc.sql` (new)
- `src/pages/clinic/DispenseCheckout.tsx` (footer + handleComplete)
