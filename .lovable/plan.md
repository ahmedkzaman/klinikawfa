# Fix Panel Copayment Method Override

## Problem
`RecordPaymentDialog.tsx` hardcodes `payment_method = "Panel: {name}"` for all panel visits, so out-of-pocket copayments (cash/QR/card) are misclassified in shift reports.

## Changes — `src/components/clinic/visit/RecordPaymentDialog.tsx`

1. **Preserve `selfPayMethod` across tabs.** Remove the line in the paymentType-toggle effect that clears it when switching to panel. The method initialized from `defaultPaymentMethod` stays put.

2. **Show payment method dropdown unconditionally.** Render the `<Select>` for both self-pay and panel. Dynamic label: `"Copayment Method"` when panel, `"Payment Method"` when self-pay. The panel provider picker still only appears on the panel tab.

3. **Validation.** Require `selfPayMethod` whenever `numericAmount > 0` (covers both flows, including fractional copayments like RM 0.50).

4. **Submit logic.** Replace the ternary with:
   ```ts
   const resolvedMethodLabel =
     paymentType === 'panel' && numericAmount === 0
       ? `Panel: ${selectedProvider!.name}`
       : selfPayMethod;
   ```
   Panel string is recorded only when the panel covers 100%; any out-of-pocket amount records the physical method.

## Out of scope
- `BillingDetailsColumn.tsx` (already passes `defaultPaymentMethod`)
- Panel billing / claim logic
