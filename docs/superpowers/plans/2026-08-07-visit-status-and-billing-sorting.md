# Visit Status and Billing Sorting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clearly identify queue and consultation statuses on visit records and allow users to sort visible Billing rows by Date, Subtotal, Paid, Outstanding, or Method.

**Architecture:** Keep status display local to `VisitDetail`. Extract Billing row ordering into a pure utility so numeric, date, and method behavior can be tested independently, then connect it to accessible buttons in the existing table header.

**Tech Stack:** React 18, TypeScript, Vitest, React Testing Library, Tailwind CSS, lucide-react.

## Global Constraints

- No database, RLS, or permission changes.
- Default Billing order remains Date descending.
- Sorting runs after the existing date-range and tab filters.
- Missing payment methods sort last in either direction.
- Only Date, Subtotal, Paid, Outstanding, and Method are sortable.

---

### Task 1: Explicit visit status labels

**Files:**
- Modify: `src/pages/clinic/VisitDetail.tsx`
- Create: `src/test/visit-detail-status-labels.test.tsx`

**Interfaces:**
- Consumes: `entry.clinic_status`, `consultation?.status`, and the existing `StatusBadge` component.
- Produces: labelled status groups with accessible text `Queue: <status>` and `Consultation: <status>`.

- [ ] **Step 1: Write the failing test**

Render a completed queue with an in-progress consultation and assert that the header exposes `Queue: Completed` and `Consultation: In progress` as separate text labels.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/test/visit-detail-status-labels.test.tsx`

Expected: FAIL because the current header renders two unlabelled `StatusBadge` values.

- [ ] **Step 3: Implement the minimal labelled display**

Wrap each existing status badge in a compact labelled group. Use visible text `Queue:` and `Consultation:` and retain `StatusBadge` for status colour and normalization. Omit the consultation group when there is no consultation status.

- [ ] **Step 4: Run the focused test**

Run: `npm test -- src/test/visit-detail-status-labels.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```text
git add src/pages/clinic/VisitDetail.tsx src/test/visit-detail-status-labels.test.tsx
git commit -m "Clarify visit status badges"
```

### Task 2: Pure Billing ledger sorting

**Files:**
- Create: `src/lib/clinic/billingLedgerSort.ts`
- Create: `src/test/billing-ledger-sort.test.ts`

**Interfaces:**
- Produces: `BillingSortKey = 'date' | 'subtotal' | 'paid' | 'outstanding' | 'method'`, `BillingSortDirection = 'asc' | 'desc'`, and `sortBillingEntries<T>(entries, key, direction)`.
- Consumes: entries containing `createdAt`, `subtotal`, `paid`, `outstanding`, and `latestMethod`.

- [ ] **Step 1: Write failing utility tests**

Cover Date descending, each numeric field in both directions, Method by displayed label, stable tie-breaking by newest date, non-mutation of the input array, and null Method values last for both directions.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/test/billing-ledger-sort.test.ts`

Expected: FAIL because `billingLedgerSort.ts` does not exist.

- [ ] **Step 3: Implement the pure sorting utility**

Copy the input before sorting. Compare dates by timestamp, numeric fields as numbers, and methods using `formatPaymentMethod`; keep null/blank values last before applying direction. Resolve equal values with Date descending and then queue-entry ID for deterministic output.

- [ ] **Step 4: Run the focused tests**

Run: `npm test -- src/test/billing-ledger-sort.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```text
git add src/lib/clinic/billingLedgerSort.ts src/test/billing-ledger-sort.test.ts
git commit -m "Add Billing ledger sorting"
```

### Task 3: Interactive sortable Billing headers

**Files:**
- Modify: `src/pages/clinic/Billings.tsx`
- Create: `src/test/billings-sort-headers.test.tsx`

**Interfaces:**
- Consumes: `BillingSortKey`, `BillingSortDirection`, and `sortBillingEntries` from `src/lib/clinic/billingLedgerSort.ts`.
- Produces: clickable sortable headers with `aria-sort`, visible direction arrows, and sorted visible rows.

- [ ] **Step 1: Write the failing interaction test**

Assert Date starts descending; clicking Subtotal sorts ascending and clicking it again sorts descending; active headers expose `aria-sort`; Date, Paid, Outstanding, and Method are buttons; Queue and Patient are plain headings.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/test/billings-sort-headers.test.tsx`

Expected: FAIL because current headers are static text.

- [ ] **Step 3: Add sorting state and header controls**

Initialize `{ key: 'date', direction: 'desc' }`. Clicking a new key selects ascending except Date, which selects descending; clicking the active key toggles direction. Apply `sortBillingEntries` to the already-filtered entries. Render `ArrowUp` or `ArrowDown` only on the active header and set `aria-sort` on sortable header cells.

- [ ] **Step 4: Run focused and regression tests**

Run: `npm test -- src/test/billings-sort-headers.test.tsx src/test/billing-ledger-sort.test.ts src/test/billing-ledger-pagination.test.ts src/test/billing-ledger-totals.test.ts src/test/visit-detail-status-labels.test.tsx`

Expected: all PASS.

- [ ] **Step 5: Run production verification**

Run: `npx tsc --noEmit` and `npm run build`.

Expected: both exit successfully.

- [ ] **Step 6: Commit and deploy**

Commit only the intentional UI and test files, push the feature branch, cherry-pick the verified commits onto `main`, push `main`, and wait for Security Gate and GitHub Pages deployment success.
