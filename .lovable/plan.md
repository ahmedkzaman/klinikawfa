# Checkout & Settlement Architecture (v6 — final, hardened)

Adds explicit negative-amount guards to both RPCs and replaces aggregate pseudocode with a concrete `SELECT … INTO` against the locked rows.

## 1. Fix `checkout_visit` RPC (migration)

Replace the existing function. Order of guards (all at top):

```sql
IF NOT public.is_staff_or_admin(auth.uid()) THEN
  RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
END IF;
IF p_amount_paid IS NULL OR p_amount_paid < 0 THEN
  RAISE EXCEPTION 'INVALID_AMOUNT' USING ERRCODE = 'P0001';   -- hard floor
END IF;
IF p_total_amount IS NULL OR p_total_amount < 0 THEN
  RAISE EXCEPTION 'INVALID_TOTAL' USING ERRCODE = 'P0001';
END IF;
IF p_amount_paid > p_total_amount THEN                         -- strict, no slack
  RAISE EXCEPTION 'OVERPAYMENT' USING ERRCODE = 'P0001';
END IF;
```

Then:
- If `p_amount_paid = 0` → coerce `p_payment_method := NULL` and skip the `payments` insert.
- Else require non-empty `p_payment_method`.
- **Always** `UPDATE consultations SET status='completed'` (when `p_consultation_id IS NOT NULL`) AND `UPDATE queue_entries SET clinic_status='completed'` — paid OR partial. Removes the old `IF v_status='paid'` gate so `trg_consultations_inventory` (FEFO + owe-slips) and `trg_generate_panel_claim` always fire exactly once per visit.
- Return `status` ('paid' | 'partial') from `p_amount_paid >= p_total_amount`.

Keep existing `ALREADY_COMPLETED` lock guard.

## 2. New `settle_multiple_debts` RPC (migration)

```
settle_multiple_debts(
  p_queue_entry_id   uuid,
  p_consultation_ids uuid[],
  p_amount_paid      numeric,
  p_payment_method   text,
  p_notes            text
) RETURNS jsonb
```

Single transaction, `SECURITY DEFINER`:

1. **Auth & input guards (top of function)**:
   ```sql
   IF NOT public.is_staff_or_admin(auth.uid()) THEN
     RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
   END IF;
   IF p_amount_paid IS NULL OR p_amount_paid < 0 THEN
     RAISE EXCEPTION 'INVALID_AMOUNT' USING ERRCODE = 'P0001';   -- hard floor
   END IF;
   ```
2. **Lock the ticket first**: `SELECT … FOR UPDATE` on `queue_entries WHERE id = p_queue_entry_id`. Reject if `clinic_status='completed'` or `visit_type <> 'payment_only'`. Capture `v_patient_id`.
3. **Lock targeted consultations deterministically** (tiebreaker on `id` defeats deadlocks when `created_at` collides):
   ```sql
   FOR r IN
     SELECT id, created_at
       FROM consultations
      WHERE id = ANY(p_consultation_ids)
        AND patient_id = v_patient_id
        AND deleted_at IS NULL
      ORDER BY created_at ASC, id ASC
      FOR UPDATE
   LOOP
     -- per-row outstanding computed in step 4
   END LOOP;
   ```
4. **Compute outstanding per locked row — NULL-safe** (both aggregates wrapped):
   ```sql
   SELECT
     COALESCE((SELECT SUM(price * quantity)
                 FROM consultation_items
                WHERE consultation_id = r.id AND deleted_at IS NULL), 0)
   - COALESCE((SELECT SUM(amount)
                 FROM payments
                WHERE consultation_id = r.id AND deleted_at IS NULL), 0)
     INTO r_outstanding;
   IF r_outstanding > 0 THEN
     -- append { id, outstanding } into a temp array / temp table for step 5+6
   END IF;
   ```
   Without `COALESCE` on payments, an unpaid visit yields `NULL` outstanding and silently breaks `LEAST(...)` in the allocation loop.
