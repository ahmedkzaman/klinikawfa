## Root cause

I confirmed in the database that **saving works on Add** — e.g. `T. Paracetamol 500mg` has `standard_panel_price = 15.00` plus indication / dosage / frequency persisted correctly.

The bug is on the **Edit** path in `src/pages/clinic/settings/InventorySettings.tsx`. The pencil-edit handler builds the row passed to `InventoryItemDialog` with only 6 fields:

```ts
row: {
  id, name, cost_price, price_to_patient_max, stock, status
}
```

It omits `standard_panel_price` and all 8 `default_*` columns. The dialog's hydration `useEffect` then falls back to `0` / `''` for those missing properties, the user clicks Save without re-entering them, and the update mutation overwrites the previously-saved values with zeros/nulls.

So the symptom "values aren't saved" is actually "values are saved on Add, then wiped on the next Edit".

## Fix

Single-file change to `src/pages/clinic/settings/InventorySettings.tsx`:

In the table row's edit `onClick` (around line 136–148), include all the fields the dialog hydrates from:

```ts
setItemDialog({
  open: true,
  row: {
    id: it.id,
    name: it.name,
    cost_price: Number(it.cost_price) || 0,
    price_to_patient_max: Number(it.price_to_patient_max) || 0,
    standard_panel_price: Number(it.standard_panel_price) || 0,
    stock: Number(it.stock) || 0,
    status: it.status,
    default_indication: it.default_indication ?? null,
    default_dosage_qty: it.default_dosage_qty ?? null,
    default_dosage_unit: it.default_dosage_unit ?? null,
    default_frequency: it.default_frequency ?? null,
    default_instruction: it.default_instruction ?? null,
    default_duration: it.default_duration ?? null,
    default_duration_unit: it.default_duration_unit ?? null,
    default_precaution: it.default_precaution ?? null,
  },
})
```

`useInventoryItems` already does `select('*')`, so all these fields are present on `it` — they just weren't being forwarded.

No schema changes, no hook changes, no migration. The dialog, mutation hook (`useUpdateInventoryItem` / `mapItemPayload`), and DB columns are all already wired up correctly — proven by the Add path working.

## Verification after fix

1. Open an existing item (e.g. `T. Paracetamol 500mg`) — confirm Standard Panel field shows **15.00** (currently shows 0) and dispensing defaults are pre-populated.
2. Edit only the name, save, reopen — Standard Panel and dispensing defaults still intact.
3. Set Standard Panel + dispensing defaults on a different item, save, reopen — values persist across edits.
