## Goal
Add a "Download PDF" action to each row in the Billings page so users can download a receipt directly from the list (in addition to the existing Print button).

## Changes

**`src/pages/clinic/Billings.tsx`**
- Add a `Download` icon button next to the existing Printer button on each row (only shown when `e.latestPaymentId && visitCount === 1`, matching current Print behavior).
- Reuse `PrintReceiptDialog` — already supports PDF download. Two options:
  - **Option A (recommended):** Open the existing dialog with a new `autoDownload` flag, which triggers `handleDownloadPdf` automatically once data loads, then closes. Keeps a single source of truth for PDF rendering.
  - Option B: Extract `handleDownloadPdf` into a reusable hook and call it inline (no dialog). More refactor surface.

**`src/components/clinic/billing/PrintReceiptDialog.tsx`**
- Add optional `autoDownload?: boolean` prop.
- When `open && autoDownload && data && !isLoading`, run `handleDownloadPdf()` once, then call `onOpenChange(false)`.
- The receipt still mounts (needed for `receiptRef`), but the dialog can be rendered hidden via existing flow — simplest is to let it briefly appear then auto-close after the download finishes.

## UX
- Billings row gets a small Download icon button with tooltip "Download PDF receipt".
- Clicking it briefly opens the receipt dialog (or downloads silently) and produces `Receipt-XXXXXXXX.pdf` (same naming as today).
- No changes to backend, hooks, or receipt layout.

## Out of scope
- Bulk download / grouped multi-visit receipts (those still rely on per-payment receipts and visitCount === 1 gating).
- Changes to receipt content or A4 formatting (already fixed in prior turns).
