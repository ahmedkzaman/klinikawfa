# Split Patient Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow one clinic bill or panel co-payment to be recorded through multiple physical payment methods in one safe operation.

**Architecture:** Keep one `payments` row per physical payment portion and add shared allocation validation in TypeScript. Add idempotent, atomic PostgreSQL RPCs for active checkout and completed-visit collections, then make the existing dialog submit an allocation array. Billings, receipts, and Insight continue reading real payment rows; only the visit-level method summary needs to combine all active methods.

**Tech Stack:** React 18, TypeScript, TanStack Query, Supabase JS/PostgreSQL, Vitest, Testing Library, SQL migration contract tests.

## Global Constraints

- Supported physical methods are exactly `cash`, `qr_pay`, `card`, and `transfer`.
- Money comparisons use integer sen; persisted amounts remain two-decimal PostgreSQL `numeric` values.
- Active self-pay checkout must allocate exactly the current patient outstanding.
- Active panel checkout must allocate exactly the declared co-payment and never more than the bill total.
- Panel co-payment rows retain `payment_type = 'panel'`; their physical `payment_method` remains patient-paid in the shared dual-ledger calculation.
- Cash, QR Pay, Card, and Transfer must never increase panel receivable.
- Active checkout inserts all portions and completes the visit in one transaction, or performs no mutation.
- Completed visits may receive a partial batch up to current patient outstanding without changing visit status.
- Every batch uses an idempotency UUID so an ambiguous network retry cannot duplicate payments.
- Existing single-payment functions stay available for rollback compatibility.
- Existing billing permissions remain the authorization boundary.

---

## File Structure

- Create `src/lib/clinic/paymentAllocations.ts`: allocation types, sen conversion, validation, remainder calculation, and method summary.
- Create `src/test/payment-allocations.test.ts`: pure domain tests.
- Create `supabase/migrations/20260812174507_add_split_patient_payments.sql`: checkout batch table plus the two atomic RPCs.
- Create `src/test/split-payment-migration.test.ts`: migration contract and authorization assertions.
- Modify `supabase/tests/completed_bill_corrections.sql`: executable transaction, idempotency, panel, and completed-visit cases.
- Modify `src/integrations/supabase/types.ts`: generated-style RPC argument/return declarations.
- Modify `src/hooks/clinic/usePayments.ts`: split checkout and split additional-payment mutations.
- Create `src/test/use-split-payments.test.tsx`: hook payload and invalidation tests.
- Modify `src/components/clinic/visit/RecordPaymentDialog.tsx`: editable allocation rows and batch submission.
- Create `src/test/record-split-payment-dialog.test.tsx`: interaction and error-state tests.
- Modify `src/pages/clinic/Billings.tsx`: retain all physical methods per visit and render a combined label.
- Modify `src/lib/clinic/paymentMethod.ts`: deterministic multi-method display helper.
- Modify `src/components/clinic/billing/PrintReceiptDialog.tsx`: verify each portion is mapped from its own row.
- Modify `src/test/billing-payment-method-label.test.ts`: combined-label tests.
- Create `src/test/split-payment-reporting.test.tsx`: Billings and receipt regression tests.
- Modify `src/test/record-payment-checkout-contract.test.ts`: enforce batch RPC usage and prevent client-side status completion.

---

### Task 1: Payment Allocation Domain

**Files:**
- Create: `src/lib/clinic/paymentAllocations.ts`
- Create: `src/test/payment-allocations.test.ts`

**Interfaces:**
- Produces: `PatientPaymentAllocation`, `PaymentAllocationValidation`, `toSen`, `fromSen`, `validatePaymentAllocations`, `remainingAllocationAmount`, and `summarizePaymentMethods`.
- Consumes: `PAYMENT_METHOD_LABELS` from `src/lib/clinic/paymentMethod.ts`.

- [ ] **Step 1: Write failing domain tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  remainingAllocationAmount,
  summarizePaymentMethods,
  validatePaymentAllocations,
} from '@/lib/clinic/paymentAllocations';

