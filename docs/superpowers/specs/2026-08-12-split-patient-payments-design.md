# Split Patient Payments Design

**Date:** 2026-08-12
**Status:** Approved direction; awaiting written-spec review

## Objective

Allow authorised clinic staff to settle one patient's payable amount using two or more physical payment methods, for example Cash RM40 plus QR Pay/E-wallet RM60, without misclassifying any portion as panel receivable or completing a visit after only part of an atomic checkout succeeds.

## Current Behaviour

- A visit can already contain multiple rows in `payments`, and billing totals add those rows.
- The payment dialog accepts only one method and one amount per submission.
- Active checkout calls `record_payment_and_complete_visit`, which inserts one payment and completes the visit in one database transaction.
- Completed visits use an additional-payment insertion path and can display or void individual payment rows.
- Panel accounting intentionally separates physical patient payments from panel receivables.

The database model therefore supports split history, but the checkout interface and atomic RPC support only a single portion.

## Chosen Approach

Add an editable payment-allocation list to the existing payment dialog and submit the full list through one server transaction.

For a RM100 self-pay balance:

1. The first row defaults to the selected/default method and RM100.
2. Staff change the first row to Cash RM40.
3. Staff press **Add payment method**.
4. The new row defaults to the remaining RM60.
5. Staff select QR Pay/E-wallet.
6. The dialog displays `Allocated RM100.00 / Remaining RM0.00` and permits checkout.

This keeps payment entry inside the familiar workflow and prevents a partially completed checkout.

## Payment Allocation Model

```ts
export interface PatientPaymentAllocation {
  method: 'cash' | 'qr_pay' | 'card' | 'transfer';
  amount: number;
  notes?: string | null;
}
```

The UI maintains amounts as strings while editing, but converts them to integer sen or two-decimal numbers for validation and submission. Comparisons use sen to avoid floating-point rounding errors.

Rules:

- At least one allocation is required for a positive patient balance.
- Every allocation must have one supported physical method.
- Every submitted allocation must be greater than RM0.00.
- The same method cannot appear twice in one submission; staff should combine it into one row.
- The allocation total cannot exceed the patient amount being collected.
- Active self-pay checkout requires the allocation total to equal the current patient outstanding exactly.
- Active panel checkout requires the allocation total to equal the co-payment amount declared in the dialog exactly and never exceed the visit total.
- A zero-payment/no-charge checkout remains available as the existing single zero-amount path.
- A newly added row defaults to the current remaining amount.
- Editing or removing any row immediately recalculates allocated and remaining amounts.
- Currency input is normalised to two decimals before submission.

## Self-Pay and Panel Behaviour

### Self-pay

The required allocation total is the visit's patient outstanding amount supplied to the dialog. Every portion is stored as `payment_type = 'self_pay'` with its physical `payment_method`.

### Panel visit with co-payment

The panel provider and panel receivable remain separate from the patient's physical payment allocations.

- Cash, QR Pay, Card, and Transfer portions are patient-paid ledger amounts only.
- None of those physical methods increases panel receivable.
- The selected panel provider remains visit/claim attribution.
- To preserve current panel reporting and claim linkage, co-payment rows retain `payment_type = 'panel'`, but their physical `payment_method` identifies them as patient-paid amounts in the shared dual-ledger calculation.
- A fully panel-covered visit with RM0 patient payment retains the existing panel-only checkout behaviour.
- A panel co-payment may itself be split across physical methods.
- The patient allocation total must equal the co-payment being collected, not the full panel bill.

The UI will label this list **Co-payment methods** on panel checkout.

## Atomic Database Operation

Introduce a batch RPC that accepts a JSON array of allocations and optionally completes the active visit:

```sql
record_split_payments_and_complete_visit(
  p_queue_entry_id uuid,
  p_consultation_id uuid,
  p_payment_type text,
  p_expected_patient_amount numeric,
  p_payments jsonb,
  p_provider_id uuid,
  p_notes text,
  p_idempotency_key uuid
) returns jsonb
```

The function will:

