## Goal
Make the dispensary/checkout cart render service and package rows alongside inventory items, with the correct icons and no medicine-only controls leaking onto them.

## Findings
- `useConsultationItems` currently selects `*, inventory_items(unit)` — services and packages are not joined, so `item.services?.name` / `item.packages?.name` are unavailable.
- `useAddConsultationItem` already invalidates `['consultation_items', consultationId]`, so no mutation wiring change is needed.
- `VisitDetailsColumn.ItemList` already conditionally hides dosage chips, Edit Instructions, and Print Label behind `item.item_id`. Services and packages would render cleanly today — they just have no leading icon, and we want the displayed name to prefer the joined catalog name when present.
- `DispenseCheckout.tsx` has two `item_id` checks (lines 174, 188) — both are correctly scoped (dispensed_qty / partial reason are medicine-only). **Not** strict filters on the visible list. Leave them.
- No strict `.filter(row => row.item_id)` hides services/packages from the UI.

## Changes

### 1. `src/hooks/clinic/useConsultationItems.ts`
- Change select string to:
  `'*, inventory_items(unit), services(name), packages(name)'`
- No change to mutations (invalidation already correct).

### 2. `src/components/clinic/visit/VisitDetailsColumn.tsx`
- Extend `ConsultationItemRow` type with:
  - `services?: { name: string | null } | null`
  - `packages?: { name: string | null } | null`
- Import `Stethoscope` and `Package as PackageIcon` (already imported for empty states — reuse).
- In `ItemList`, before the bold name:
  - If `item.service_id`: render `<Stethoscope className="h-4 w-4 text-sky-600 shrink-0" />`
  - Else if `item.package_id`: render `<PackageIcon className="h-4 w-4 text-violet-600 shrink-0" />`
  - Else: no icon (inventory rows stay as-is).
- Display name: prefer `item.services?.name` / `item.packages?.name` when set, else fall back to `item.item_name` (so legacy rows still render).
- Wrap the icon + name+meta block in a small `flex items-start gap-2` so the icon sits next to the title without affecting the existing right-rail layout.
- All existing `item.item_id` gates (dosage chips, Edit Instructions, Print Label, owe-slip badge) remain — services/packages naturally skip them.

### 3. No changes
- `DispenseCheckout.tsx`: subtotal & partial-reason checks stay (correctly medicine-scoped).
- No new mutations or query keys.

## Acceptance
- Adding a service via `CatalogItemPicker` immediately renders a row with a Stethoscope icon, service name, qty, tier price — no dosage chips, no Edit/Print buttons.
- Same for packages with the Package icon.
- Inventory rows are pixel-identical to today (icon-less, full medicine controls).
- Subtotal includes services/packages (already does — quantity × price).
- No regression to drug-label printing or dispensed_qty logic.
