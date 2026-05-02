## Phase 2A: Inventory Core & Master Data

Upgrade `/clinic/inventory` from a read-only table into a tabbed, fully editable inventory dashboard with extended clinical, pricing, and lifecycle fields.

### Important: Schema Mapping (avoid duplicates)

The `inventory_items` table already contains most requested fields under existing names. To prevent breaking the rest of the app (consultation, dispensing, settings dialog, hooks), we will **reuse existing columns** rather than create duplicates:

| Spec field | Existing column to reuse |
|---|---|
| `drug_group` | `groups` (text) — already exists |
| `default_dosage` | `default_dosage_qty` |
| `dosage_unit` | `default_dosage_unit` |
| `frequency` | `default_frequency` |
| `duration` | `default_duration` (+ `default_duration_unit`) |
| `instructions` | `default_instruction` |
| `precautions` | `default_precaution` |
| Standard price | `price_to_patient_max` (existing) |
| Low stock threshold | `stock_amount_warning` (existing) |
| Expiry date | `nearest_expiry_date` (existing) |

**New columns to add** (genuinely missing):
- `price_tier_1` numeric(10,2) NOT NULL DEFAULT 0
- `price_tier_2` numeric(10,2) NOT NULL DEFAULT 0
- `archived_at` timestamptz NULL (soft-delete)

### Task 1 — Database Migration

Single migration `extend_inventory_schema.sql`:
```sql
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS price_tier_1 numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_tier_2 numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_items_archived_at
  ON public.inventory_items (archived_at);
```
RLS already covers ops/admin updates. Supabase types regenerate automatically.

### Task 2 — Inventory Dashboard UI

Rewrite `src/pages/clinic/Inventory.tsx`:

**Sub-navigation pills (top)**:
- "Item Master" (active page)
- "Stock Take" → empty state card: "Module coming in Phase 2C"
- "Packages" → empty state card: "Module coming in Phase 2C"

**Main Tabs (Shadcn `Tabs`)** with badge counts:
- All — `archived_at IS NULL`
- In Stock — `stock > (stock_amount_warning ?? 0)` and not archived
- Low Stock — `0 < stock <= (stock_amount_warning ?? 0)` and not archived
- Out of Stock — `stock = 0` and not archived
- Expiring Soon — `nearest_expiry_date` within next 60 days and not archived
- Archived — `archived_at IS NOT NULL`

**Table columns**: Name, Category, Stock, Low-Stock Alert, Base Price, Expiry, Status. Row click → opens `ItemEditSheet`. "Add Item" button in header opens the same sheet in create mode.

Hook update: `useInventoryItems` query selects all needed columns including `groups`, `stock_amount_warning`, `nearest_expiry_date`, `price_tier_1`, `price_tier_2`, `archived_at`. Drop the existing `.eq('status', 'active')` filter — tabs handle filtering.

### Task 3 — Full CRUD Edit Sheet

New `src/components/clinic/inventory/ItemEditSheet.tsx` using Shadcn `Sheet` (right-side, `sm:max-w-3xl`).

**Two-column form (react-hook-form + zod)**:

Column 1 — *Item & Pricing*:
- Name, Category (Select: Medication / Disposable Item / Vaccine / Other)
- Current Stock, Low Stock Threshold (`stock_amount_warning`)
- Base Price (`price_to_patient_max`), Tier 1 Price (`price_tier_1`), Tier 2 Price (`price_tier_2`)
- Expiry Date (`nearest_expiry_date`, date input)

Column 2 — *Clinical Rules* (rendered only when `category === 'Medication'`):
- Drug Group (`groups`, free-text)
- Dosage (`default_dosage_qty`), Dosage Unit (Select from `DOSAGE_UNIT_OPTIONS`)
- Frequency (Select from `FREQUENCY_OPTIONS`)
- Duration (`default_duration`) + Duration Unit (Select from `DURATION_UNIT_OPTIONS`)
- Instructions (Combobox `INSTRUCTION_OPTIONS`)
- Precautions (Combobox `PRECAUTION_OPTIONS`)

**Footer**: Cancel · Save · destructive "Archive Item" (sets `archived_at = now()`) — only in edit mode. For archived items, button becomes "Restore" (sets `archived_at = null`).

**Save**: extends `useUpdateInventoryItem` / `useAddInventoryItem` in `src/hooks/clinic/useInventoryItems.ts` — add the new fields to `InventoryItemInput` and `mapItemPayload` (`groups`, `stock_amount_warning`, `nearest_expiry_date`, `price_tier_1`, `price_tier_2`, `archived_at`). Existing settings dialog continues to work since the mapper only writes provided keys.

### Files Touched

- **New**: `supabase/migrations/<ts>_extend_inventory_schema.sql`
- **New**: `src/components/clinic/inventory/ItemEditSheet.tsx`
- **Rewrite**: `src/pages/clinic/Inventory.tsx`
- **Edit**: `src/hooks/clinic/useInventoryItems.ts` (extend types + payload mapper)

### Out of Scope (Phase 2C)

Stock Take module, Packages CRUD upgrade, expiry batch tracking — placeholders only.