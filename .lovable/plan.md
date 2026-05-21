## Fix: Direct Sale (and every consultation) shows 0 items after adding

### Root cause
`useConsultationItems` runs:
```ts
.select('*, inventory_items(unit), services(name), packages(name)')
```
…but `public.inventory_items` has no `unit` column — the actual column is `unit_of_measure`. Every fetch fails with HTTP 400 (`column inventory_items_1.unit does not exist`), so `items` is always `[]`. Confirmed in network logs and DB:
- DB row exists: `SYP.PARACETAMOL 250MG 60ML (UPHAMOL)` on consultation `8960bfb1-…`.
- Three GETs to `consultation_items?...inventory_items(unit)...` returned 400 with the column-not-found error.

That single failed query starves all consumers: `BillingDetailsColumn`, `VisitDetailsColumn` (the All/Items tabs and "No items prescribed" empty state), and `DispensePanel`.

### Fix (one-line change, no migration)
In `src/hooks/clinic/useConsultationItems.ts`, alias the real column to keep the rest of the codebase unchanged:
```ts
.select('*, inventory_items(unit:unit_of_measure), services(name), packages(name)')
```
This preserves the existing `inventory_items?.unit` shape consumed by `VisitDetailsColumn.tsx` (lines 69 & 164) and `printDrugLabel.ts`, so no other files need to be touched.

### Verification
1. Reload `/clinic/queue/checkout/...`.
2. The already-added paracetamol row should immediately appear under **All / Items** with count `1`, and `BillingDetailsColumn` should pick it up for totals.
3. Adding a second OTC item should update the list live (react-query invalidation already wired up).

### Out of scope
- No schema changes, no other component edits.
- Not refactoring the broader inventory-unit naming (`unit_of_measure` vs `unit`) — that would be a separate cleanup.
