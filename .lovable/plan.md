# Step 32 — True 60×50mm Thermal Label via PDF

## Why the current approach failed

Looking at your screenshot, the `@page { size: 60mm 50mm }` CSS is being **ignored** — the browser still rendered the label centered on a full A4 sheet with the date, page title (`Queue Board — Clinic Portal | Klinik Awfa`), and the project URL stamped on top/bottom.

This is a known Chromium limitation:
- `@page size` only takes effect when the user manually picks a matching paper size and sets *Margins → None* in the print dialog.
- Browser-injected headers/footers (date/title/URL) **cannot** be removed by CSS — only by the user unticking *Headers and footers*.

A consumer clicking "Print" will never get the right output.

## The fix — generate a real 60×50mm PDF

Build the label as a vector PDF with exact physical dimensions, open it in a new tab, and let the browser/printer driver print it 1:1. No `@page` guesswork, no browser chrome, works the same on every printer.

### A. Add `jspdf` dependency
~30 KB, zero peer deps. Standard tool for client-side PDF generation.

### B. New helper — `src/lib/clinic/printDrugLabel.ts`

A pure function `generateDrugLabelPdf(items, patientName, settings, clinic)` that:

1. Creates `new jsPDF({ unit: 'mm', format: [60, 50], orientation: 'landscape' })`.
2. For each item, draws one page using `doc.text` / `doc.line` / `doc.setFont`:
   - **Header (top, ~3 mm)** — Clinic name (bold, 8pt all-caps), tel (5pt) if `show_tel_number`, address (5pt, wrapped) if `show_address`.
   - **Hairline divider** — `doc.line()`.
   - **Patient strip** — `PATIENT NAME` bold 6pt.
   - **Medication block** — `item_name` bold 8pt, wrapped to 54 mm width (~2 lines max).
   - **Indication** — `For: {indication}` italic 6pt, only if `show_indication` and value present.
   - **Instruction** (centred, bold 7pt) — built from `dosageBits` (e.g. `1 BIJI · 3X SEHARI`).
   - **Footer row** — `QTY: x` left, `Date: dd/mm/yyyy` centre (if `show_date`), `EXP: mm/yyyy` right (if `show_expiry_date`). All 5pt.
   - **Bottom strip** — `Ubat Terkawal / Controlled Medicine` italic 4.5pt centred at y ≈ 48 mm.
3. Calls `doc.addPage([60, 50], 'landscape')` between items.
4. Returns the PDF as a `Blob` URL via `doc.output('bloburl')`.

Layout uses `splitTextToSize` for clean wrapping and `getTextWidth` for the centred QTY/Date/EXP row, so nothing clips even when toggles are off.

### C. Wire it into `VisitDetailsColumn.tsx`

- Delete `ThermalLabelPortal`, `ThermalLabel`, `THERMAL_PRINT_CSS`, and the old `<style>`/`createPortal` plumbing — they are no longer needed.
- Replace the body of `handlePrintLabel` (and the "Print all labels" handler) with:
  ```ts
  const url = generateDrugLabelPdf(rows, patientName, labelSettings, CLINIC_INFO);
  const win = window.open(url, '_blank');
  win?.addEventListener('load', () => win.print());
  ```
- `CLINIC_INFO` is a small const at the top of the helper — name, tel, address pulled from the existing memory (`mem://project/contact-info`).

### D. UX side-effects

- The user gets a new tab with the PDF preview. Their browser's PDF viewer shows it at exact 60×50 mm.
- Auto-print prompt fires once the PDF finishes loading.
- No browser headers/footers, no margin negotiation, no "set paper size to custom" instructions.
- Print dialog will show *Paper size: 60×50 mm* automatically (it reads the PDF metadata).

### Files touched

- **New:** `src/lib/clinic/printDrugLabel.ts` — jsPDF helper.
- **Edited:** `src/components/clinic/visit/VisitDetailsColumn.tsx` — remove portal + CSS, call helper.
- **Edited:** `package.json` — add `jspdf`.

### Out of scope

- No DB or hook changes; `useDrugLabelSettings` is consumed as-is.
- The on-screen Live Preview in `DrugLabelSettings.tsx` stays exactly as it is — only the *printed* output changes.