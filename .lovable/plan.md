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

---

# Display Payment Methods in Billing History and Receipts

## Context

- `usePaymentsLedger` already does `select('*')`, so `payment_method` is returned — no hook change needed.
- The per-payment list in `BillingDetailsColumn` already renders a badge with `p.payment_method` (~line 267), so the "invoice detail / receipt" surface is covered. It just needs the shared human-friendly formatter.
- The Billings page (`src/pages/clinic/Billings.tsx`) aggregates payments per queue entry but does not surface the method or break daily totals down by it.

## Changes

### 1. Shared formatter — `src/lib/clinic/paymentMethod.ts` (new)
```ts
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  qr_pay: 'QR Pay',
  card: 'Card',
  transfer: 'Transfer',
};

export function formatPaymentMethod(
  method: string | null | undefined,
  amount = 0,
): string {
  if (!method) return amount > 0 ? 'Cash (Legacy)' : '—';
  if (PAYMENT_METHOD_LABELS[method]) return PAYMENT_METHOD_LABELS[method];
  return method; // pass-through for legacy strings ("TNG / DuitNow QR", "Panel: AIA")
}

export function paymentMethodBadgeClass(method: string | null | undefined): string {
  switch (method) {
    case 'cash':     return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'qr_pay':   return 'bg-sky-100 text-sky-700 border-sky-200';
    case 'card':     return 'bg-violet-100 text-violet-700 border-violet-200';
    case 'transfer': return 'bg-amber-100 text-amber-700 border-amber-200';
    default:         return 'bg-slate-100 text-slate-600 border-slate-200';
  }
}
```

### 2. Billing history table — `src/pages/clinic/Billings.tsx`
- Extend `LedgerEntry` with `latestMethod: string | null`.
- In the `entries` memo (`sortedAsc` loop), set `latestMethod = p.payment_method ?? null` alongside `latestPaymentType`.
- Add a **METHOD** column to the grid template (`grid-cols-[80px_1fr_140px_100px_100px_100px_110px_80px]`), update the header array, and render a `<Badge>` using `formatPaymentMethod` + `paymentMethodBadgeClass`.

### 3. Daily summary tiles — `src/pages/clinic/Billings.tsx`
- Above the tabs add a `bento` row of small tiles (only when `activeTab === 'paid'`):
  - **Total Cash**, **Total QR**, **Total Card**, **Total Transfer**, **Total Legacy/Other**.
- Compute directly from the raw `ledger` (not aggregated `entries`) so each payment row lands in its actual bucket within the selected date range.

### 4. Per-payment receipt rows — `src/components/clinic/visit/BillingDetailsColumn.tsx`
- Replace `{p.payment_method}` with `formatPaymentMethod(p.payment_method, Number(p.amount))` and apply `paymentMethodBadgeClass` so legacy values render as "Cash (Legacy)" with neutral styling.

## Out of scope
- Panel claim screens (their method is implicitly `Panel: {name}` and already readable).
- Per-cashier / per-shift breakdowns — only date-range totals.
- Schema or migration work.
