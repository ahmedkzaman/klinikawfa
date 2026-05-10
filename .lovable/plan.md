## Goal
Force the browser's print dialog to respect the document's actual paper size and orientation by using explicit mm dimensions in `@page`, and nudge the user to set Margins = None.

## 1. `src/lib/clinic/printDocument.ts` — explicit mm dimensions
Add an internal lookup:

```text
A4 portrait → 210mm 297mm    A4 landscape → 297mm 210mm
A5 portrait → 148mm 210mm    A5 landscape → 210mm 148mm
A6 portrait → 105mm 148mm    A6 landscape → 148mm 105mm
```

Resolve `{ width, height }` from `doc.paper_size` + `doc.orientation` (default A4 portrait on unknown values).

Replace the current `<style>` block with:

```css
@page {
  size: ${width} ${height};
  margin: 0 !important;
}
html, body {
  margin: 0 !important;
  padding: 0 !important;
  width: ${width};
  height: ${height};
  background: #fff;
  color: #0f172a;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.sheet {
  width: ${width};
  height: ${height};
  padding: ${padding};   /* 15mm for A6, 25mm otherwise */
  box-sizing: border-box;
  overflow: hidden;
}
pre {
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 12pt;
  line-height: 1.5;
  white-space: pre-wrap;
  word-wrap: break-word;
  margin: 0;
}
```

Keep the rest of the helper (hidden iframe, `onload` + 300ms fallback trigger, `onafterprint`/1.5s cleanup) unchanged.

## 2. Print-dialog hint toast
At the start of `printDocument()`, fire a `sonner` toast (already used project-wide):

```ts
toast("Pro-tip: set Margins to ‘None’ in the print dialog for best fit.", { duration: 6000 });
```

Imported as `import { toast } from 'sonner'`. One-line, non-blocking.

## Out of Scope
- Removing the "Margins" dropdown (browser-controlled, can't be hidden).
- Auto-selecting the printer or bypassing the print dialog.
- Letterhead/branding inside the printed sheet.

## Files Touched
- `src/lib/clinic/printDocument.ts`
