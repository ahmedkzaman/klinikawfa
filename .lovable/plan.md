# Step 19.8 — Legacy Inventory Alignment

Add 4 structural columns to `inventory_items` so the master inventory matches the clinic's legacy Excel sheet, with first-class support for OTC vs. prescription-only medications.

## A. Database Migration

New file: `supabase/migrations/<ts>_add_inventory_legacy_fields.sql`

```sql
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS item_code varchar(100),
  ADD COLUMN IF NOT EXISTS is_otc    boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS brand     varchar(100),
  ADD COLUMN IF NOT EXISTS uom       varchar(50);
```

No backfill needed (`item_code`, `brand`, `uom` are nullable; `is_otc` defaults to `false` for existing rows).
RLS is unchanged — existing `inventory_items_*` policies continue to cover the new columns.
`packages`, `package_items`, billing triggers, and `inventory_item_prices` are untouched.

## B. Hooks & Types — `src/hooks/clinic/useInventoryItems.ts`

1. Extend `InventoryItemInput` with the 4 optional fields:
   - `item_code?: string | null`
   - `is_otc?: boolean`
   - `brand?: string | null`
   - `uom?: string | null`
2. Extend `mapItemPayload` to forward each field, normalizing empty strings to `null` for the 3 text fields and passing `is_otc` through as a boolean.
3. The base `useInventoryItems()` query already uses `select('*')`, so the new columns are returned automatically — no query change required.

## C. Settings UI — `src/components/clinic/settings/InventoryItemDialog.tsx`

1. **Type / schema**:
   - Extend `InventoryItemRow` with `item_code?: string | null`, `is_otc?: boolean | null`, `brand?: string | null`, `uom?: string | null`.
   - Add 4 fields to `itemSchema`:
     - `item_code: optStr(100)`
     - `brand: optStr(100)`
     - `uom: optStr(50)`
     - `is_otc: z.boolean().default(false)`
   - Add matching defaults to `EMPTY_VALUES` (`item_code: ''`, `brand: ''`, `uom: ''`, `is_otc: false`).
2. **Hydration** in the `useEffect` `reset({...})` block: populate the 4 fields from `item` when editing (coerce nulls → `''` / `false`).
3. **`onSubmit` payload**: include `item_code`, `brand`, `uom` (trim → null if empty) and `is_otc` (boolean) alongside the existing payload keys.
4. **UI additions** inside the **Details** card, placed below the existing Name input and above the Cost / Stock grid:
   - A 2-column grid with **Item Code (SKU)** and **Brand / Manufacturer** text inputs.
   - A 2-column grid with **UOM (Unit of Measure)** text input (placeholder: `STRIP, VIAL, BOTTLE`) and the existing Status select OR keep UOM standalone — final layout: UOM in a 2-col grid alongside an empty spacer to keep visual rhythm with the existing grids.
   - An **OTC (Over-The-Counter)** row using the existing `Switch` component (already in the project) wired via `watch('is_otc')` + `setValue('is_otc', v)`, with helper text:  
     *"If enabled, this item can be sold at the front desk without a doctor's consultation."*

No changes to `InventorySettings.tsx` tab logic, `PackageDialog.tsx`, or any other consumer — the new fields are purely additive metadata.

## Verification

- Run `npx tsc --noEmit` to confirm types compile cleanly.
- Open the Inventory dialog (Add + Edit) and confirm the 4 new fields render, hydrate on edit, and persist on save.
- Existing items continue to load with `is_otc = false` and empty SKU/Brand/UOM.
