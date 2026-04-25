
# Step 19 — Package Bundling Architecture

## Context discovered

- `public.packages` **already exists** with: `id, name, status, cost (numeric), price (numeric), standard_panel_price, stock, items (jsonb, legacy/unused), created_at`. RLS uses `is_ops_or_admin()`.
- `public.package_items` **does not exist** — needs to be created.
- `public.services` is a **separate table** from `inventory_items`, so a single `item_id` FK won't work for both. I'll use a polymorphic two-FK pattern with a CHECK constraint (same approach as `consultation_items`).
- The spec's `base_price` / `final_price` fields **map to existing columns** to avoid breaking the pricing trigger (`trg_resolve_selling_price`), CoGS trigger (`trg_lock_cogs`), panel claims, consultation cart, and `panel_price_overrides`:
  - `base_price` → `cost` (the bundle-level cost basis)
  - `final_price` → `price` (the patient-facing self-pay price already wired through pricing hierarchy)
- Existing `PackageDialog.tsx` already handles name, status, pricing tiers, and bespoke panel overrides — I'll **extend it in place** rather than create a parallel `CreatePackageDialog.tsx` to avoid two divergent dialogs.

---

## A. Database Migration — `<ts>_add_package_items.sql`

```sql
-- Bundle line items for packages (services + medications)
CREATE TABLE IF NOT EXISTS public.package_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id      uuid NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  inventory_item_id uuid REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  service_id      uuid REFERENCES public.services(id)        ON DELETE RESTRICT,
  item_type       varchar(20) NOT NULL CHECK (item_type IN ('service','medication')),
  quantity        numeric(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- Exactly one FK populated, matching item_type
  CONSTRAINT package_items_target_chk CHECK (
    (item_type = 'medication' AND inventory_item_id IS NOT NULL AND service_id IS NULL)
 OR (item_type = 'service'    AND service_id        IS NOT NULL AND inventory_item_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS package_items_package_id_idx ON public.package_items(package_id);

ALTER TABLE public.package_items ENABLE ROW LEVEL SECURITY;

-- Mirror inventory_items policies
CREATE POLICY "Authenticated can read package_items"
  ON public.package_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "package_items_ops_insert"
  ON public.package_items FOR INSERT TO authenticated
  WITH CHECK (public.is_ops_or_admin(auth.uid()));

CREATE POLICY "package_items_ops_update"
  ON public.package_items FOR UPDATE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()))
  WITH CHECK (public.is_ops_or_admin(auth.uid()));

CREATE POLICY "package_items_ops_delete"
  ON public.package_items FOR DELETE TO authenticated
  USING (public.is_ops_or_admin(auth.uid()));
```

No changes to `packages` columns (we reuse `cost`/`price`/`standard_panel_price`).

---

## B. Hooks & Types — `src/hooks/clinic/usePackages.ts`

Add new hooks alongside the existing `useAddPackage` / `useUpdatePackage`:

- `export interface PackageItemDraft { item_type: 'service'|'medication'; inventory_item_id?: string|null; service_id?: string|null; quantity: number; }`
- `usePackageItems(packageId?: string)` — read-only `useQuery` that returns existing line items (used by `PackageDialog` when editing).
- `useReconcilePackageItems()` — `useMutation` that takes `{ packageId, items: PackageItemDraft[] }`, performs **delete-then-insert** inside one mutation (no PG transaction available client-side, but acceptable since RLS + cascading + small payload make this race-free in practice). Returns `void`.

Update `useAddPackage` / `useUpdatePackage` (already exist) — no signature change. The dialog will:
1. Call `addPackage` / `updatePackage` to get the `packageId`.
2. Call `useReconcilePackageItems` with the bundle.
3. Call existing `useReconcileOverrides` for panel overrides.

All three steps run sequentially in the dialog's `onSubmit` (matching the existing `InventoryItemDialog` pattern).

Invalidate query keys: `['packages']` and `['package_items', packageId]`.

