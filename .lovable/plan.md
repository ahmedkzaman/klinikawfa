# Fix Print Centering on Receipt Dialog

Receipts print halfway down the page because Radix `DialogContent` uses `position: fixed; top: 50%; transform: translate(-50%, -50%)`, which the print renderer honours.

## Change

**`src/index.css`** — replace the existing `@media print` block (lines ~471–494) that scopes `.print-container` / `.no-print` with a hardened version that ALSO neutralises Radix dialog centering:

- Keep the existing visibility hiding (`body *` hidden, `.print-container *` visible).
- Force `.print-container` to `position: absolute; top:0; left:0; width:100%; margin:0; padding:0` with `!important`.
- Strip `position`, `transform`, `top`, `left`, `max-width`, `border`, `box-shadow`, `margin`, `padding` on dialog containers: `div[role="dialog"]`, `.fixed[data-state="open"]`, `[data-radix-dialog-content]`.
- Keep `.no-print { display: none !important }`.

Other `@media print` blocks in `index.css` (Client Invoice, PO templates) are untouched.

## Out of scope

- No React/component changes — `ReceiptTemplate.tsx` and `PrintReceiptDialog.tsx` stay as-is.
- No DB / business logic changes.
