# Master Inventory Import — Corrected Execution Plan

You are right on all three points. `inventory_items` already has `item_code`, `brand`, `uom`, `is_otc`, `default_indication`, and `category`. Only `services` needs `item_code`. The execution will follow exactly your corrected logic.

---

## Step 1 — Schema Migration (`<ts>_inventory_import_keys.sql`)

Add the natural key to `services` and ensure both tables can UPSERT cleanly.

```sql
-- services: add item_code as natural key
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS item_code varchar;

CREATE UNIQUE INDEX IF NOT EXISTS services_item_code_unique
  ON public.services (item_code)
  WHERE item_code IS NOT NULL;

-- inventory_items: ensure unique partial index on item_code
CREATE UNIQUE INDEX IF NOT EXISTS inventory_items_item_code_unique
  ON public.inventory_items (item_code)
  WHERE item_code IS NOT NULL;
```

---

## Step 2 — Generate Seed SQL (Python, run in sandbox)

Copy the uploaded XLSX/CSV into `/tmp`, then run the corrected script (your version, adopted verbatim). Key fixes baked in:

- **Pricing scan** matches `'default'`, `'self'`, `'cash'`, `'retail'` for self-pay, and the **first** `'panel'` rate for `standard_panel_price`. Falls back to `PRICE 1 VALUE`, then mirrors self-pay → panel if panel missing.
- **`USE FOR` → `default_indication`** mapped on inventory rows.
- **Group routing** covers all six observed groups: `Medicines`, `Medical Disposables`, `Procedures`, `Lab Test`, `Consultation Fees`, `General`.
- Output written to `/mnt/documents/seed_master_inventory.sql` so it survives across calls.

---

## Step 3 — Apply Seed via Insert Tool

Two separate UPSERTs, both with **complete `DO UPDATE SET` clauses** (no stale-data drift on re-import).

**Inventory items** (Medicines + Medical Disposables, ~235 rows):
```sql
INSERT INTO public.inventory_items
  (item_code, name, category, brand, uom, is_otc, default_indication,
   cost_price, price_to_patient_max, price_to_patient_min,
   standard_panel_price, stock, status)
VALUES (...)
ON CONFLICT (item_code) WHERE item_code IS NOT NULL
DO UPDATE SET
  name                  = EXCLUDED.name,
  category              = EXCLUDED.category,
  brand                 = EXCLUDED.brand,
  uom                   = EXCLUDED.uom,
  is_otc                = EXCLUDED.is_otc,
  default_indication    = EXCLUDED.default_indication,
  cost_price            = EXCLUDED.cost_price,
  price_to_patient_max  = EXCLUDED.price_to_patient_max,
  price_to_patient_min  = EXCLUDED.price_to_patient_min,
  standard_panel_price  = EXCLUDED.standard_panel_price,
  status                = EXCLUDED.status,
  updated_at            = now();
-- NOTE: stock intentionally excluded from UPDATE so live counts are never overwritten.
```

**Services** (Procedures + Lab Test + Consultation Fees + General, ~197 rows):
```sql
INSERT INTO public.services
  (item_code, name, category, cost, price_to_patient, standard_panel_price, status)
VALUES (...)
ON CONFLICT (item_code) WHERE item_code IS NOT NULL
DO UPDATE SET
  name                 = EXCLUDED.name,
  category             = EXCLUDED.category,
  cost                 = EXCLUDED.cost,
  price_to_patient     = EXCLUDED.price_to_patient,
  standard_panel_price = EXCLUDED.standard_panel_price,
  status               = EXCLUDED.status;
```

---

## Step 4 — Wire `item_code` Through the Services UI

**`src/hooks/clinic/useServices.ts`**
- Add `item_code?: string | null` to `ServiceInput`.
- Map it in `mapServicePayload`: `if (input.item_code !== undefined) payload.item_code = input.item_code?.trim() || null;`

**`src/components/clinic/settings/ServiceDialog.tsx`**
- Extend `ServiceRow` with `item_code?: string | null`.
- Add `item_code: z.string().trim().max(40).optional().or(z.literal(''))` to `serviceSchema`.
- Add an "Item Code" input in the form (read-only-feel, optional, displayed near "Name"), wired to defaults from `service?.item_code`.
- Include `item_code` in the submit payload to `addService` / `updateService`.

This guarantees admins can edit / re-export imported rows without losing the natural key.

---

## Step 5 — Reconciliation Report

After applying the seed, run a verification query and surface counts:

```sql
SELECT category, COUNT(*) AS rows, COUNT(item_code) AS coded
FROM public.inventory_items GROUP BY category ORDER BY category;

SELECT category, COUNT(*) AS rows, COUNT(item_code) AS coded
FROM public.services GROUP BY category ORDER BY category;
```

Expected: ~141 Medication, ~94 Disposable Item, ~121 Procedure, ~65 Laboratory Investigation, ~5 General Service, ~6 Other. Every imported row has a non-null `item_code`.

---

## Files to Change

- **NEW migration**: `supabase/migrations/<ts>_inventory_import_keys.sql`
- **NEW artifact**: `/mnt/documents/seed_master_inventory.sql` (idempotent, re-runnable)
- **EDIT**: `src/hooks/clinic/useServices.ts` — add `item_code` to `ServiceInput` + payload mapper
- **EDIT**: `src/components/clinic/settings/ServiceDialog.tsx` — add `item_code` to schema, form field, and `ServiceRow` type

## Why this is safe

- `ON CONFLICT` keyed on `item_code` (432 unique) — never on `name` (only 421 unique).
- `stock` excluded from inventory `DO UPDATE SET` — live allocations untouched.
- `default_indication`, `is_otc`, `status` all included — no stale data on re-import.
- Frontend wired to the new column in the same change-set — no orphaned schema.