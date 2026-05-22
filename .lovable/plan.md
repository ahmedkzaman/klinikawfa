# Fix Drug Label Layout — Move Patient/Date to Top, Tighten Margins

**Target:** `src/lib/clinic/printDrugLabel.ts` (jsPDF-based; no HTML template exists).

## 1. Tighten margins

- `MARGIN_X`: `2` → `1` mm (≈ 2mm narrower content cutoff overall, matches "reduce by 2mm" intent).
- Top start `y`: `3` → `2` mm.
- This brings clinic header, medicine name, and footer date closer to the physical sticker edges without changing fonts.

## 2. Move Patient Name + Date to the TOP

Restructure `drawLabel` so the order becomes:

```text
1. Clinic header (name, tel, address)        ← unchanged
2. Divider
3. Patient block: NAME (left, bold)  |  DATE (right)   ← NEW position
4. Divider
5. Medicine name (left) + QTY/EXP (right)
6. Centered body (dosage, frequency, indication, precaution)
7. Footer area: only Duration (if shown) + age/gender
```

Implementation details:
- After the first divider, draw `patientName.toUpperCase()` bold-left at `MARGIN_X` and `Date: d/M/yyyy` right-aligned on the same baseline (Flexbox-equivalent via `drawRight`).
- Add a second thin divider beneath that row before the medicine name.
- Patient name truncates with `…` if it would overlap the date's left edge (compute `dateWidth` first, clip name to `SAFE_W - dateWidth - 2mm`).

## 3. Clean up the bottom

- Remove patient name and `Date:` from the footer block entirely.
- Footer now only holds (when present): age/gender line and `Duration: …` line, followed by the existing closing divider.
- Recompute `footerBlockH` / `dividerY` from the reduced footer (often 0–2 lines), giving the body more vertical room — this also fixes the long-name collision permanently since name and date no longer share the footer row.

## Constraints respected

- Font sizes for medicine name (`fsMed`) and instructions (`fsInstr`) untouched.
- Clinic header logic (name/tel/address toggles, centering) untouched.
- `show_date` toggle still controls whether the date prints (now in the top block instead of bottom-right).
- `generateDrugLabelPdf` signature and all exported types unchanged.

## Verification

- Print a label for a patient with a long name (e.g., "MUHAMMAD ABDUL RAHMAN BIN ZULKIFLI") → name appears top-left uppercased, date top-right, no overlap.
- Short-name patient → layout unchanged visually except name/date relocated.
- Confirm 60×50mm sticker prints without edge clipping after `MARGIN_X` reduction.
