## Goal

Make the printed 60×50 mm thermal label match the on-screen `LabelPreview` in **Settings → Drug Label**, since today the two are independent layouts that have drifted.

Preview is the source of truth. No DB schema or preview UI changes — only `src/lib/clinic/printDrugLabel.ts` is rewritten.

## New label layout (mirrors preview)

```text
┌──────────────────────────────────────────┐
│            KLINIK AWFA (centered)         │  ← clinic name, bold (font_size_clinic)
│       Tel: +60... (centered, optional)    │  ← if show_tel_number
│   Jalan KS 1/12, ... (centered, optional) │  ← if show_address
│ ────────────────── divider ────────────── │
│ PARACETAMOL 500MG TABLET     QTY: 10 Tabs │  ← med bold left, QTY/EXP stacked right
│                              EXP: 12/2027 │
│                                           │
│           1 TABLET, 3X DAILY              │  ← dosage + freq, centered, medium
│           4 TIMES A DAY / 4 KALI SEHARI   │  ← bilingual frequency, centered
│              For: FEVER                   │  ← if show_indication
│            TAKE AFTER MEALS               │  ← italic, if show_precaution
│                                           │
│ ────────────────── divider ────────────── │
│ Ali Bin Abu                  Date: 26/4/26│  ← patient bottom-left, date bottom-right
│ 34 / M                                    │
│ Duration: 5 Days                          │  ← if show_duration
└──────────────────────────────────────────┘
```

Removed from the printed label: the "Ubat Terkawal / Controlled Medicine" regulatory strip and the bottom-center Date (Date now lives bottom-right). QTY/EXP move from footer to a top-right column next to the medicine name. Patient name moves from under the divider to the bottom-left block.

## Implementation — `src/lib/clinic/printDrugLabel.ts`

1. **Header block** (`drawLabel` rewrite):
   - Clinic name centered, bold, `font_size_clinic`.
   - If `show_tel_number`: centered grey-equivalent (still black on thermal), 5pt.
   - If `show_address`: centered, 5pt, wrap to max 2 lines via `splitTextToSize`.
   - Hairline divider at `doc.line(...)`.

2. **Medicine + QTY/EXP row** (two-column):
   - Left column: medicine name, bold, `font_size_medicine`, wrap to max 2 lines within `SAFE_W - rightColW`.
   - Right column (right-aligned, 5pt tabular): `QTY: {quantity} Tab/s` if `show_quantity`, then `EXP: {mm/yyyy}` if `show_expiry_date`. Compute `rightColW` from the longer of the two strings via `doc.getTextWidth`.
   - Advance `y` by the taller of the two columns.

3. **Centered body block** (replaces current 3-line vertical stack):
   - Line A — Dosage: `${dosage_qty} ${dosage_unit}` (or fallback `dosage`), uppercase, bold-medium, centered, `font_size_instruction`.
   - Line B — Frequency: `FREQUENCY_LABELS[freq]` uppercase, centered, `font_size_instruction`, wrap to max 2 lines.
   - Line C — Indication: `For: {indication}` centered 5pt, only if `show_indication`.
   - Line D — Precaution: italic centered 5pt, only if `show_precaution`.

4. **Footer divider + patient block**:
   - Hairline divider just before the bottom.
   - Bottom-left stack at `footerY`:
     - Patient name bold (6pt) — drawn only when `patientName` truthy (mirrors preview).
     - Age/Gender if available on `DrugLabelItem` *(optional, leave blank if not wired through yet)*.
     - `Duration: {duration}` if `show_duration` and present.
   - Bottom-right: `Date: dd/M/yyyy` if `show_date`, right-aligned.
   - Drop the `Ubat Terkawal / Controlled Medicine` line entirely.

5. **Y-cursor heuristic**: keep `lh = pt => pt * 0.42` for dynamic line spacing so the typography sliders still work.

6. **Safe-area guards**: keep `MARGIN_X = 2`, `PAGE_W = 60`, `PAGE_H = 50`. All `splitTextToSize` calls use `SAFE_W` minus any right-column reserve.

## Out of scope

- No changes to `LabelPreview` component, toggles list, sliders, DB schema, or `FREQUENCY_LABELS`.
- No `html2canvas` rasterisation route — staying vector-based for crisp thermal output.
- Age/Gender field will render only if already present on the item row; no new DB plumbing.

## Verification

After implementing, trigger a label print from a real consultation item, open the resulting PDF, and confirm:
- Header order: clinic → tel → address → divider.
- Medicine on left, QTY/EXP stacked on the right of the same row.
- Centered dosage, bilingual frequency, indication, precaution.
- Bottom row: patient block left, Date right; no "Ubat Terkawal" line.
- Adjusting the 3 typography sliders still expands the corresponding block without overlap.
