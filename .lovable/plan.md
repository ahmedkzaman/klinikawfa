## Phase 2B — Procurement Engine

Build a full PO + Supplier system on top of the existing `inventory_items` table, with a tabbed Procurement dashboard, side-sheet PO builder, and a "Receive Goods" action that increments inventory stock.

### 1. Database migration

Create three new tables (UUID PKs, `created_at timestamptz default now()`), plus an `update_updated_at_column` trigger on each:

**`suppliers`**
- `name text not null`
- `contact_person text`
- `phone text`
- `email text`
- `status text not null default 'active'` (active | inactive)
- `notes text`
- `updated_at timestamptz default now()`

**`purchase_orders`**
- `po_number text not null unique` — generated as `PO-YYYYMMDD-####` via a small SQL helper (mirrors the existing `PC-` claim numbering)
- `supplier_id uuid not null references suppliers(id) on delete restrict`
- `order_date date not null default current_date`
- `expected_date date`
- `status text not null default 'Draft'` — validation trigger restricts to {Draft, Sent, Received, Cancelled}
- `total_amount numeric(12,2) not null default 0`
- `notes text`
- `received_at timestamptz`
- `received_by uuid`
- `created_by uuid`
- `updated_at timestamptz default now()`

**`purchase_order_items`**
- `po_id uuid not null references purchase_orders(id) on delete cascade`
- `inventory_item_id uuid not null references inventory_items(id) on delete restrict`
- `order_qty integer not null check (order_qty > 0)`
- `received_qty integer not null default 0`
- `unit_cost numeric(12,2) not null default 0`
- `total_price numeric(12,2) generated always as (order_qty * unit_cost) stored`

**Indexes:** `purchase_orders(supplier_id)`, `purchase_orders(status)`, `purchase_order_items(po_id)`.

**RLS:** enable on all three. Policies use the existing `is_staff_or_admin(auth.uid())` helper:
- SELECT / INSERT / UPDATE / DELETE — `to authenticated using (public.is_staff_or_admin(auth.uid())) with check (public.is_staff_or_admin(auth.uid()))`.

**RPC `receive_purchase_order(_po_id uuid)`** (SECURITY DEFINER, atomic):
1. Verify caller via `is_staff_or_admin`.
2. Lock the PO row; ensure status = 'Sent'.
3. For each `purchase_order_items` row: `update inventory_items set stock = stock + order_qty, updated_at = now() where id = inventory_item_id`; set `received_qty = order_qty`.
4. Update PO: `status='Received'`, `received_at=now()`, `received_by=auth.uid()`.

### 2. Data hooks (`src/hooks/clinic/`)

- **`useSuppliers.ts`** — list/add/update/archive (`status='inactive'`).
- **`usePurchaseOrders.ts`** — list (joined with supplier name), getById (with items joined to inventory item name), createDraft, updateHeader, setStatus (Draft→Sent, →Cancelled), `receiveGoods` (calls the `receive_purchase_order` RPC).
- **`usePurchaseOrderItems.ts`** — addLine, updateLine, removeLine. After each mutation, recompute and persist `purchase_orders.total_amount` (sum of `order_qty * unit_cost`).

All hooks invalidate `['purchase_orders']`, `['suppliers']`, and (after receive) `['inventory_items']`.

### 3. Procurement dashboard (`src/pages/clinic/Procurement.tsx`)

Replace the placeholder with a Shadcn `Tabs` shell:

```text
[ Purchase Orders ] [ Suppliers ] [ Vendor Invoices ]
```

- **Purchase Orders tab** — DataTable: `po_number`, supplier name, `order_date`, `total_amount` (RM), status badge. Header has `+ Add PO` (creates a Draft PO and opens `POSheet`). Row click opens the sheet.
- **Suppliers tab** — DataTable: name, contact person, phone, email, status. Header `+ New Supplier` opens `SupplierDialog` (simple modal with the four fields). Row click opens edit mode of the same dialog.
- **Vendor Invoices tab** — empty state card (“Coming in Phase 2C”).

Status badges use existing `StatusBadge` styling conventions: Draft=muted, Sent=blue, Received=green, Cancelled=destructive.

### 4. PO Builder & Receiving Sheet (`src/components/clinic/procurement/POSheet.tsx`)

Right-side `Sheet` (max-w-3xl):

**Header section**
- Supplier `Select` (sourced from active suppliers).
- `order_date` and `expected_date` date pickers.
- Status badge + read-only `po_number`.

**Line items table**
- Columns: Item (combobox over `inventory_items` filtered by `status='active'`, `archived_at IS NULL`), Order Qty, Unit Cost (RM), Total (auto = qty × cost).
- `+ Add Line` row at the bottom. Trash icon per row to remove.
- When picking an item, prefill `unit_cost` with the item's `cost_price`.
- All edits debounced; saves persist via the line-item hook (which recomputes header total).

**Footer**
- Grand total (sum of line totals).
- Action buttons by status:
  - **Draft** → `Save Draft`, `Mark as Sent` (requires ≥1 line and supplier).
  - **Sent** → primary `Receive Goods` (confirm dialog → calls `receiveGoods` RPC → shows toast and closes).
  - **Received / Cancelled** → read-only banner; no edits.
  - Secondary `Cancel PO` available in Draft and Sent.

### 5. Supplier dialog (`src/components/clinic/procurement/SupplierDialog.tsx`)

Simple Shadcn `Dialog` with Name (required), Contact Person, Phone, Email, Status toggle. Used for both create and edit.

### 6. Files to add / change

```text
supabase/migrations/<ts>_create_procurement_schema.sql       (new)
src/hooks/clinic/useSuppliers.ts                              (new)
src/hooks/clinic/usePurchaseOrders.ts                         (new)
src/hooks/clinic/usePurchaseOrderItems.ts                     (new)
src/components/clinic/procurement/POSheet.tsx                 (new)
src/components/clinic/procurement/SupplierDialog.tsx          (new)
src/components/clinic/procurement/POLineItemsTable.tsx        (new)
src/pages/clinic/Procurement.tsx                              (rewrite)
```

No changes to existing inventory or claims code; receive flow goes through the new RPC so stock updates remain atomic and auditable.
