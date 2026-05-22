# Printable Patient Receipts

Add a POS-style receipt that the front desk can print from Billings History and right after recording a payment, using a CSS `@media print` approach so the browser strips out the app chrome.

## What we'll build

1. **Global print CSS** — add a `.print-container` rule set in `src/index.css` so anywhere we render that wrapper, the browser print preview shows only the receipt.
2. **`ReceiptTemplate` component** — pure, presentational POS receipt (80mm-ish width) for a single `payments` row.
3. **`PrintReceiptDialog` component** — modal that loads the payment + its visit/patient/consultation items, renders `ReceiptTemplate`, and exposes a `Print` button that calls `window.print()`.
4. **Wire triggers** — add a printer-icon button in the Billings History row actions, and a "Print Receipt" button on `BillingDetailsColumn` (the visit detail screen rendered after a payment is recorded — there is no dedicated success screen in `DispenseCheckout`).

## Files to add

- `src/components/clinic/billing/ReceiptTemplate.tsx`
- `src/components/clinic/billing/PrintReceiptDialog.tsx`

## Files to edit

- `src/index.css` — append the `@media print` block scoped to `.print-container` / `.no-print`. Keep the existing PO + client-invoice print rules untouched (they use their own roots and won't conflict).
- `src/pages/clinic/Billings.tsx` — add a `Printer` icon button in the actions cell that opens `PrintReceiptDialog` for the latest payment of that visit.
- `src/components/clinic/visit/BillingDetailsColumn.tsx` — after the payments list, add a small "Print Receipt" button per recorded payment that opens the dialog.

## Data the dialog needs

Given a `paymentId`, fetch in one query:

- `payments` row (amount, payment_method, payment_type, created_at, notes, queue_entry_id, consultation_id)
- `queue_entries` → `patients(name, ic_number, phone)` and `queue_sequence`
- `consultation_items` for the consultation: name, qty, unit_price, line_total
- `clinic_settings` via existing `useClinicSettings` for header (clinic name, address lines, phone, logo)

Use `formatPaymentMethod` from `src/lib/clinic/paymentMethod.ts` for the method label so panel and legacy values render correctly.

## Receipt layout

```text
        [Logo]
       Klinik Awfa
   Address line 1, line 2
        Tel: ...
------------------------------
Receipt #: <short payment id>
Date:      <dd MMM yyyy, h:mm a>
Queue:     A012
Patient:   <name>
IC:        <ic_number>
------------------------------
Item                Qty   Total
Paracetamol 500mg    10   5.00
Consultation          1  35.00
...
------------------------------
Subtotal             RM 40.00
Grand Total          RM 40.00
------------------------------
Paid via: QR Pay     RM 40.00
------------------------------
   Thank you for your visit
       Get well soon
```

Wrapper: `<div className="print-container max-w-md mx-auto bg-white text-black p-4 text-sm font-mono">`. Dividers use `<hr className="border-dashed border-t border-black my-2" />`. Numbers right-aligned with `tabular-nums`.

## Technical notes

- New `@media print` block in `index.css`:
  ```css
  @media print {
    body * { visibility: hidden; }
    .print-container, .print-container * { visibility: visible; }
    .print-container {
      position: absolute; left: 0; top: 0;
      width: 100%; margin: 0; padding: 0;
    }
    .no-print { display: none !important; }
  }
  ```
  This sits alongside the existing PO/client-invoice print rules; both rely on visibility toggling and don't fight each other because only one print root is mounted at a time.
- Dialog body wraps the receipt in a `max-h-[70vh] overflow-y-auto` area; sticky footer holds `Close` and `Print Receipt`. Both footer buttons get `no-print`, and so does the Dialog overlay (Radix portals it outside `body` text content, but `visibility: hidden` on `body *` already hides it on print).
- `window.print()` is called directly; no extra libraries.
- Billings row trigger uses the most recent `payments` row already in scope (each row in the ledger maps 1:1 to a payment). On `BillingDetailsColumn`, each listed payment gets its own print button keyed by `payment.id`.
- No DB migrations, no edge functions, no changes to payment recording logic.