1. Authenticate the caller and enforce the same billing permission used by current checkout.
2. Lock and load the queue entry.
3. Validate that `p_payments` is an array with a bounded number of rows.
4. Validate supported methods, positive two-decimal amounts, unique methods, and the expected patient total.
5. For self-pay, validate that the expected patient amount matches current outstanding. For panel checkout, validate that it is non-negative, does not exceed the bill total, and matches the co-payment allocations.
6. Validate panel/provider consistency. Panel co-payment rows retain panel visit attribution while the physical payment method remains the source of patient-paid ledger classification.
7. Insert every payment row with the same queue entry, consultation, actor, and checkout correlation identifier.
8. Complete the queue entry/consultation only after all inserts succeed.
9. Return the inserted payment identifiers and final visit state.

Any validation or insert failure rolls back the entire transaction. Retrying the same request must not create duplicates; the client supplies `p_idempotency_key`, and the database enforces one completed batch per visit and token.

The existing single-payment RPC remains compatible for older clients until all callers migrate.

## Completed Visits

For completed bills, **Record Payment** uses a separate `record_split_payments` batch RPC with the same allocation and idempotency validation but does not change visit status. It may record a partial amount up to the remaining outstanding balance because debt can be collected over multiple occasions.

The completed-bill correction screen continues to edit existing payment rows individually. It should not merge separate Cash and QR Pay history into a synthetic row.

## User Interface

The dialog will show:

- Payment method selector and amount input on each row.
- **Remove** action for additional rows.
- **Add payment method** action until all four methods are used or remaining equals zero.
- Allocated total.
- Remaining amount.
- Red validation message for duplicate methods, invalid amounts, under-allocation, or over-allocation.
- Submit label **Record payments & check out** when multiple rows are present.

While submitting, closing and repeated submission remain disabled. On failure, all entered rows stay intact for correction or retry.

## Billing, Receipt, and Insight Presentation

- Visit details show each portion separately with its method, amount, timestamp, print, and void actions.
- The receipt lists every payment portion and a total paid amount.
- The Billings list derives the method summary from all active patient-payment rows for that visit, for example `Cash + QR Pay`, in canonical display order.
- Panel visits display `Panel: AIA + Copay` at the high level while their detail/receipt shows the physical co-payment portions.
- Method summary sorting uses the combined display label.
- Insight and collected-payment reporting continue to aggregate the individual payment events by their real method; no synthetic `split` method is stored.
- Voiding one portion reduces paid totals and reopens the appropriate outstanding amount without altering the other portion.

## Permissions and Audit

The feature uses existing billing permissions. Any role currently allowed to record a payment may record split portions. No new permission bypass is introduced.

Each row records the current user and timestamp through existing payment audit mechanisms. The batch correlation identifier makes the original checkout grouping visible for troubleshooting without changing method attribution.

## Error Handling

- Unsupported or duplicate method: reject before database submission and revalidate server-side.
- Under-allocation during active checkout: keep dialog open and show the remaining amount.
- Over-allocation: reject; do not treat the difference as change automatically.
- Stale outstanding balance caused by another staff action: server rejects with the current expected amount; client refreshes payment and billing queries while preserving entered rows.
- Network ambiguity: retry with the same idempotency token.
- Partial database failure: roll back every inserted row and status change.

## Testing

### Unit and component tests

- Adding a second method defaults to the exact remainder.
- Cash RM40 plus QR Pay RM60 validates against RM100.
- Duplicate Cash rows are rejected.
- Under-allocation and over-allocation disable active checkout.
- Removing or editing a row recalculates the remainder.
- Panel co-payment rows remain physical patient methods.
- Dialog state remains after a failed request.

### Database contract tests

- Two payment rows insert and the visit completes atomically.
- A failing second row inserts nothing and does not complete the visit.
- Duplicate idempotency token creates no duplicate rows.
- Unsupported, duplicate, negative, zero, over-, and under-allocated batches are rejected.
- Completed-visit batch permits partial collection up to outstanding.
- RLS/billing permission matches existing payment entry rules.
- Panel receivable excludes Cash/QR/Card/Transfer portions.

### Reporting regressions

- Billing paid/outstanding totals equal the sum of portions.
- Billings list shows `Cash + QR Pay`.
- Receipt prints both portions and the correct total.
- Insight attributes RM40 to Cash and RM60 to QR Pay.
- Voiding one portion updates paid and outstanding correctly.

## Deployment

Deploy the migration before or atomically with the frontend that invokes the new RPC. Keep the existing single-payment function available for rollback compatibility. After deployment, test one non-production or controlled low-value visit through active checkout and one completed-bill additional payment before general use.
