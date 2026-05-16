## Procurement Dashboard — Stage 1 & 2

### Key architectural decision

The project **already has a complete movement ledger**: `public.inventory_transactions`, with all required movement types (`restock`, `dispense`, `adjustment`, `return`, `write-off`, `expire`, `owe_slip_fulfilled`), batch linkage, consultation/patient linkage, performed_by, and an index on `(inventory_item_id, created_at DESC)`. It is already wired into dispensing via `commit_inventory_fefo()` and `trg_consultations_inventory`, so every dispense, batch adjustment, restock and expiry already writes a row.

**We will NOT create a parallel `stock_movements` table.** Doing so would duplicate state, break the existing FEFO/owe-slip flow, and require re-wiring Dispensary, RestockReview, and batch adjustment hooks. Instead we treat `inventory_transactions` as the canonical ledger and build the dashboard + classification on top of it. This is the single biggest deviation from the brief, and it's the safe one.

The brief's `balance_after` column is also omitted — it's derivable from `inventory_items.stock` + a running sum, and storing it would create drift risk with the existing FEFO trigger. If needed later, we'll expose it as a SQL view.

### Stage 1 — Server-side aggregation (SQL view)

Stage 4 will need lift/correlation math; we set the pattern now by computing classification in Postgres, not React. A single read-only view does the heavy lifting and the React hook just selects from it.

Migration creates `public.v_inventory_movement_stats`:
- One row per active `inventory_items` row
- Columns: `item_id`, `name`, `current_stock`, `reorder_level`, `used_30d`, `used_90d`, `avg_daily_usage` (= used_90d / 90), `days_cover` (NULL when avg=0, meaning "infinite"), `movement_status` ('fast' | 'normal' | 'slow' | 'dead'), `last_dispensed_at`
- Source: aggregate `inventory_transactions` where `transaction_type = 'dispense'` and `qty_change < 0` over the windows
- `security_invoker = on` so existing RLS on `inventory_transactions` and `inventory_items` applies

Classification rules (per brief, plus a "dead" tier for zero-usage so the Slow bucket isn't overloaded):
- **fast**: `days_cover < 30 AND used_30d > 0`
- **dead**: `used_90d = 0`
- **slow**: `days_cover > 90` (and not dead)
- **normal**: everything else

### Stage 2 — UI

**Route:** `/clinic/procurement-dashboard` (the existing `/clinic/procurement` is the PO/supplier screen — keep both, don't collide). Gated by `is_ops_or_admin` via `ClinicProtectedRoute`.

**New files:**
- `src/hooks/clinic/useProcurementStats.ts` — `useProcurementStats()` selects from the view; `useStockMovements({ limit, itemId? })` selects from `inventory_transactions` joined to `inventory_items(name)`.
- `src/pages/clinic/ProcurementDashboard.tsx` — Tabs UI matching existing `Procurement.tsx` style.

**Tab 1 — Overview**
- 4 KPI cards: Total Active Items, Fast Moving, Slow/Dead, Critical Low Stock (current_stock ≤ reorder_level).
- Table: Item, Current Stock, Used 30d, Used 90d, Avg/day, Days Cover (`∞` when null), Status badge. Sortable, search by name, filter by status.

**Tab 2 — Movement Ledger**
- Table from `inventory_transactions` desc by `created_at`: Date/time, Item, Type (badge color by type), Qty Change (green +/red −), Reason/notes, Performed by.
- Filters: date range, item, type. Pagination 50/page.

**Sidebar:** add "Procurement Dashboard" link under the existing Procurement section.

### Stage "wire dispensary"

No code change needed. The existing `commit_inventory_fefo()` trigger already inserts a `dispense` row with negative `qty_change` for every dispensed item, including consultation_item_id, consultation_id, patient_id, batch_id, and performed_by. Manual adjustments (`adjust_inventory_batch`), restocks (`add_inventory_batch`), and expiries (`expire_inventory_batches`) likewise already log. Verification step only.

### Files touched

```text
supabase migration         # create view v_inventory_movement_stats
src/App.tsx                # add route /clinic/procurement-dashboard
src/components/clinic/ClinicLayout.tsx   # add sidebar link (verify file)
src/hooks/clinic/useProcurementStats.ts  # NEW
src/pages/clinic/ProcurementDashboard.tsx # NEW
```

### Out of scope (deferred to later stages)

- Lift/correlation between diagnoses and dispensed items (Stage 3/4).
- Auto-PO suggestions from days-cover (Stage 3).
- Predictive forecasting / seasonality (Stage 4).
- `balance_after` column — derivable, not stored.

### Verification

1. Open `/clinic/procurement-dashboard` as ops → see KPIs and table populated from real data.
2. Dispense an item in checkout → refresh Movement Ledger → new `dispense` row with negative qty appears immediately.
3. Item with heavy recent dispensing flips to red "Fast" badge; item with no 90-day usage shows "Dead".
4. Item with `avg_daily_usage = 0` shows `∞` days cover, no crash.
