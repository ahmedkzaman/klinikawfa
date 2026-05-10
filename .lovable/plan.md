## Goal
Make the browser's Print dialog auto-detect the document's paper size (A4/A5/A6) and orientation, instead of always defaulting to A4 and shrinking smaller documents.

## Approach
Replace the current "open popup window + print" flow on `ConsultationDetail.tsx`'s Attached Documents list with an **inline print** flow that injects a dynamic `@page` rule into the existing page right before printing. The on-screen UI stays unchanged; only the print output is affected.

## Changes

### 1. New component: `src/components/clinic/consultation/DocumentPrintLayer.tsx`
A render-only component used at the page level. Props: `doc: ConsultationDocument | null`.

- Returns `null` when `doc` is `null`.
- When `doc` is set, renders two things inside a fragment:
  - A `<style media="print">` tag with:
    ```
    @page { size: {doc.paper_size} {doc.orientation}; margin: 0mm; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      body > *:not(.doc-print-root) { display: none !important; }
      .doc-print-root { display: block !important; }
    }
    ```
    The `body > *:not(...)` rule hides the rest of the app during print so only the document prints.
  - A `.doc-print-root hidden print:block` wrapper containing the white paper div. The paper div uses `getPaperStyle(...)` for on-screen consistency *plus* the print classes from the spec: `print:w-full print:max-w-none print:min-w-full print:h-full print:min-h-full print:shadow-none print:m-0 print:border-0 print:p-[10mm]` (small inner padding so text isn't flush to the cut edge — `@page` margin is 0).
  - Renders `doc.content` inside a `<pre className="whitespace-pre-wrap font-sans text-[12pt] leading-relaxed text-slate-900">` so existing newline-based templates still look right.

### 2. Wire it into `ConsultationDetail.tsx`
- Add state: `const [printingDoc, setPrintingDoc] = useState<ConsultationDocument | null>(null);`
- Replace the popup `window.open(...)` block (lines ~977–986) in the View/Print button with:
  ```ts
  setPrintingDoc(doc);
  setTimeout(() => {
    window.print();
    setPrintingDoc(null);
  }, 100);
  ```
- Render `<DocumentPrintLayer doc={printingDoc} />` once, near the bottom of the page (next to the existing modals around line ~1304).

### 3. No changes to
- `getPaperStyle` (still used for in-app preview).
- `IssueDocumentModal` (no print there today; out of scope).
- Database, hooks, RLS.

## Why this works
- The dynamic `@page size: A6 landscape` is injected into the live document right before `window.print()` fires. Browsers read this and pre-select the matching paper size in the print dialog.
- `margin: 0mm` removes the browser's default ~1cm margin that was causing the "massive white border" effect on A5/A6.
- Hiding all other body children during print ensures only the paper container is sent to the printer, so the print classes (`print:w-full`, etc.) cleanly fill the `@page`.
- The 100ms `setTimeout` lets React flush the new `<style>` tag to the DOM before `window.print()` reads it.

## Out of scope
Rich-text rendering, letterhead/logo on print, multi-page pagination, PDF export.