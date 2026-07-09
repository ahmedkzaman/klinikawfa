## What I found

- MC / prescriptions print via `src/lib/clinic/printDocument.ts` — uses **jsPDF native text** (`pdf.text`, helvetica), then `pdf.autoPrint()` + opens a blob URL for the browser print dialog. No `html2canvas` involved, so text is real vector text (no fake-bold, no rasterization artifacts).
- Receipt currently uses `html2canvas` → JPEG → `jsPDF.addImage`. That's why bolded `l`/`i` look distorted — it's a raster capture of DOM text.

## Plan

Refactor receipt printing/download to match the MC pattern: **native jsPDF drawing**, no `html2canvas`.

### New file
- `src/lib/clinic/printReceipt.ts` — pure logic module that takes `ReceiptData` + `ClinicSettings` and renders an A4 PDF using jsPDF primitives:
  - Header: logo via `pdf.addImage` (fetched once as data URL), clinic name/address/phone/email/SST as `pdf.text`.
  - "OFFICIAL RECEIPT" title + receipt no / date / queue on the right.
  - Patient block (name, age, IC).
  - Itemised table using `jspdf-autotable` (already common with jsPDF; if not installed, we draw manually with `pdf.rect` + `pdf.text` like `printDocument.ts` does for text wrapping). **I'll draw manually to avoid adding a dependency**, matching the existing pattern.
  - Totals rows, payment block, signature lines, footer.
  - Exposes two functions:
    - `printReceipt(data, settings)` → `pdf.autoPrint()` + open blob (same as MC).
    - `downloadReceiptPdf(data, settings)` → `pdf.save('Receipt-XXXXXXXX.pdf')`.

### Files edited
- `src/components/clinic/billing/PrintReceiptDialog.tsx`
  - Remove `html2canvas` capture logic and the off-screen clone.
  - `handleDownloadPdf` → call `downloadReceiptPdf(data, settings)`.
  - `handlePrint` → call `printReceipt(data, settings)` instead of `window.print()` (so print output matches PDF exactly, no more browser CSS surprises).
  - Keep the on-screen `ReceiptTemplate` preview unchanged (it stays as the HTML preview inside the dialog).
  - `autoDownload` behavior preserved.
- `src/pages/clinic/Billings.tsx` — no change; still opens the dialog with `autoDownload`.

### Files untouched
- `ReceiptTemplate.tsx` — remains the on-screen preview only. No print/PDF CSS needed anymore, but I'll leave it as-is to avoid scope creep.
- Backend, hooks, edge functions — untouched.

## Why this fixes the issue

Native jsPDF text is rendered as real PDF text objects using embedded helvetica — same as MC / prescriptions — so bold characters render cleanly at any zoom and print sharply. No canvas rasterization means no font-synthesis artifacts.

## Risks

- Layout parity: the native PDF won't be pixel-identical to the HTML preview (fonts/metrics differ). I'll match spacing/columns visually against the current receipt but exact alignment of the table may shift slightly.
- Logo: needs to be fetched as a data URL (CORS). Clinic logo is already loaded with `crossOrigin="anonymous"` in the template, so the same URL should work; if fetch fails, PDF renders without the logo (graceful fallback), matching MC behavior which has no logo.
- Long item lists: I'll page-break the table when rows overflow the A4 usable area, mirroring `printDocument.ts`'s pagination loop.

## Out of scope

- Adding `jspdf-autotable` or other new dependencies.
- Changing receipt content, fields, or the on-screen preview.
- Any backend / data changes.
