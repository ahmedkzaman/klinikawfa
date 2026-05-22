# Receipt Accounting Fix — Subtotal / Invoice Total / Balance

The current `ReceiptTemplate` collapses Grand Total to `amountPaid`, which is wrong when a patient pays in multiple receipts or makes a partial payment. Rebuild the totals block with proper accounting separation, leaving the letterhead and dialog wiring already in place untouched.

## Scope

### 1. `ReceiptTemplate.tsx` — totals block

- Keep existing letterhead, patient block, item table, signatures, footer, `print-container` wrapper, and `min-h-[1056px]` (~A4 at 96dpi) — add the min-height to the wrapper.
- Extend `ReceiptData` with:
  - `invoiceTotal: number` — derived from items (subtotal). There are no invoice-level discount columns on `consultations` / `consultation_items`, so invoice total equals subtotal. Computed in the dialog query, not from `amountPaid`.
  - `balanceRemaining: number` — `Math.max(0, invoiceTotal - amountPaid)`.
- Replace the tfoot with these explicit rows:
  - **Subtotal (RM)** — sum of line totals.
  - **Invoice Total (RM)** — same as subtotal today (kept as a separate semantic row so future invoice-level discounts plug in cleanly).
  - **This Receipt Amount (RM)** — `amountPaid` for this single payment.
  - **Balance Remaining (RM)** — only rendered when `balanceRemaining > 0`.
- Keep the bordered Payment box: `Paid via: {formatPaymentMethod(...)}` + `Amount Received: RM …` (this receipt's amount).

### 2. `PrintReceiptDialog.tsx` — query

- Continue fetching the payment, queue entry, patient, and consultation items as today.
- Compute `subtotal` exactly as today (uses `dispensed_qty` when `item_id` is set, else `quantity`).
- Set `invoiceTotal = subtotal` (placeholder for future invoice-level discount field; explicitly NOT `amountPaid`).
- Set `balanceRemaining = max(0, invoiceTotal - amountPaid)`.
- Pass all three plus `amountPaid` to `ReceiptTemplate` via the extended `ReceiptData`.

### 3. Triggers — unchanged

- `Billings.tsx` printer button, `BillingDetailsColumn.tsx` per-payment button, and the `DispenseCheckout.tsx` footer "Print Receipt" button (latest payment id) are already wired and stay as-is.

### 4. `src/index.css`

- Existing `@media print` block already hides app shell via `body * { visibility: hidden }` + `.print-container *` visible + `.no-print { display: none }`. No change required for this task.

## Out of scope

- No DB migrations, no panel/claims logic changes.
- No new invoice-level discount column — flagged as a follow-up if discounts ever need to be modelled separately from per-line `price`.
- No changes to `ClientInvoicePrintTemplate` or any document template.
