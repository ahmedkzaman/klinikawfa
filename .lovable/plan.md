## Step 18 — Default Prescribing Architecture

Goal: store default dispensing instructions on each `inventory_items` row, let admins edit them, and auto-fill the consultation treatment cart when a doctor inserts an item — fully overridable per patient.

---

### A. Database migration — `<ts>_add_inventory_defaults.sql`

Add 8 nullable columns to `public.inventory_items` (verbatim per spec):

```sql
ALTER TABLE public.inventory_items
ADD COLUMN IF NOT EXISTS default_indication text,
ADD COLUMN IF NOT EXISTS default_dosage_qty varchar(50),
ADD COLUMN IF NOT EXISTS default_dosage_unit varchar(50),
ADD COLUMN IF NOT EXISTS default_frequency varchar(50),
ADD COLUMN IF NOT EXISTS default_instruction varchar(100),
ADD COLUMN IF NOT EXISTS default_duration varchar(50),
ADD COLUMN IF NOT EXISTS default_duration_unit varchar(50),
ADD COLUMN IF NOT EXISTS default_precaution text;
```

No RLS changes needed — existing policies on `inventory_items` already cover the new columns.

`src/integrations/supabase/types.ts` will regenerate automatically.

---

### B. Hooks & types — `src/hooks/clinic/useInventoryItems.ts`

1. Extend `InventoryItemInput` with 8 optional fields:
   - `default_indication?: string | null`
   - `default_dosage_qty?: string | null`
   - `default_dosage_unit?: string | null`
   - `default_frequency?: string | null`
   - `default_instruction?: string | null`
   - `default_duration?: string | null`
   - `default_duration_unit?: string | null`
   - `default_precaution?: string | null`
2. Update `mapItemPayload()` to pass each field through to Supabase when defined (treat empty string as `null`).
3. `select('*')` is already used by `useInventoryItems()`, so the new columns flow through the read path automatically — no change there.
4. Both `useAddInventoryItem` and `useUpdateInventoryItem` will accept the new fields via the extended `InventoryItemInput`.

---

### C. Settings UI — `src/components/clinic/settings/InventoryItemDialog.tsx`

1. Extend the `InventoryItemRow` interface and `itemSchema` (Zod) with the 8 optional string fields (`z.string().trim().max(N).optional().or(z.literal(''))`).
2. Extend `EMPTY_VALUES` with empty strings for the 8 fields.
3. In the `useEffect` that hydrates on edit, populate the 8 fields from `item`.
4. In `onSubmit`, include them in the payload (empty → `null`).
5. **Add a new `<Card>` between Pricing (line 307–447) and `<DialogFooter>` titled "Default Dispensing Instructions (Optional)"**, with helper text: *"Pre-fills the prescribing fields when this item is added to a consultation. Doctors can override per patient."*

   Layout (3 rows):
   - **Row 1** (grid-cols-2): `default_dosage_qty` (Input number-as-text) | `default_dosage_unit` (Select with the same `DOSAGE_UNIT_OPTIONS` used in `TreatmentItemCard`).
   - **Row 2** (grid-cols-3): `default_frequency` (Select with `FREQUENCY_OPTIONS`) | `default_duration` (Input) | `default_duration_unit` (Select: days / weeks / months).
   - **Row 3** (grid-cols-1): `default_instruction` (Select / ComboboxInput with `INSTRUCTION_OPTIONS`).
   - **Row 4**: `default_indication` (ComboboxInput with `INDICATION_OPTIONS`).
   - **Row 5**: `default_precaution` (Textarea, 2 rows).

   Reuse the option arrays from `TreatmentItemCard.tsx` by extracting them into a shared `src/lib/clinic/prescribingOptions.ts` (so the settings dialog and treatment card stay in sync).

---

### D. Consultation cart auto-fill — two touch-points

The consultation flow uses `AddTreatmentBulkDialog` → `handleBulkInsert` (in `ConsultationDetail.tsx` line 242) → `useAddConsultationItem`. Defaults must propagate from the master item into the new `consultation_items` row.

1. **`useConsultationItems.ts` — `useAddConsultationItem`**
   Extend the mutation input to accept the optional default fields (`indication`, `dosage_qty`, `dosage_unit`, `frequency`, `instruction`, `duration`, `precaution`). The DB insert already supports them (`consultation_items` has all of these columns). Pass them straight through.
   - Note: `consultation_items` has no `duration_unit` column. We will concatenate `default_duration` + ' ' + `default_duration_unit` into the existing `duration` text column on insert (e.g. "5 days") so the value renders correctly in `TreatmentItemCard`'s Duration select / display.

2. **`AddTreatmentBulkDialog.tsx`**
   The `CombinedRow` only carries `id/name/price`. Extend it (for `type === 'item'` only) to carry the source `InventoryItem`'s `default_*` fields, and forward them in the `SelectedItem` shape passed to `onInsert`.

3. **`ConsultationDetail.tsx` — `handleBulkInsert`**
   When `item.type === 'item'`, pass the default prescribing fields into `addItem.mutateAsync` so they land on the new `consultation_items` row. Doctor can still edit each row freely via `TreatmentItemCard` (already supports all of these fields and writes back via `useUpdateConsultationItem`).

---

### Verification after implementation

1. Open `/clinic/inventory/settings` → edit an item (e.g. *Paracetamol 500mg*) → set defaults: `1 / tablet / QID / 5 / days / After meal / For pain / May cause drowsiness` → save.
2. Open a consultation → "Add treatment in bulk" → tick *Paracetamol 500mg* → Insert.
3. Expand the resulting `TreatmentItemCard` and confirm dosage qty=1, unit=tablet, frequency=QID, duration="5 days", instruction="After meal", indication="For pain", precaution="May cause drowsiness" — all editable.
4. Verify `select default_indication, default_dosage_qty, default_dosage_unit, default_frequency, default_instruction, default_duration, default_duration_unit, default_precaution from inventory_items where id = '<paracetamol-id>';` returns the saved values.

### Files touched

- **New**: `supabase/migrations/<ts>_add_inventory_defaults.sql`
- **New**: `src/lib/clinic/prescribingOptions.ts` (shared option arrays)
- **Modified**: `src/hooks/clinic/useInventoryItems.ts`
- **Modified**: `src/components/clinic/settings/InventoryItemDialog.tsx`
- **Modified**: `src/components/clinic/consultation/AddTreatmentBulkDialog.tsx`
- **Modified**: `src/components/clinic/consultation/TreatmentItemCard.tsx` (only to import options from the new shared file)
- **Modified**: `src/hooks/clinic/useConsultationItems.ts` (`useAddConsultationItem` accepts default fields)
- **Modified**: `src/pages/clinic/ConsultationDetail.tsx` (`handleBulkInsert` forwards defaults)
- **Auto-regenerated**: `src/integrations/supabase/types.ts`

### Out of scope (intentionally)

- No backfill of existing inventory rows — defaults remain empty until an admin sets them.
- No changes to `consultation_items` schema (the existing columns already cover what we auto-fill; `default_duration_unit` is collapsed into the `duration` text on insert).
- Bespoke panel overrides UI is untouched.