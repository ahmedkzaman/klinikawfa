## Step 19.5 — Inventory & Services Categorization

Adds a lightweight `category` dimension to existing `services` (inventory_items already has one) and refactors the settings UI into 6 focused tabs, without altering `packages`, `package_items`, or any billing trigger.

---

### A. Database Migration — `<ts>_add_inventory_categories.sql`

`inventory_items.category` already exists (`varchar(50)`, default `'Medication'`) — keep idempotent guard. Only `services` actually needs the new column:

```sql
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS category varchar(50) DEFAULT 'Medication';

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS category varchar(50) DEFAULT 'General Service';

-- Backfill any pre-existing rows that came in as NULL (defensive)
UPDATE public.inventory_items SET category = 'Medication'      WHERE category IS NULL;
UPDATE public.services        SET category = 'General Service' WHERE category IS NULL;
```

No changes to `packages`, `package_items`, RLS, or triggers.

---

### B. Hooks & Types

**`src/hooks/clinic/useInventoryItems.ts`**
- Extend `InventoryItemInput` with `category?: 'Medication' | 'Disposable Item' | 'Vaccine' | 'Other'`.
- In `mapItemPayload`, forward `category` when defined. (`select('*')` already returns it.)

**`src/hooks/clinic/useServices.ts`**
- Extend `ServiceInput` with `category?: 'General Service' | 'Procedure' | 'Laboratory Investigation' | 'Other'`.
- In `mapServicePayload`, forward `category` when defined. (`select('*')` already returns it.)

No new query keys; existing list queries automatically pick up the new column.

---

### C. Dialog Updates

**`InventoryItemDialog.tsx`**
- Add `category` to `InventoryItemRow`, the Zod schema (enum of 4 options, default `'Medication'`), `EMPTY_VALUES`, the hydration `reset(...)` block, and the submit payload.
- Render a "Category" `Select` in the Details card next to Status: **Medication / Disposable Item / Vaccine / Other**.
- Accept an optional `defaultCategory` prop so the parent tab can pre-seed the right value when adding from a category-specific tab.

**`ServiceDialog.tsx`**
- Same pattern: add `category` to `ServiceRow`, schema (enum of 4: `'General Service' | 'Procedure' | 'Laboratory Investigation' | 'Other'`, default `'General Service'`), `EMPTY`, hydration, and submit payload.
- Render the Category Select alongside Status.
- Accept an optional `defaultCategory` prop.

Both dialogs leave editing of the category enabled (so a misfiled item can be moved between tabs by changing its category).

---

### D. `InventorySettings.tsx` — 6-tab refactor

Replace the current 3 tabs with:

| Tab key | Source | Filter | Add button default category |
|---|---|---|---|
| `medications` | `inventory_items` | `category ∈ {Medication, Vaccine}` (or null → treated as Medication) | `Medication` |
| `disposables` | `inventory_items` | `category === 'Disposable Item'` | `Disposable Item` |
| `procedures` | `services` | `category === 'Procedure'` | `Procedure` |
| `labs` | `services` | `category === 'Laboratory Investigation'` | `Laboratory Investigation` |
| `general_services` | `services` | `category ∈ {General Service, Other}` (or null → General Service) | `General Service` |
| `packages` | `packages` | unchanged | n/a |

Implementation details:
- Compute filtered arrays via `useMemo` from the existing `useInventoryItems()` / `useServices()` results — no extra queries.
- Track active tab in local state so the "Add" button can pass the correct `defaultCategory` to the dialog when `row` is `null`.
- When opening an existing row for edit, forward `category` (with the same `??` fallback already used for `standard_panel_price` and the `default_*` fields).
- Add a "Category" column to the Medications and Services tables (small `Badge`) so misfiled rows are immediately visible.
- Keep all existing columns, edit handlers, hooks, RLS expectations, and the loading/empty states — only the tab structure and a couple of column additions change.

---

### Out of scope (explicitly not touched)
- `packages` / `package_items` schema, hooks, `PackageDialog`, billing triggers, RLS.
- Consultation cart auto-fill (Step 18) and any prescribing logic.
- No data migration beyond the defensive `UPDATE … WHERE category IS NULL` backfill.

### Verification after approval
1. Migration runs cleanly (idempotent on `inventory_items`).
2. Existing items/services appear under their default tabs (Medication / General Service).
3. Creating from each tab pre-selects the right category; editing preserves it.
4. Packages tab and existing package bundling continue to work unchanged.