5. **Compute total outstanding with a concrete `SELECT … INTO`** (no pseudocode):
   ```sql
   SELECT COALESCE(SUM(outstanding), 0)
     INTO v_total_outstanding
     FROM unnest(v_eligible_rows) AS x(id uuid, outstanding numeric);
   ```
   (Or equivalent: accumulate `v_total_outstanding := v_total_outstanding + r_outstanding;` inside step 4's loop — explicit variable, not a free-standing `SUM(outstanding_per_row)` expression.)

   **Overpayment guard — empty-array safe**:
   ```sql
   IF p_amount_paid > v_total_outstanding THEN
     RAISE EXCEPTION 'OVERPAYMENT' USING ERRCODE = 'P0001';
   END IF;
   ```
   Because `v_total_outstanding` was `COALESCE`d to 0, the empty-`p_consultation_ids` case (or all-zero-outstanding case) now correctly fails any `p_amount_paid > 0` payload instead of being silently bypassed.
6. **FIFO allocation in PL/pgSQL** using `numeric`:
   ```
   v_remaining := p_amount_paid;
   FOR r IN <eligible rows in created_at ASC, id ASC> LOOP
     EXIT WHEN v_remaining <= 0;
     v_apply := LEAST(v_remaining, r.outstanding);
     IF v_apply > 0 THEN
       INSERT INTO payments(queue_entry_id, consultation_id, payment_type,
                            payment_method, amount, notes)
       VALUES (p_queue_entry_id, r.id, 'self_pay',
               p_payment_method, v_apply, p_notes)
       RETURNING id INTO v_pid;
       v_payment_ids := v_payment_ids || v_pid;
       v_remaining := v_remaining - v_apply;
     END IF;
   END LOOP;
   ```
   With `p_amount_paid >= 0` guaranteed by step 1, `LEAST(v_remaining, r.outstanding)` cannot produce a negative `v_apply`.
7. **Zero-amount coercion**: if `p_amount_paid = 0`, force `p_payment_method := NULL` and skip the loop entirely. Otherwise require non-empty `p_payment_method` (or raise `PAYMENT_METHOD_REQUIRED`).
8. **Always close the ticket**: `UPDATE queue_entries SET clinic_status='completed' WHERE id = p_queue_entry_id` — full / partial / zero alike. Residual debt remains on historical consultations.
9. Return `jsonb`: `{ payment_ids, allocations:[{consultation_id, amount}], total_collected, debt_remaining }`.

`GRANT EXECUTE ON FUNCTION public.settle_multiple_debts(...) TO authenticated;`

## 3. Frontend — `RegisterAndCheckInDialog.tsx`

- Extend visit-type toggle → `'consultation' | 'direct_sale' | 'payment_only'`.
- When `payment_only`: hide doctor / vitals / visit_purpose UI; insert `queue_entries` with `clinic_status='sent_to_dispensary'`, `visit_type='payment_only'`, `visit_purpose='other'`, **no `consultations` row**; toast → `/clinic/queue`.

## 4. Frontend — `QueueBoard.tsx` + new `SettleDebtModal.tsx`

### `QueueBoard.tsx`
```ts
if (entry.visit_type === 'payment_only') setSettleDebtEntry(entry);
else navigate(`/clinic/queue/checkout/${entry.id}`);
```

### `src/components/clinic/billing/SettleDebtModal.tsx`
- Load patient's past consultations with `outstanding > 0` (items total − payments).
- Each row: checkbox + visit date + doctor + total + paid + **outstanding**.
- Footer:
  - `Amount Paid (RM)` — defaults to `Σ outstanding(selected)`, **clamped client-side to `[0, selectedTotal]`** (defence-in-depth; the RPC enforces the same bounds).
  - `Payment Method` Select — required only when amount > 0.
  - Optional notes.
  - Live readout: "Settling N visits · Selected RM X · Paying RM Y".
- **Submit-enable rules**:
  - `selected.length > 0 && amount > 0 && method` → enabled (normal settlement).
  - `amount === 0` (with OR without selections) → enabled as **"Close Ticket (RM 0)"** — patient-walks-out path.
  - `selected.length > 0 && amount > 0 && !method` → disabled with inline error.
  - `selected.length === 0 && amount > 0` → disabled (RPC would reject as `OVERPAYMENT`).
- Confirm dialog on zero-amount close: "Close ticket without collecting payment?".
- **Single RPC call**:
  ```ts
  await supabase.rpc('settle_multiple_debts', {
    p_queue_entry_id: queueEntry.id,
    p_consultation_ids: selectedIds,
    p_amount_paid: amount,
    p_payment_method: amount > 0 ? method : null,
    p_notes: notes,
  });
  ```
- On success: invalidate `['clinic','queue-entries']`, `['payments']`, `['debt', patient_id]`; toast with `total_collected` / `debt_remaining`; close modal. Optional "Print Receipt" off returned `payment_ids` (grouped via shared `queue_entry_id`).

### `DispenseCheckout.tsx`
- Post-success always navigates to `/clinic/queue` (RPC now closes the ticket for both paid and partial).

## Out of scope
- No `payments.allocation_id` column — implicit batching via the temp ticket's `queue_entry_id`.
- No FEFO / panel-claim / owe-slip trigger changes.
- No `visit_type` enum constraint change (free-text column, matches `direct_sale`).

## Files
- New migration: `<ts>_fix_checkout_visit_and_add_settle_multiple_debts.sql`
- New: `src/components/clinic/billing/SettleDebtModal.tsx`
- Edited: `src/components/clinic/RegisterAndCheckInDialog.tsx`, `src/pages/clinic/QueueBoard.tsx`, `src/pages/clinic/DispenseCheckout.tsx`
