## Dynamic Typography & Layout Wrapping for Drug Labels

### 1. Database migration
Add three nullable numeric columns with defaults to `public.drug_label_settings`:
- `font_size_clinic` numeric default `8.0`
- `font_size_medicine` numeric default `8.0`
- `font_size_instruction` numeric default `6.5`

Backfill existing singleton row with the defaults. No RLS changes required (existing policies cover the new columns).

### 2. Hook update — `src/hooks/clinic/useDrugLabelSettings.ts`
- Extend `DrugLabelSettings` interface with the three new fields.
- `select('*')` already pulls them through; no query change needed beyond the type.
- Widen `ToggleablePatch` to include the three numeric fields so the mutation accepts slider updates with optimistic cache patching.

### 3. UI update — `src/pages/clinic/settings/DrugLabelSettings.tsx`
- Add a new bento card titled **"Typography Scale (pt)"** under the Label Properties card (same grid column).
- Three `Slider` rows (Clinic Name, Medicine Name, Instructions), each `min=5, max=10, step=0.5`, current value shown numerically beside the label.
- `onValueCommit` fires `update.mutate({ font_size_*: value })` so we don't spam writes mid-drag, but the in-memory cache updates optimistically.
- Pipe the three values into `LabelPreview` so the on-screen preview's `text-[Npx]` styling scales proportionally (rough pt → px mapping, just for visual feedback).

### 4. Print logic — `src/lib/clinic/printDrugLabel.ts`
- Accept the full `DrugLabelSettings` (or extend `LabelToggles` into a `LabelConfig` superset) instead of just toggles, so `drawLabel` reads `font_size_clinic`, `font_size_medicine`, `font_size_instruction`.
- Replace the hardcoded `doc.setFontSize(8)` for clinic header → `font_size_clinic`.
- Replace the hardcoded `doc.setFontSize(8)` for medicine name → `font_size_medicine`.
- Leave address/tel/duration/footer/regulatory at their current 4.5–5pt sizes.

**Layout refactor** — replace the single concatenated "dose line" + wrapped instruction block with three strict vertical lines, each driven by `font_size_instruction`:
- **Line 1 — Dosage**: `${dosage_qty} ${dosage_unit}` (or `dosage` fallback), uppercase, bold, centred.
- **Line 2 — Frequency**: `FREQUENCY_LABELS[frequency]` (bilingual EN / BM), uppercase, normal weight, centred, wraps to max 2 lines.
- **Line 3 — Custom instructions & precautions**: `instruction` joined with `precaution` (when `show_precaution` is on), uppercase, normal weight, left-aligned, wraps to max 2 lines.

Y-cursor advance uses `fontSizePt * 0.42` mm (jsPDF's pt → mm line-height heuristic) so increasing `font_size_instruction` automatically widens the row gap and prevents overlap. Same dynamic advance is applied to the medicine title using `font_size_medicine`.

- Update both callers of `generateDrugLabelPdf` (Dispensary checkout + Visit detail reprint, wherever they are) to pass the full settings object instead of just the toggle subset. Existing `LabelToggles` typing stays for back-compat but the function signature accepts `DrugLabelSettings`.

### Out of scope
- No changes to bilingual frequency dictionary (already shipped).
- No expiry-date schema work.
- No reprint-history changes.
