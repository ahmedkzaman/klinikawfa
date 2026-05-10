# Wave 5 — Partial Dispensing & Billing Sync

Bring the pharmacist into the billing loop: charge for what's actually dispensed, and auto-create owe-slips for stock shortfalls. UI-only wave — DB schema and `commit_inventory_fefo` already shipped in Wave 4.

## Scope

1. New row component `DispenseItemRow` for the medicine line in checkout (qty + reason + live line total).
2. A pharmacy-only "Dispense" panel rendered above billing on `DispenseCheckout.tsx`, listing only medicine rows (`item_id != null`).
3. Bill totals (subtotal/total/outstanding) in `BillingDetailsColumn` switch from `quantity` → `dispensed_qty ?? quantity` so charges = what left the building.
4. "Complete Checkout" gated until every partial line has a `partial_reason`.
5. Subtle inline badges on existing item rows (`VisitDetailsColumn` Medicine tab) showing **Partial** / **Owe** when applicable, so doctors looking at the visit see the truth.

Out of scope (next waves): doctor-side stock badges in prescribing picker, restock review page, audit trail filters.

## Files

**New**
- `src/components/clinic/visit/DispenseItemRow.tsx` — single medicine line, debounced auto-save via `useUpdateDispensedQty`. Shows: name, prescribed qty, editable dispense qty (clamped 0..prescribed), reason `Select` (only when partial), live line total, "Owe N" badge when `out_of_stock`.
- `src/components/clinic/visit/DispensePanel.tsx` — wraps the medicine list, renders empty state if no medicine rows, surfaces a top banner when any partial line is missing a reason.

**Edited**
- `src/pages/clinic/DispenseCheckout.tsx`
  - Insert `<DispensePanel items={items} consultationId={consultation.id} />` above `BillingDetailsColumn`.
  - Recompute `subtotal` / `outstanding` using `dispensed_qty ?? quantity`.
  - Add `anyPartialMissingReason` guard; disable "Complete Checkout" + tooltip "Select a reason for all partial items".
- `src/components/clinic/visit/BillingDetailsColumn.tsx`
  - Same `dispensed_qty ?? quantity` change in `subtotal` calc so totals match the footer.
- `src/components/clinic/visit/VisitDetailsColumn.tsx` (Medicine tab only)
  - Show small `Partial` / `Owe N` badge next to qty when `dispensed_qty < quantity`.

## Technical notes

- Auto-save on each row uses 500ms debounce calling existing `useUpdateDispensedQty` (already wired and invalidates `consultation_items`). No new hooks.
- DB trigger from Wave 4 already creates an `inventory_transaction` + `pharmacy_owe_slip` on consultation completion when `partial_reason='out_of_stock'` — this wave just needs to set the field correctly.
- Reason enum at the DB level is `'patient_request' | 'out_of_stock'`. UI will render only those two options.
- Clamp dispense qty: `Math.max(0, Math.min(prescribed, value))`. Setting `dispensed_qty = quantity` clears `partial_reason` to null automatically (handled in the mutation call).
- All styling uses semantic tokens (`bg-card`, `text-muted-foreground`, `border-border`, `text-amber-700`-style accents only for the partial warning state, consistent with existing `Alert` usage in the file).
- No `BillingDetailsColumn` API changes — it already receives `items`, just reads them differently.

## Acceptance

- Pharmacist can lower dispense qty on any med line; total updates instantly; "Complete Checkout" blocks until reason chosen.
- Selecting `out_of_stock` and completing visit creates an entry in the existing Owe-Slips dashboard.
- Selecting `patient_request` reduces the bill but creates no owe-slip.
- Non-medicine rows (services, packages) are untouched and still bill at full quantity.
