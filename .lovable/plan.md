# Receipt Layout + Cumulative Balance

Two issues bundled:
1. The receipt wrapper uses `max-w-2xl` so the letterhead, table, and Paid-via box don't stretch the full A4 width — header right-column and table look squeezed.
2. `balanceRemaining` is calculated from THIS receipt's amount only, so split payments always look wrong (a RM 50 first payment on a RM 150 bill shows RM 100 balance correctly only by coincidence; second payment can't see the first).

## Changes

### `src/components/clinic/billing/ReceiptTemplate.tsx`
- Replace outer wrapper class with `print-container w-full max-w-[794px] mx-auto bg-white text-black p-8 min-h-[1056px]` (A4 width at 96dpi).
- Letterhead row already uses `flex items-start justify-between` — keep, ensure `w-full`.
- Add `w-full` to the items `<table>` (already `w-full`, verify) and to the bordered Payment box.
- Totals block already renders Subtotal / Invoice Total / This Receipt Amount, with Balance Remaining gated on `> 0` — no logic change here; it now reads the correctly-cumulative `balanceRemaining` passed by the dialog.

### `src/components/clinic/billing/PrintReceiptDialog.tsx`
- Existing query stays for this specific payment + queue/patient + consultation items.
- Add a fetch of ALL non-deleted payments for the same `queue_entry_id`, summing `amount` into `totalPaidToDate`.
- Compute:
  - `subtotal` from `consultation_items` (existing logic using `dispensed_qty`).
  - `invoiceTotal = subtotal` (placeholder).
  - `balanceRemaining = Math.max(0, invoiceTotal - totalPaidToDate)`.
- Pass through `amountPaid` (this receipt), `invoiceTotal`, `balanceRemaining` via the existing `ReceiptData` interface.

### Out of scope
- No edits to `src/index.css` `@media print` rules.
- No DB schema, panel, or claim changes.
- No changes to triggers in `Billings.tsx`, `BillingDetailsColumn.tsx`, or `DispenseCheckout.tsx`.
