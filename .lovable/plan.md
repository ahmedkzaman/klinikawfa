# Pharmacy Supply Chain Loop

Two coordinated changes that connect the doctor's prescribing screen to an operations dashboard via the existing `restock_requests` table.

## Part 1 — Doctor-side: `AddTreatmentBulkDialog.tsx`

### 1a. Inline stock badges (search results)
For rows where `type === 'item'`, render a small badge under the item name based on `stock` (already in `inventory_items`):
- `0` → red destructive badge "Out of stock"
- `1–10` → amber/warning badge "Low stock: N"
- `>10` → muted/green badge "N in stock"

If `nearest_expiry_date` exists and is within 30 days of today, append an orange "Expiring soon" badge with a `Clock` icon.

Non-inventory rows (services, packages, free text) get no badge.

### 1b. Low-stock warning banner (Selected Items section)
Above the Selected list (or just below its header), compute selected rows whose underlying inventory item has `stock <= 10`. If any exist, render a single `<Alert variant="destructive">` (shadcn alert — no `warning` variant exists, so we use destructive styling tinted amber via className) titled "Low stock on selected items".

Inside, list each low-stock item as a row: item name + current stock + a "Request Restock" button.

### 1c. One-click restock
Each row's button calls `useCreateRestockRequest().mutate({ itemId })`. On success (or while pending) the button disables and changes label to "Pharmacy notified". Track per-item state with a local `Set<itemId>` so multiple items can be requested independently. Toast already handled inside the hook.

## Part 2 — Ops dashboard: `src/pages/clinic/RestockReview.tsx`

### 2a. Access control
Use the existing `useAuth()` role system (the app does not have `staff nurse` / `admin manager` / `staff purchaser` roles — see Technical Notes for mapping). The page is gated to `isStaffOrAdmin` which already covers operations, staff, admin, special_admin, doctor_admin, resident_doctor. Locum doctors are excluded.

If role check fails: render an "Access denied" card. The sidebar link is hidden for the same condition.

### 2b. UI
- Page header: "Restock Requests" + count badge of open items.
- Fetch via `useRestockRequests('open')` — already returns `inventory_items(name)` and core fields. Extend the hook (or add a sibling hook) to also join `profiles!requested_by(full_name)` so we can show the requester.
- Data table columns: **Date Requested** (relative + tooltip), **Item**, **Requested By**, **Reason**, **Action**.
- Empty state: friendly card "No open restock requests — pharmacy is caught up."

### 2c. "Mark as Ordered" action
New mutation `useCloseRestockRequest` in `useRestockRequests.ts`:
```
update restock_requests set status='closed', closed_at=now(), closed_by=auth.uid() where id=$1
```
Invalidates `['restock_requests']`. Button shows confirm via `AlertDialog`, then row disappears from the open queue.

### 2d. Routing & sidebar
- Add `<Route path="/clinic/inventory/restock-review" element={<RestockReview />} />` inside the existing clinic protected route block in `App.tsx`.
- Add link to the **Inventory** sidebar group (in whichever clinic sidebar component is used — will read it during build to confirm exact file). Link is conditionally rendered using the same role check.

## Technical Notes

**Role mapping.** The app's `AppRole` enum is: `special_admin | admin | doctor_admin | operations | staff | locum | resident_doctor | guest`. The roles you listed don't exist as-is, so I'll map them to the closest existing equivalents and gate with `isStaffOrAdmin` (which equals: admin, staff, special_admin, operations, doctor_admin, resident_doctor — locum excluded). If you want a stricter gate (e.g. exclude generic `staff`), say the word and I'll narrow it.

**No DB migration needed.** `restock_requests` table, RLS, and the `useCreateRestockRequest` hook already exist. We only need to add a `close` mutation that runs an UPDATE — RLS for that update must already permit ops roles; if it doesn't, I'll add a migration in the build step.

**Stock data.** `inventory_items` rows already include `stock` and `nearest_expiry_date`, both surfaced through the picker's `allItems` mapping — no extra query needed.

**Files touched**
- `src/components/clinic/consultation/AddTreatmentBulkDialog.tsx` (badges + warning alert + restock buttons)
- `src/hooks/clinic/useRestockRequests.ts` (add requester join + `useCloseRestockRequest`)
- `src/pages/clinic/RestockReview.tsx` (new page)
- `src/App.tsx` (route)
- Clinic sidebar component (add gated nav link — exact file confirmed at build)

**Out of scope:** auto-PO generation, supplier selection, notification emails, or schema changes to `restock_requests`.
