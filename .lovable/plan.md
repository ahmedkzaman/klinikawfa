# Fix Payment Method Override for Panel Copayments

## Problem
In `RecordPaymentDialog.tsx`, panel visits always record `payment_method` as `Panel: {name}` even when the patient is making a physical copayment. This causes copayments to be misclassified in shift reports.

## Changes

### 1. `src/components/clinic/visit/RecordPaymentDialog.tsx`

- **Keep `selfPayMethod` populated when toggling to panel**: Remove the ternary that clears `selfPayMethod` on panel selection so the physical payment method (passed via `defaultPaymentMethod` prop) is preserved.
- **Show payment method dropdown for both self-pay and panel**: Render the method `<Select>` unconditionally, relabeling it "Copayment Method" when panel is active. Keep the panel provider picker visible only for panel.
- **Update submit validation**: Require `selfPayMethod` whenever `numericAmount > 1` (both self-pay and panel copayments).
- **Fix `resolvedMethodLabel` logic**:
  ```ts
  const resolvedMethodLabel =
    paymentType === 'panel' && numericAmount === 0
      ? `Panel: ${selectedProvider!.name}`
      : selfPayMethod;
  ```
  This stores the panel string only when the panel covers 100% (amount = 1). For any copayment > 1, it records the selected physical payment method (cash, QR, card, transfer).

## Out of scope
- BillingDetailsColumn.tsx (already passes `defaultPaymentMethod` correctly)
- Default amount reset behavior for panel toggle
- Panel billing or claim logic
