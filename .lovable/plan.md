# Official Letterhead Receipts

Replace the existing POS-style receipt with an A4 receipt that mirrors the clinic's official letterhead — same header treatment used by Tax Invoices, MCs, and Referral Letters.

## Scope

1. **`src/index.css`** — keep the `@media print` block added previously (`.print-container` / `.no-print`). No new CSS required; it already matches the spec.

2. **`src/components/clinic/billing/ReceiptTemplate.tsx`** — rewrite to an official A4 layout:
   - Outer wrapper: `print-container max-w-2xl mx-auto bg-white text-black p-8` with `colorScheme: light`.
   - **Letterhead** (identical pattern to `ClientInvoicePrintTemplate`):
     - Logo on the left at `settings.logo_height_px`.
     - Clinic name, address lines, phone, email, SST no. at `settings.letterhead_text_px`.
     - Right column: bold "OFFICIAL RECEIPT" title, plus receipt no (short payment id), date/time, queue label.
     - Separator: `border-b-2 border-black`.
   - **Content** offset by `settings.content_margin_top`.
   - **Patient block**: name + IC/national_id + visit date.
   - **Itemized table** (`border-collapse`, black borders) — columns: No, Item, Qty, Unit Price (RM), Total (RM). Pulled from existing `consultation_items` query (uses `dispensed_qty` when applicable, same logic as today).
   - **Totals**: Subtotal row; if `amountPaid < subtotal`, show a Discount/Adjustment row for the delta; bold Grand Total = `amountPaid`.
   - **Payment**: "Paid via: {formatPaymentMethod(...)}" + amount in words-free RM line.
   - **Footer**: "Generated on …" timestamp + thank-you line.

3. **`src/components/clinic/billing/PrintReceiptDialog.tsx`** — no behavioural change. Continues to fetch via existing query, pass data + settings to the new template, expose Close + Print Receipt (which calls `window.print()`). Footer stays `no-print`. Already wired correctly.

4. **Triggers** — already wired in this codebase:
   - `Billings.tsx`: Printer icon button in the ledger row (uses `latestPaymentId`).
   - `BillingDetailsColumn.tsx`: Print button per recorded payment.
   - `DispenseCheckout`: add a "Print Receipt" button visible after a payment row exists for the visit (opens `PrintReceiptDialog` with that payment id). If multiple payments exist, use the most recent.

## Out of scope

- No DB migrations, no edge functions.
- No changes to payment recording, panel logic, or claims.
- No changes to `ClientInvoicePrintTemplate`, `POPrintTemplate`, or any document template settings.

## Technical notes

- Letterhead settings come from `useClinicSettings()` (`logo_url`, `logo_height_px`, `letterhead_text_px`, `content_margin_top`, `sst_number`, `clinic_name`, `address_line_*`, `phone`, `email`) — identical to existing official documents, so the receipt visually matches MCs and invoices.
- `ReceiptData` interface kept stable; only the rendering changes.
- `print-container` makes `body *` invisible during print so only the receipt prints — sidebar, dialog chrome, and buttons are stripped automatically.
