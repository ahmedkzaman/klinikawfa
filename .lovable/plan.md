# Why the two labels look different

The test print and the real dispensed label use the **exact same PDF renderer** (`generateDrugLabelPdf`). The difference is the data, not the settings.

- **Test label** (Settings → Printer Calibration) feeds a hard-coded `TEST_ITEM` that includes `dosage_qty`, `dosage_unit`, `frequency`, `indication`, `duration`. The renderer therefore draws the full body: `1 TABLET`, `3 TIMES A DAY / 3 KALI SEHARI`, `For: Alignment Test`, `Duration: 1 Day`.
- **Real dispensed label** prints from a `consultation_items` row. When a medicine is added through the catalog picker, its inventory `default_dosage_qty / default_dosage_unit / default_frequency / default_instruction / default_duration / default_indication / default_precaution` are **never copied onto the consultation_items row**. Unless the doctor opens the instructions modal and types them in, those columns stay `NULL`. The renderer then prints only header + medicine name + QTY/EXP — which is exactly what your second screenshot shows.

So the fix is to make every dispensed item carry the same fields the test item has.

## Plan

1. **`src/components/clinic/visit/CatalogItemPicker.tsx`** — when `catalog === 'inventory'`, forward the picked item's prescribing defaults onto the insert payload:
   - `indication`      ← `default_indication`
   - `dosage_qty`      ← `Number(default_dosage_qty)` (string → number, ignore NaN)
   - `dosage_unit`     ← `default_dosage_unit`
   - `frequency`       ← `default_frequency`
   - `instruction`     ← `default_instruction`
   - `duration`        ← `default_duration` joined with `default_duration_unit` if both present (e.g. `"3 days"`), to match what the label expects.
   - `precaution`      ← `default_precaution`
   Only set keys when the source value is non-empty so the doctor's manual edits in the instructions modal still win.

2. **`src/components/clinic/visit/VisitDetailsColumn.tsx`** — in `openLabelPdf`, when mapping `rows` to `DrugLabelItem`, fall back to the linked `inventory_items.default_*` columns if the row's own prescribing field is null. This rescues rows that were already dispensed before fix #1 lands, and matches the test-print behaviour for any item with sensible inventory defaults.
   - Requires extending the select in `src/hooks/clinic/useConsultationItems.ts` from `inventory_items(unit:unit_of_measure)` to also pull `default_indication, default_dosage_qty, default_dosage_unit, default_frequency, default_instruction, default_duration, default_duration_unit, default_precaution`.

3. **No changes** to `printDrugLabel.ts`, `PrinterCalibration.tsx`, label settings, or the calibration offsets — header, divider, fonts, QTY/EXP layout are already identical between the two flows.

## Out of scope
- Backfilling historical `consultation_items` rows in the DB (the print-time fallback in step 2 covers them visually).
- Changing the instructions modal UX.
- Any change to the printer offset / paper size / toggles in `drug_label_settings`.
