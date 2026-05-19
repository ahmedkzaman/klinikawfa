## Problem

The Typography Scale sliders update the DB and the printed PDF, but the on-screen **Drug Label Preview** uses hardcoded Tailwind text sizes (`text-[12px]`, `text-[11px]`, `text-[10px]`) so nothing visibly changes when the user drags a slider.

## Fix — `src/pages/clinic/settings/DrugLabelSettings.tsx` only

Make `LabelPreview` consume the three numeric font-size fields from `settings` and apply them via inline `fontSize` styles, using the same pt→px conversion the PDF uses (the preview already declares `aspectRatio: 60/50` so the scale matches roughly 1pt ≈ 1.33px at the rendered card size; we'll use `pt` units directly since browsers render them natively).

### Changes

1. **Provide defaults** in the `LabelPreview` `s` fallback so the three numeric fields exist when `settings` is still loading: `font_size_clinic: 8`, `font_size_medicine: 8`, `font_size_instruction: 6.5`.

2. **Replace hardcoded text sizes** with inline `style={{ fontSize: \`${s.font_size_*}pt\` }}`:
   - Clinic name `<div>` → `font_size_clinic` (bold, uppercase, kept).
   - Medicine name `<div>` → `font_size_medicine`.
   - Instruction line (`1 TABLET, 3X DAILY`) → `font_size_instruction`.
   - Add a second centered line below it for the **bilingual frequency** (`4 TIMES A DAY / 4 KALI SEHARI` style) also driven by `font_size_instruction`, so the preview matches the printed layout that already includes the bilingual frequency. Source the string from `FREQUENCY_LABELS['TDS']` via a new dummy field on `PREVIEW_FILLER` (`frequencyCode: 'TDS'`).

3. **Leave fixed-size meta** (tel, address, QTY/EXP, patient age/gender, duration, date) at their current small sizes — those mirror the PDF's fixed 5pt/6pt regions and the slider helper text already says "Footer & address text stay at their fixed sizes".

4. **Import** `FREQUENCY_LABELS` from `@/lib/clinic/prescribingOptions` at the top of the file.

## Out of scope

- No changes to the PDF generator, hook, schema, or other UI cards.
- No new sliders. The address/tel/footer fonts intentionally stay fixed.