---

## C. UI — Extend `src/components/clinic/settings/PackageDialog.tsx`

I will **extend the existing dialog** (not create a parallel `CreatePackageDialog.tsx`) so there is one canonical edit path. Add a new "Bundle Contents" `<Card>` section between **Details** and **Pricing**:

### Bundle Contents card

- Use `useFieldArray` with two arrays: `services` and `medications`.
- **"Add Service" list**: each row is
  - `ComboboxInput` filtered to `services` (active only) — searchable.
  - `Input type=number` for quantity (default 1, min 0.01, step 0.01).
  - Read-only display: `RM {standard_price}` (pulled from selected `service.price_to_patient`).
  - Trash icon to remove the row.
  - "+ Add Service" button appends a row.
- **"Add Item" (Medication) list**: same UX, sourced from `useInventoryItems` (active only), price from `price_to_patient_max`.
- When a row is selected, the dialog stamps `item_type` (`service` or `medication`) and the appropriate FK id.

### Pricing footer (replaces existing `Self Pay` / `Standard Panel` inputs with an enriched layout)

Three rows, in this order:
1. **Total Add-ons Price (read-only)** — auto-computed:
   `Σ (selected service.price × qty) + Σ (selected medication.selling_price × qty)`.
2. **Base Package Price (RM)** — editable `register('cost')` (bundle-level fixed cost basis; maps to DB `cost`).
3. **Final Package Price (RM)** — editable `register('price')` (the patient billing amount; maps to DB `price` and is what the existing pricing trigger emits as self-pay).
4. **Standard Panel (RM)** — keep existing `register('standard_panel_price')` input (still required for panel pricing hierarchy and the existing bespoke overrides editor).

### Submit flow (sequential, with error containment)

```
1. addPackage / updatePackage   → packageId, toast "Package saved"
2. reconcilePackageItems        → on error: toast "saved, but bundle failed", keep dialog open
3. reconcileOverrides           → on error: toast "saved, but overrides failed", keep dialog open
4. onOpenChange(false)
```

### Hydration on edit

- Existing `useEffect` already hydrates name/pricing/status.
- New `useEffect` reads `usePackageItems(pkg.id)` and seeds `useFieldArray` defaults split by `item_type`.

---

## D. Wiring in `src/pages/clinic/settings/InventorySettings.tsx`

The "Edit" button currently passes a stripped row (loses `standard_panel_price`, like the inventory bug we fixed earlier). Update the row payload to forward all fields:

```ts
setPkgDialog({
  open: true,
  row: {
    id: p.id,
    name: p.name,
    cost: Number(p.cost) || 0,
    price: Number(p.price) || 0,
    standard_panel_price: Number(p.standard_panel_price) || 0,  // ← added
    status: p.status,
  },
})
```

No other call-sites change. `ConsultationDetail.tsx` and `AddTreatmentBulkDialog.tsx` continue to read `packages.price` exactly as today — bundling is purely additive metadata for now.

---

## Out of scope (explicit)

- Auto-exploding a package into its component `consultation_items` at billing time — that is Step 20 territory.
- Inventory reservation triggers for the bundle's medications — current `trg_consultation_items_inventory` operates on individual items added at consultation time, which is unchanged.
- Migrating the legacy unused `packages.items` jsonb column (left in place to avoid touching unrelated triggers).

---

## Files touched

- `supabase/migrations/<ts>_add_package_items.sql` (new)
- `src/hooks/clinic/usePackages.ts` (extend)
- `src/components/clinic/settings/PackageDialog.tsx` (extend with Bundle Contents card + final-price footer)
- `src/pages/clinic/settings/InventorySettings.tsx` (forward `standard_panel_price` into edit dialog)

## Verification

- `npx tsc --noEmit` clean.
- Create a new package with 1 service + 2 medications, set Final Price, save → reopen → all rows + prices hydrate correctly.
- Editing an existing package preserves bundle, pricing, and bespoke panel overrides.
