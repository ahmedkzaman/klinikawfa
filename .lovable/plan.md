## Goal
Replace the fragile "hide #root" print strategy with a hidden-iframe print, and confirm the Attached Documents list refreshes immediately after save.

## 1. New iframe print helper — `src/lib/clinic/printDocument.ts`
Export `printDocument(doc: ConsultationDocument)`:
- Create a hidden `<iframe>` (`position:fixed; right:0; bottom:0; width:0; height:0; border:0; visibility:hidden`) and append to `document.body`.
- Open its document and write a full HTML page:
  - `<head><style>` with:
    - `@page { size: <doc.paper_size> <doc.orientation>; margin: 0 }`
    - `html, body { margin:0; padding:0; background:#fff; color:#0f172a }`
    - `.sheet { padding: 15mm; }` for A6, `25mm` otherwise.
    - `pre { font-family: ui-sans-serif, system-ui, sans-serif; font-size: 12pt; line-height: 1.5; white-space: pre-wrap; margin:0 }`
  - `<body><div class="sheet"><pre>{HTML-escaped doc.content}</pre></div></body>`
- After `iframe.onload` (with a 200ms safety fallback), call `iframe.contentWindow.focus()` then `iframe.contentWindow.print()`.
- Remove the iframe ~1000ms after print returns (and on `onafterprint` if available).

## 2. Wire it into `ConsultationDetail.tsx`
- Remove `DocumentPrintLayer` import + render and the `printingDoc` state + `setTimeout(() => window.print(), 250)` block.
- Keep Eye (View), Pencil (Edit), Trash (Void) row actions; both the row's Print trigger and `ViewDocumentModal`'s `onPrint` now call `printDocument(doc)` directly.
- `ViewDocumentModal` `onPrint`: close the modal, then call `printDocument(doc)`.

## 3. Delete dead code
- Delete `src/components/clinic/consultation/DocumentPrintLayer.tsx`.

## 4. List refresh sanity check
- Confirm `useAddConsultationDocument` invalidates `['consultation-documents', consultation_id]` matching `useConsultationDocuments(consultationId)` — already aligned. No code change unless a mismatch is found while editing.

## Out of Scope
- Branded letterhead/logo/signature line in the print output (keeps current plain `<pre>` rendering).
- Edit/Void flows (already implemented previously).
- Soft-delete or audit logging.

## Files Touched
- New: `src/lib/clinic/printDocument.ts`
- Edited: `src/pages/clinic/ConsultationDetail.tsx`, `src/components/clinic/consultation/ViewDocumentModal.tsx`
- Deleted: `src/components/clinic/consultation/DocumentPrintLayer.tsx`