describe('payment allocations', () => {
  it('calculates the exact remainder in sen', () => {
    expect(remainingAllocationAmount(100, [{ method: 'cash', amount: 40 }])).toBe(60);
  });

  it('accepts Cash RM40 plus QR Pay RM60 for RM100', () => {
    expect(validatePaymentAllocations({
      allocations: [
        { method: 'cash', amount: 40 },
        { method: 'qr_pay', amount: 60 },
      ],
      expectedAmount: 100,
      requireExact: true,
    })).toEqual({ valid: true, total: 100, remaining: 0, errors: [] });
  });

  it('rejects duplicate methods and under-allocation', () => {
    const result = validatePaymentAllocations({
      allocations: [
        { method: 'cash', amount: 40 },
        { method: 'cash', amount: 20 },
      ],
      expectedAmount: 100,
      requireExact: true,
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Each payment method can only be used once.');
    expect(result.errors).toContain('Allocate the remaining RM40.00.');
  });

  it('uses canonical display order', () => {
    expect(summarizePaymentMethods(['qr_pay', 'cash', 'qr_pay'])).toBe('Cash + QR Pay');
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- src/test/payment-allocations.test.ts`

Expected: FAIL because `@/lib/clinic/paymentAllocations` does not exist.

- [ ] **Step 3: Implement the allocation domain**

```ts
import { PAYMENT_METHOD_LABELS } from '@/lib/clinic/paymentMethod';

export const PHYSICAL_PAYMENT_METHODS = ['cash', 'qr_pay', 'card', 'transfer'] as const;
export type PhysicalPaymentMethod = typeof PHYSICAL_PAYMENT_METHODS[number];

export interface PatientPaymentAllocation {
  method: PhysicalPaymentMethod | '';
  amount: number;
  notes?: string | null;
}

export interface PaymentAllocationValidation {
  valid: boolean;
  total: number;
  remaining: number;
  errors: string[];
}

export const toSen = (amount: number) => Math.round(amount * 100);
export const fromSen = (sen: number) => sen / 100;

export function remainingAllocationAmount(
  expectedAmount: number,
  allocations: PatientPaymentAllocation[],
) {
  return fromSen(Math.max(0, toSen(expectedAmount) - allocations.reduce(
    (sum, allocation) => sum + toSen(Number(allocation.amount) || 0), 0,
  )));
}

export function validatePaymentAllocations({ allocations, expectedAmount, requireExact }: {
  allocations: PatientPaymentAllocation[];
  expectedAmount: number;
  requireExact: boolean;
}): PaymentAllocationValidation {
  const errors: string[] = [];
  const expectedSen = toSen(expectedAmount);
  const totalSen = allocations.reduce((sum, row) => sum + toSen(Number(row.amount) || 0), 0);
  const methods = allocations.map((row) => row.method).filter(Boolean);
  if (!allocations.length && expectedSen > 0) errors.push('Add at least one payment method.');
  if (allocations.some((row) => !PHYSICAL_PAYMENT_METHODS.includes(row.method as PhysicalPaymentMethod))) errors.push('Select a payment method for every amount.');
  if (allocations.some((row) => toSen(row.amount) <= 0)) errors.push('Every payment amount must be greater than RM0.00.');
  if (new Set(methods).size !== methods.length) errors.push('Each payment method can only be used once.');
  if (totalSen > expectedSen) errors.push(`Allocated amount exceeds the balance by RM${fromSen(totalSen - expectedSen).toFixed(2)}.`);
  if (requireExact && totalSen < expectedSen) errors.push(`Allocate the remaining RM${fromSen(expectedSen - totalSen).toFixed(2)}.`);
  return {
    valid: errors.length === 0,
    total: fromSen(totalSen),
    remaining: fromSen(Math.max(0, expectedSen - totalSen)),
    errors,
  };
}

export function summarizePaymentMethods(methods: Array<string | null | undefined>) {
  const present = new Set(methods.filter((method): method is PhysicalPaymentMethod =>
    PHYSICAL_PAYMENT_METHODS.includes(method as PhysicalPaymentMethod),
  ));
  return PHYSICAL_PAYMENT_METHODS.filter((method) => present.has(method))
    .map((method) => PAYMENT_METHOD_LABELS[method])
    .join(' + ');
}
```

- [ ] **Step 4: Run domain tests**

Run: `npm test -- src/test/payment-allocations.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/clinic/paymentAllocations.ts src/test/payment-allocations.test.ts
git commit -m "feat: add split payment allocation domain"
```

---

### Task 2: Atomic and Idempotent Database RPCs

**Files:**
- Create: `supabase/migrations/20260812174507_add_split_patient_payments.sql`
- Create: `src/test/split-payment-migration.test.ts`
- Modify: `supabase/tests/completed_bill_corrections.sql`

**Interfaces:**
- Produces: `public.record_split_payments_and_complete_visit(uuid,uuid,text,numeric,jsonb,uuid,text,uuid)` and `public.record_split_payments(uuid,uuid,text,jsonb,text,uuid)`.
- Produces: `public.payment_batches` with unique `(queue_entry_id, idempotency_key)`.
- Consumes: `public.can_checkout_visit(auth.uid())`, `public.lock_completed_bill_item_mutation_boundary()`, `payments`, `queue_entries`, and `consultations`.

- [ ] **Step 1: Write a failing migration contract test**

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(resolve(
  process.cwd(),
  'supabase/migrations/20260812174507_add_split_patient_payments.sql',
), 'utf8');

describe('split payment migration', () => {
  it('defines both authenticated security-definer RPCs', () => {
    expect(sql).toMatch(/create or replace function public\.record_split_payments_and_complete_visit/i);
    expect(sql).toMatch(/create or replace function public\.record_split_payments\(/i);
    expect(sql).toMatch(/can_checkout_visit\(auth\.uid\(\)\)/i);
    expect(sql).toMatch(/revoke all[\s\S]*from public[\s\S]*from anon/i);
    expect(sql).toMatch(/grant execute[\s\S]*to authenticated/i);
  });

  it('locks, validates, batches, and completes after inserts', () => {
    expect(sql).toMatch(/for update/i);
    expect(sql).toMatch(/jsonb_array_elements/i);
    expect(sql).toMatch(/idempotency_key/i);
    expect(sql).toMatch(/unique \(queue_entry_id, idempotency_key\)/i);
    expect(sql.indexOf('INSERT INTO public.payments')).toBeLessThan(sql.indexOf("SET clinic_status = 'completed'"));
  });
});
```

- [ ] **Step 2: Run the contract test and verify it fails**

Run: `npm test -- src/test/split-payment-migration.test.ts`

Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Create the batch table and shared validation rules**

The migration must create this durable idempotency boundary:

```sql
CREATE TABLE public.payment_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_entry_id uuid NOT NULL REFERENCES public.queue_entries(id),
  idempotency_key uuid NOT NULL,
  actor_id uuid NOT NULL DEFAULT auth.uid(),
  payment_type text NOT NULL CHECK (payment_type IN ('self_pay', 'panel')),
  expected_patient_amount numeric(12,2) NOT NULL CHECK (expected_patient_amount >= 0),
  completes_visit boolean NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (queue_entry_id, idempotency_key)
);
ALTER TABLE public.payment_batches ENABLE ROW LEVEL SECURITY;
```

Do not add general table policies; callers access batches only through the security-definer RPCs. In both RPCs:

```sql
IF NOT public.can_checkout_visit(auth.uid()) THEN
  RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
END IF;
IF jsonb_typeof(p_payments) <> 'array'
   OR jsonb_array_length(p_payments) > 4
   OR (jsonb_array_length(p_payments) = 0 AND round(p_expected_patient_amount, 2) <> 0) THEN
  RAISE EXCEPTION 'INVALID_PAYMENT_ALLOCATIONS' USING ERRCODE = '22023';
END IF;
```

Parse each allocation with `jsonb_to_recordset`, trim the method, round the amount to two decimals, reject non-physical methods, non-positive amounts, duplicate methods, and totals that do not match `p_expected_patient_amount` for checkout or exceed it for completed collections.

- [ ] **Step 4: Implement active checkout RPC**

Use this exact signature:

```sql
CREATE OR REPLACE FUNCTION public.record_split_payments_and_complete_visit(
  p_queue_entry_id uuid,
  p_consultation_id uuid,
  p_payment_type text,
  p_expected_patient_amount numeric,
  p_payments jsonb,
  p_provider_id uuid,
  p_notes text,
  p_idempotency_key uuid
) RETURNS jsonb
```

Within one transaction: acquire the batch row, return its stored result on a retry, lock the queue entry/consultation/current payments, validate panel ID against `queue_entries.panel_id`, insert one `payments` row per allocation, store the inserted IDs in the batch result, then mark consultation and queue completed. For a zero-payment panel-only or no-charge checkout, accept `p_payments = '[]'` only when `p_expected_patient_amount = 0`; record the legacy-compatible zero row using the current panel label so receipts and claim attribution remain stable.

- [ ] **Step 5: Implement completed-visit batch RPC**

Use this exact signature:

```sql
CREATE OR REPLACE FUNCTION public.record_split_payments(
  p_queue_entry_id uuid,
  p_consultation_id uuid,
  p_payment_type text,
  p_payments jsonb,
  p_notes text,
  p_idempotency_key uuid
) RETURNS jsonb
```

Require `queue_entries.clinic_status = 'completed'`, calculate the current patient outstanding with the same active consultation-item and non-panel-payment rules used by `calculateDualLedger`, reject a batch total greater than that amount, and do not update queue or consultation status.

- [ ] **Step 6: Restrict and grant function execution**

```sql
ALTER FUNCTION public.record_split_payments_and_complete_visit(uuid,uuid,text,numeric,jsonb,uuid,text,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.record_split_payments_and_complete_visit(uuid,uuid,text,numeric,jsonb,uuid,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_split_payments_and_complete_visit(uuid,uuid,text,numeric,jsonb,uuid,text,uuid) TO authenticated;

ALTER FUNCTION public.record_split_payments(uuid,uuid,text,jsonb,text,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.record_split_payments(uuid,uuid,text,jsonb,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_split_payments(uuid,uuid,text,jsonb,text,uuid) TO authenticated;
```

- [ ] **Step 7: Add executable SQL regression cases**

Extend `supabase/tests/completed_bill_corrections.sql` to assert:

```sql
-- Cash 40 + QR 60 creates two rows and completes exactly once.
-- Reusing the same idempotency UUID returns the original result and leaves count = 2.
-- Duplicate methods, total 99.99, total 100.01, negative amount, and unsupported method all raise 22023.
-- A panel visit with Cash 20 + Card 10 keeps payment_type='panel', physical methods, and panel claim balance separate.
-- A completed visit can collect Cash 25 + QR 25 against RM80 outstanding without changing status.
-- A forced invalid second row leaves zero inserted payment rows and the visit uncompleted.
```

- [ ] **Step 8: Run migration tests**

Run: `npm test -- src/test/split-payment-migration.test.ts src/test/billing-permission-checkout-policy.test.ts src/test/completed-bill-correction-migration.test.ts`

Expected: PASS.

Run: `npx.cmd supabase test db supabase/tests/completed_bill_corrections.sql`

Expected: every pgTAP assertion passes and the command exits with code 0.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/20260812174507_add_split_patient_payments.sql src/test/split-payment-migration.test.ts supabase/tests/completed_bill_corrections.sql
git commit -m "feat: add atomic split payment RPCs"
```

---

### Task 3: Typed Query Mutations

**Files:**
- Modify: `src/integrations/supabase/types.ts`
- Modify: `src/hooks/clinic/usePayments.ts`
- Create: `src/test/use-split-payments.test.tsx`

**Interfaces:**
- Consumes: `PatientPaymentAllocation` from Task 1 and both RPC signatures from Task 2.
- Produces: `useRecordSplitPaymentsAndCompleteVisit()` and `useRecordSplitPayments()`.

- [ ] **Step 1: Write failing hook tests**

Mock `supabase.rpc`, invoke each mutation, and assert these payload keys and values:

```ts
expect(rpc).toHaveBeenCalledWith('record_split_payments_and_complete_visit', {
  p_queue_entry_id: 'queue-1',
  p_consultation_id: 'consultation-1',
  p_payment_type: 'self_pay',
  p_expected_patient_amount: 100,
  p_payments: [
    { payment_method: 'cash', amount: 40 },
    { payment_method: 'qr_pay', amount: 60 },
  ],
  p_provider_id: null,
  p_notes: null,
  p_idempotency_key: expect.any(String),
});
```

Also assert successful mutations invalidate `['payments', queueId]`, `['payments_ledger']`, `['consultation']`, and `['clinic']`.

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- src/test/use-split-payments.test.tsx`

Expected: FAIL because the hooks do not exist.

- [ ] **Step 3: Add Supabase RPC declarations**

Add both functions under `Database.public.Functions` with the exact argument names from Task 2 and `Returns: Json`.

- [ ] **Step 4: Implement both mutations**

Use one input model:

```ts
interface SplitPaymentInput {
  queue_entry_id: string;
  consultation_id: string | null;
  payment_type: 'self_pay' | 'panel';
  expected_patient_amount: number;
  payments: PatientPaymentAllocation[];
  provider_id?: string | null;
  notes?: string | null;
  idempotency_key: string;
}
```

Map client rows to `{ payment_method, amount }`; never submit display labels. Keep the existing single-payment hooks unchanged for rollback compatibility.

- [ ] **Step 5: Run hook tests**

Run: `npm test -- src/test/use-split-payments.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/integrations/supabase/types.ts src/hooks/clinic/usePayments.ts src/test/use-split-payments.test.tsx
git commit -m "feat: add split payment mutations"
```

---

### Task 4: Split Payment Dialog

**Files:**
- Modify: `src/components/clinic/visit/RecordPaymentDialog.tsx`
- Create: `src/test/record-split-payment-dialog.test.tsx`
- Modify: `src/test/record-payment-checkout-contract.test.ts`

**Interfaces:**
- Consumes: allocation helpers from Task 1 and mutations from Task 3.
- Produces: the existing `RecordPaymentDialog` props/API, so callers require no changes.

- [ ] **Step 1: Write failing interaction tests**

Render the dialog with `defaultAmount={100}` and assert:

```ts
expect(screen.getByDisplayValue('100.00')).toBeInTheDocument();
await user.clear(screen.getByLabelText('Amount (RM)'));
await user.type(screen.getByLabelText('Amount (RM)'), '40');
await user.click(screen.getByRole('button', { name: 'Add payment method' }));
expect(screen.getByDisplayValue('60.00')).toBeInTheDocument();
expect(screen.getByText('Allocated RM100.00 / Remaining RM0.00')).toBeInTheDocument();
```

Cover duplicate method rejection, under/over allocation, row removal, panel label **Co-payment methods**, exact panel co-payment total, retry preserving rows after an RPC rejection, and zero-payment panel checkout.

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- src/test/record-split-payment-dialog.test.tsx`

Expected: FAIL because allocation rows do not exist.

- [ ] **Step 3: Replace single method/amount state with allocation rows**

```ts
interface EditableAllocation {
  id: string;
  method: PhysicalPaymentMethod | '';
  amount: string;
}

const [allocations, setAllocations] = useState<EditableAllocation[]>([]);
const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
```

On every dialog open, create one row using `defaultPaymentMethod ?? 'cash'`, reset the token, and set the amount to `defaultAmount` for self-pay or `0.00` for panel. When switching payment type, reset allocations and token so stale values cannot cross ledgers.

- [ ] **Step 4: Render editable rows**

Each row contains an accessible method selector and amount input. Disable already-used methods in other selectors. Show **Remove** only when more than one row exists. **Add payment method** appends the exact remaining amount and is disabled at four methods or RM0 remaining.

- [ ] **Step 5: Submit through batch mutations**

For active visits call `useRecordSplitPaymentsAndCompleteVisit`; for completed visits call `useRecordSplitPayments`. Submit canonical methods, two-decimal amounts, selected provider ID, notes, expected patient amount, and the stable idempotency token. Rotate the token only after success. Keep the dialog open and preserve all rows on failure.

- [ ] **Step 6: Update contract assertions**

Require `record_split_payments_and_complete_visit` in the hook source and continue asserting that no client code directly sets consultation/queue completion statuses.

- [ ] **Step 7: Run dialog and checkout tests**

Run: `npm test -- src/test/record-split-payment-dialog.test.tsx src/test/record-payment-checkout-contract.test.ts src/test/billing-details-financial-state.test.tsx`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/clinic/visit/RecordPaymentDialog.tsx src/test/record-split-payment-dialog.test.tsx src/test/record-payment-checkout-contract.test.ts
git commit -m "feat: support split methods in payment dialog"
```

---

### Task 5: Billings, Receipt, and Reporting Presentation

**Files:**
- Modify: `src/lib/clinic/paymentMethod.ts`
- Modify: `src/pages/clinic/Billings.tsx`
- Modify: `src/components/clinic/billing/PrintReceiptDialog.tsx`
- Modify: `src/test/billing-payment-method-label.test.ts`
- Create: `src/test/split-payment-reporting.test.tsx`

**Interfaces:**
- Consumes: `summarizePaymentMethods` from Task 1 and existing `calculateDualLedger`.
- Produces: visit method labels such as `Cash + QR Pay`; panel labels remain `Panel: AIA + Copay`.

- [ ] **Step 1: Write failing presentation tests**

Add assertions that a self-pay visit with Cash RM40 and QR RM60 renders `Cash + QR Pay`, while a panel visit with the same physical rows and an AIA provider renders `Panel: AIA + Copay`. Assert receipt data includes two portions with amounts 40 and 60 rather than repeating the clicked payment method for every row.

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- src/test/billing-payment-method-label.test.ts src/test/split-payment-reporting.test.tsx`

Expected: FAIL because Billings stores only `latestMethod`, and receipt mapping currently references the outer `pay.payment_method` for every queue payment.

- [ ] **Step 3: Accumulate methods per Billings visit**

Extend `LedgerEntry` with `patientPaymentMethods: string[]`. While grouping ledger rows, append every non-panel `p.payment_method`; derive the self-pay label with `summarizePaymentMethods`. Continue passing `patientPaid`, `expectsPanel`, and provider name to `formatBillingPaymentMethod`, adding an optional `patientMethods` parameter so panel high-level labels remain unchanged.

- [ ] **Step 4: Correct receipt per-row attribution**

Replace outer-row references inside queue-payment reducers/maps:

```ts
const panelPayments = (queuePayments ?? []).reduce(
  (sum, payment) => sum + (payment.payment_method === 'panel' ? Number(payment.amount ?? 0) : 0),
  0,
);

patientPayments: (queuePayments ?? []).map((payment) => ({
  amount: Number(payment.amount ?? 0),
  paymentMethod: payment.payment_method,
})),
```

Keep each receipt payment row separate; do not create a synthetic `split` payment method.

- [ ] **Step 5: Run reporting tests**

Run: `npm test -- src/test/billing-payment-method-label.test.ts src/test/split-payment-reporting.test.tsx src/test/sales-insights.test.ts src/test/completed-bill-financial-reporting.test.ts`

Expected: PASS, with Insight totals allocating RM40 to Cash and RM60 to QR Pay.

- [ ] **Step 6: Commit**

```bash
git add src/lib/clinic/paymentMethod.ts src/pages/clinic/Billings.tsx src/components/clinic/billing/PrintReceiptDialog.tsx src/test/billing-payment-method-label.test.ts src/test/split-payment-reporting.test.tsx
git commit -m "fix: report split payment methods accurately"
```

---

### Task 6: Regression Verification and Deployment Readiness

**Files:**
- Modify only files needed to fix failures directly caused by Tasks 1-5.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: a deployable migration-first release.

- [ ] **Step 1: Run focused billing regression suite**

```bash
npm test -- \
  src/test/payment-allocations.test.ts \
  src/test/split-payment-migration.test.ts \
  src/test/use-split-payments.test.tsx \
  src/test/record-split-payment-dialog.test.tsx \
  src/test/record-payment-checkout-contract.test.ts \
  src/test/billing-payment-method-label.test.ts \
  src/test/split-payment-reporting.test.tsx \
  src/test/billing-details-financial-state.test.tsx \
  src/test/completed-bill-financial-reporting.test.ts \
  src/test/panel-claim-patient-payment-allocation-migration.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run changed-file lint and production build**

Run: `npm run lint:changed`

Expected: PASS with no new errors.

Run: `npm run build`

Expected: PASS and generate the production bundle.

- [ ] **Step 3: Run repository diff checks**

Run: `git diff --check`

Expected: no output.

Run: `git status --short`

Expected: only intentional split-payment files are modified; preserve unrelated `.superpowers/brainstorm/`, `deno.lock`, and `supabase/.temp/` files without adding them.

- [ ] **Step 4: Apply migration before frontend deployment**

Run: `npx.cmd supabase link --project-ref nhjbqdiyptjqherdfbqk`

Run: `npx.cmd supabase db push --linked`

Confirm the output lists `20260812174507_add_split_patient_payments.sql` as applied. Then run `git push origin HEAD:main`. Do not push frontend code that calls the new RPC before the migration succeeds.

- [ ] **Step 5: Perform controlled production smoke tests**

Use a controlled bill and verify:

1. Self-pay RM100: Cash RM40 + QR Pay RM60 completes once.
2. Billings shows paid RM100, outstanding RM0, method `Cash + QR Pay`.
3. Receipt shows two payment lines and total RM100.
4. Panel co-pay: physical portions reduce patient outstanding only; panel receivable is unchanged except by panel claim activity.
5. Retrying the same request does not create duplicate rows.
6. Voiding one physical portion reopens only that portion as patient outstanding.

- [ ] **Step 6: Handle any verification failure at its owning task**

If a focused test, lint, build, or smoke test fails, return to the task that owns the failing file, add a failing regression test there, implement the minimum correction, rerun that task's commands, and amend that task's commit. When no failures remain, do not create a verification-only commit.
