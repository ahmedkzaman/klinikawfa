# Smart Pharmacy: Batch Tracking, FEFO & Partial Dispensing

Layered on top of the existing `inventory_items` / `consultation_items` / reserve-commit pipeline. **No parallel "medicines" schema** — we extend, not fork.

## Goals

1. Stock counted at **batch** level (batch no, expiry, qty remaining, cost).
2. **FEFO** consumption — oldest unexpired batch consumed first, with row-level locking.
3. **Partial dispensing** — `dispensed_qty` becomes the source of truth for inventory + billing + COGS.
4. **Owe-slip** queue when dispense < prescribed because of OOS, with a dashboard.
5. **Doctor-side visibility** — green/amber/red badges on the prescribing picker + soft warning + "Request restock".
6. **Full audit ledger** (`inventory_transactions`) with a per-item history drawer.

---

## 1. Database (single migration)

### New tables

`inventory_item_batches`
- `id`, `inventory_item_id` → `inventory_items.id`
- `batch_number` text, `expiry_date` date NOT NULL
- `quantity_initial` int, `quantity_remaining` int (>= 0)
- `cost_price` numeric(10,2)
- `received_at` timestamptz, `received_by` uuid, `po_id` uuid nullable
- Indexes: `(inventory_item_id, expiry_date ASC)` partial where `quantity_remaining > 0`

`inventory_transactions`
- `id`, `inventory_item_id`, `batch_id` (nullable for adjustments)
- `transaction_type` check `('restock','dispense','adjustment','return','write-off','expire')`
- `qty_change` int (signed)
- `consultation_item_id` uuid nullable, `consultation_id` uuid nullable, `patient_id` uuid nullable
- `reason_code` text nullable (`patient_request`, `out_of_stock`, `expired`, `count_correction`, …)
- `notes` text, `performed_by` uuid, `created_at` timestamptz
- Indexes on `(inventory_item_id, created_at DESC)` and `(consultation_id)`

`pharmacy_owe_slips`
- `id`, `consultation_item_id` UNIQUE, `consultation_id`, `patient_id`, `inventory_item_id`
- `qty_owed` int, `qty_fulfilled` int default 0
- `status` text check `('open','partially_fulfilled','fulfilled','cancelled')`
- `created_at`, `created_by`, `closed_at`, `closed_by`, `notes`

### Schema changes

```sql
ALTER TABLE consultation_items
  ADD COLUMN dispensed_qty integer,
  ADD COLUMN is_partial boolean GENERATED ALWAYS AS
    (dispensed_qty IS NOT NULL AND dispensed_qty < quantity) STORED,
  ADD COLUMN partial_reason text;  -- 'patient_request' | 'out_of_stock' | null
```

### RLS
- `inventory_item_batches`, `inventory_transactions`, `pharmacy_owe_slips`: SELECT for `is_staff_or_admin`, INSERT/UPDATE via SECURITY DEFINER RPCs only.

### RPCs (all `SECURITY DEFINER`, `SET search_path = public`)

`add_inventory_batch(_item_id, _batch_number, _expiry, _qty, _cost, _po_id)`
- Inserts batch, increments `inventory_items.stock`, refreshes `nearest/latest_expiry_date`, logs `restock` transaction.

`commit_inventory_fefo(_item_id, _qty, _consultation_item_id, _consultation_id, _patient_id, _reason)` — **replaces direct call to `commit_inventory` for batch-tracked items**
1. `pg_advisory_xact_lock(hashtext('inv:'||_item_id))`
2. Loop: pick oldest batch where `expiry_date >= CURRENT_DATE` and `quantity_remaining > 0`, `FOR UPDATE`.
3. Decrement batch + insert `inventory_transactions(type='dispense', batch_id, ...)`.
4. Continue until `_qty` consumed or no batches → return `{dispensed: int, shortfall: int}`.
5. Caller decides whether shortfall becomes an owe-slip.

`adjust_inventory_batch(_batch_id, _delta, _reason, _notes)` — stock-take corrections, write-offs.

`expire_inventory_batches()` — nightly cron candidate; zeroes expired batches and logs `expire` rows. (Out of scope to schedule; just create the function.)

### Trigger refactor

Patch `trg_consultations_inventory` so on consultation `completed`:
- For each active `consultation_items` row, call `commit_inventory_fefo(item, COALESCE(dispensed_qty, quantity), …, partial_reason)`.
- If `dispensed_qty < quantity` and `partial_reason = 'out_of_stock'`, INSERT into `pharmacy_owe_slips`.
- `release_inventory` for the unused reserved portion.

`reserve_inventory` / `release_inventory` keep their current job (allocated_quantity guard at master level).

