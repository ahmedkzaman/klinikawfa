## Phase 2C — ERP Completion: Vendor Invoices, Packages & Stock Take

Build three new ERP modules: **Vendor Invoices** (Accounts Payable in Procurement), **Clinic Packages** (Inventory bundles), and **Stock Take** (inventory reconciliation with audit trail).

---

### Task 1 — Database Migration

Create migration `create_erp_completion_schema.sql` with four new tables. Standard pattern: UUID PK, `created_at`, `updated_at` with `update_updated_at_column()` triggers, RLS enabled, authenticated staff/admin policies via `is_ops_or_admin(auth.uid())`.

**`vendor_invoices`**
- `id`, `invoice_no` (text, not null), `supplier_id` (uuid → suppliers), `po_id` (uuid → purchase_orders, nullable)
- `amount` (numeric, default 0), `due_date` (date), `payment_ref` (text, nullable)
- `status` (text, default `'Open'`) with CHECK constraint in `('Open','Paid','Overdue')`
- Indexes on `supplier_id`, `po_id`, `status`

**`clinic_packages`**
- `id`, `name` (text, not null), `description` (text, nullable)
- `total_price` (numeric, default 0), `status` (text, default `'active'`)

**`clinic_package_items`**
- `id`, `package_id` (uuid → clinic_packages ON DELETE CASCADE)
- `inventory_item_id` (uuid → inventory_items), `quantity` (int, default 1)

**`inventory_adjustments`** (immutable audit log)
- `id`, `inventory_item_id` (uuid → inventory_items)
- `previous_stock` (int), `new_stock` (int)
- `variance` (int, `GENERATED ALWAYS AS (new_stock - previous_stock) STORED`)
- `reason` (text, nullable), `adjusted_by` (uuid, default `auth.uid()`)
- `created_at` only (no updates) — INSERT + SELECT policies only

**RLS policies (per existing pattern):**
- SELECT: `to authenticated using (true)`
- INSERT/UPDATE/DELETE: `is_ops_or_admin(auth.uid())` (DELETE omitted for `inventory_adjustments`)

---

### Task 2 — Vendor Invoices UI

**New hook** `src/hooks/clinic/useVendorInvoices.ts`
- `useVendorInvoices()` — list with joined `supplier:suppliers(name)` and `po:purchase_orders(po_number)`
- `useCreateVendorInvoice()`, `useMarkInvoicePaid({id, payment_ref})`

**New components** in `src/components/clinic/procurement/`:
- `VendorInvoiceDialog.tsx` — form: Invoice No, Supplier (Select from suppliers), Linked PO (optional Select from POs filtered by supplier), Amount, Due Date
- `MarkPaidDialog.tsx` — small modal with Payment Reference input → flips status to `Paid`

**Edit `Procurement.tsx`** — replace the `invoices` TabsContent empty state with:
- Card header "Vendor Invoices" + "Log Invoice" button
- Table: Invoice No · Supplier · Linked PO · Amount (right-aligned RM) · Due Date · Status badge (Open=amber, Paid=green, Overdue=destructive) · row dropdown (`MoreHorizontal`) with "Mark as Paid" (hidden when already Paid)
- Loading + empty states matching existing PO table style

---

### Task 3 — Inventory Packages UI

**New hooks** `src/hooks/clinic/useClinicPackages.ts` (separate from existing `usePackages.ts` which targets a different legacy `packages` table)
- `useClinicPackages()` — list packages
- `useClinicPackageItems(packageId)` — items for a package with joined inventory item name
- `useUpsertClinicPackage()` — insert/update + reconcile items (delete-then-insert pattern, mirroring `useReconcilePackageItems` in `usePackages.ts`)
- `useDeleteClinicPackage()`

**New component** `src/components/clinic/inventory/PackagesPanel.tsx`
- Split layout (grid `lg:grid-cols-[280px_1fr]`):
  - **Left:** scrollable list of clinic_packages, "+ New Package" button at top, click to select/edit; selected row highlighted
  - **Right:** Builder form
    - Inputs: Name, Total Price (RM), Description (optional)
    - Dynamic items table with columns: Item · Quantity · Remove
    - "Add Item" row with inventory item search (Combobox using `useInventoryItems` filtered by `status='active'`) + quantity input
    - Save / Delete buttons
- Empty state when no package selected: "Select a package on the left or create a new one."

**Edit `Inventory.tsx`** — when `subNav === 'packages'`, render `<PackagesPanel />` instead of the empty-state card.

---

### Task 4 — Stock Take UI

**New hook** `src/hooks/clinic/useInventoryAdjustments.ts`
- `useReconcileStock()` mutation: for each changed item, runs in sequence:
  1. `INSERT INTO inventory_adjustments (inventory_item_id, previous_stock, new_stock, reason, adjusted_by)` — `variance` auto-computed
  2. `UPDATE inventory_items SET stock = :new_stock WHERE id = :id`
- Invalidates `['inventory_items']` and `['clinic','inventory-dashboard']` query keys on success

**New component** `src/components/clinic/inventory/StockTakePanel.tsx`
- Header: "Stock Take · Reconciliation" + summary chip showing count of rows with changes
- Table over active inventory_items (from `useInventoryDashboard`-style query, excluding archived):
  - Columns: Item · Category · Current System Stock · **Physical Count** (controlled `<Input type="number">`) · Variance (live computed, color-coded: red negative, green positive)
- Optional "Reason / Notes" textarea above the action bar
- Sticky bottom bar: "Reconcile (n changes)" button — disabled when no rows differ
- On submit: confirm dialog → run mutation → toast success → reset local edits → refetch
- Loading skeletons + empty state

**Edit `Inventory.tsx`** — when `subNav === 'stock_take'`, render `<StockTakePanel />`.

---

### Technical notes

- **Naming clash avoided:** existing `packages` table + `usePackages.ts` are kept untouched; new module uses `clinic_packages` + `useClinicPackages.ts`.
- **`inventory_adjustments.variance`** uses Postgres generated column — never written from client.
- **`adjusted_by`** defaults to `auth.uid()` so RLS INSERT can simply check `auth.uid() = adjusted_by`.
- **Status badges** reuse existing color tokens used in PO table.
- **Types regenerate automatically** after migration — do not touch `src/integrations/supabase/types.ts`.
- No changes to routing or settings pages required.

### Files created
- `supabase/migrations/<ts>_create_erp_completion_schema.sql`
- `src/hooks/clinic/useVendorInvoices.ts`
- `src/hooks/clinic/useClinicPackages.ts`
- `src/hooks/clinic/useInventoryAdjustments.ts`
- `src/components/clinic/procurement/VendorInvoiceDialog.tsx`
- `src/components/clinic/procurement/MarkPaidDialog.tsx`
- `src/components/clinic/inventory/PackagesPanel.tsx`
- `src/components/clinic/inventory/StockTakePanel.tsx`

### Files modified
- `src/pages/clinic/Procurement.tsx` (Vendor Invoices tab)
- `src/pages/clinic/Inventory.tsx` (Packages + Stock Take sub-nav content)
