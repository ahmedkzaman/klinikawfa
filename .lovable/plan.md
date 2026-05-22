# Track patient payment method at checkout

## Context

The `payments` table already has a required `payment_method` column, and `RecordPaymentDialog` already writes it (currently with three labels: `Cash`, `TNG / DuitNow QR`, `Credit/Debit Card`). What's missing:

1. The four canonical options the user wants (`cash`, `qr_pay`, `card`, `transfer`).
2. An at-a-glance picker on the billing column itself — visible only when the patient actually owes money — so staff can choose the method before opening the payment dialog.

No database migration is required.

## Changes

### 1. `src/components/clinic/visit/BillingDetailsColumn.tsx`
- Add `const [paymentMethod, setPaymentMethod] = useState<string>('cash')`.
- Render a `<Select>` labeled **Payment Method** directly above the "Record Payment" button, **only when `outstanding > 0`**. Options:
  - `cash` → "Cash"
  - `qr_pay` → "QR Pay / E-Wallet"
  - `card` → "Credit / Debit Card"
  - `transfer` → "Online Transfer"
- Pass `defaultPaymentMethod={paymentMethod}` into `<RecordPaymentDialog />`.

### 2. `src/components/clinic/visit/RecordPaymentDialog.tsx`
- Accept new optional prop `defaultPaymentMethod?: string`.
- Replace the current `SELF_PAY_METHODS` constant with the canonical list:
  ```ts
  const SELF_PAY_METHODS = [
    { value: 'cash',     label: 'Cash' },
    { value: 'qr_pay',   label: 'QR Pay / E-Wallet' },
    { value: 'card',     label: 'Credit / Debit Card' },
    { value: 'transfer', label: 'Online Transfer' },
  ] as const;
  ```
- Initialize `selfPayMethod` from `defaultPaymentMethod` (falling back to `'cash'`) whenever the dialog opens for a self-pay flow.
- When submitting, send the canonical code as `payment_method` for self-pay (panel branch unchanged — still `Panel: {name}`).

### 3. Payload
- `useRecordPayment` already serializes `payment_method` into the insert, so no hook changes. For panel-covered visits where the patient owes nothing, the dropdown stays hidden and the existing panel flow continues writing `payment_method = "Panel: {name}"` untouched.

## Out of scope
- Panel billing logic and panel selection UI.
- Reporting / shift-report screens (they already read `payment_method` from `payments`).
- Schema changes — `payments.payment_method` already exists and is NOT NULL.