### Backfill
- One synthetic batch per existing `inventory_items` with `quantity_initial = quantity_remaining = stock`, `expiry_date = COALESCE(latest_expiry_date, current_date + 365)`, `batch_number = 'LEGACY'`. Keeps existing stock visible without breaking anything.

---

## 2. Hooks (`src/hooks/clinic/`)

- `useInventoryBatches(itemId)` — list batches with computed status (expired / expiring ≤ 90d / ok).
- `useAddBatch()` — calls `add_inventory_batch` RPC.
- `useAdjustBatch()` — calls `adjust_inventory_batch`.
- `useInventoryTransactions(itemId)` — paginated ledger.
- `useOweSlips({ status })` — for the dashboard.
- `useFulfillOweSlip()` — closes owe-slip + commits FEFO for the fulfilled qty.
- Update `useInventoryItems` to expose derived `total_unexpired_stock`, `nearest_expiry_date_live`, and a `stock_status: 'green'|'amber'|'red'`.

---

## 3. UI

### A. Stock Master (`src/pages/clinic/Inventory.tsx`)
- New **status pill column**: Red (expired or stock = 0), Amber (below `stock_amount_warning` OR nearest batch expires < 90 days), Green otherwise.
- Row click → existing detail sheet, gains two new tabs:
  - **Batches** — table of batches (FEFO order), "Add Batch" button, edit/adjust per row. Expired rows greyed.
  - **Ledger** — `inventory_transactions` history with type, qty, who, when, linked patient/consultation.

### B. Dispensary / Checkout (`src/pages/clinic/DispenseCheckout.tsx`)
- Each prescription line shows `prescribed_qty` and an editable `dispensed_qty` (defaults equal, max = prescribed).
- If pharmacist reduces it → required `partial_reason` select (`Patient request` / `Out of stock`).
- Live total recalculates from `dispensed_qty × price` — **invoice/bill uses dispensed_qty**.
- "Partial Dispense" badge on the bill when any line is partial.
- Disabled "Confirm & Dispense" until all partial lines have a reason.

### C. Doctor prescribing picker (`Consultation.tsx` add-item search)
- Each result shows a coloured dot + tooltip:
  - Green: `available ≥ 10`
  - Amber: `1–9` → "Limited stock"
  - Red: `0` → still selectable (soft) but with banner "Out of stock — patient may receive owe-slip"
- Inline **"Request restock"** link on amber/red → inserts a row in a lightweight `restock_requests` table (or reuses `notifications`); admin sees it in the Inventory page.

### D. Owe-Slip Dashboard (`src/pages/clinic/OweSlips.tsx`, new route `/clinic/owe-slips`)
- Table grouped by patient: item, qty owed, days open, consultation link.
- Filters: open / partially fulfilled / fulfilled.
- "Fulfill" action → opens a small dialog, FEFO commits the qty, updates owe-slip status, logs transaction with `reason_code='owe_slip_fulfilled'`.
- Auto-surfaces a banner on the Inventory page: *"5 patients waiting on Amoxicillin — restock arrived?"*

### E. Navigation
- Add "Owe Slips" link inside the existing Clinic sidebar group.

---

## 4. Out of scope (next round)

- Cron scheduling for `expire_inventory_batches`.
- Panel-claim "under-served" flag synchronisation with TPAs.
- Inventory Turnover dashboard / COGS reporting page.
- SMS / WhatsApp notification to patients when their owe-slip is ready (we'll add the hook point only).
- Multi-location batches (`location_id` exists but stays single-site for now).

---

## 5. Risk register

| Risk | Mitigation |
|---|---|
| Existing items have no batches → FEFO fails | LEGACY batch backfill in the migration |
| Two pharmacists dispense same item simultaneously | `pg_advisory_xact_lock` per item + `FOR UPDATE` on batch row |
| Pharmacist forgets reason on partial → silent revenue leak | UI hard-block + DB check `(is_partial = false) OR (partial_reason IS NOT NULL)` |
| Backfill batch with no real expiry date masks expiring stock | Surface "LEGACY" batches in amber on Stock Master and prompt admin to edit |
| Trigger change breaks current consultation completion flow | `commit_inventory_fefo` falls back to `commit_inventory` if no batches exist for the item |

---

## 6. Implementation order

1. Migration (tables + RPCs + trigger patch + backfill).
2. Hooks.
3. Inventory page: status pills + Batches tab + Ledger tab + Add Batch flow.
4. Dispensary: partial qty + reason + dispensed_qty billing.
5. Consultation picker: stock badges + request restock.
6. Owe-Slip dashboard + nav link.

Approve this and I'll execute it in that order.
