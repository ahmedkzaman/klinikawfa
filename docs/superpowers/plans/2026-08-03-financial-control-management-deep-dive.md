# Financial Control Management Deep Dive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Financial Control deep dive to the existing clinic Insight page with canonical billed, collected, COGS, profit, outstanding, reconciliation, alert, drill-down, grouping, and export reporting.

**Architecture:** PostgreSQL owns all financial definitions through a private visit-facts boundary and two permission-checked public RPCs. React Query adapters expose typed summary and paginated detail contracts; focused Insight components render independent report sections and reuse the existing date range and access control.

**Tech Stack:** PostgreSQL 16+, Supabase Auth/RPC, TypeScript 5.8, React 18, TanStack Query 5, Vitest 3, Testing Library, Recharts, shadcn/ui, date-fns.

## Global Constraints

- Extend `/clinic/insight`; do not create a second management application.
- The first release contains the shared Management shell and Financial Control only.
- Billed revenue and collected cash are always separate metrics.
- All reporting date boundaries use `Asia/Kuala_Lumpur`.
- Existing `can_view_insights(auth.uid())` access remains authoritative.
- Summary values, detail rows, and CSV exports use the same database contract.
- Medicine COGS uses dispensing-time unit cost multiplied by quantity actually dispensed.
- Missing costs remain visible as exceptions and are never replaced with invented costs.
- Financial drill-downs do not expose unrelated clinical notes.
- Date ranges longer than one year are rejected.
- Monetary reconciliation tolerance is RM0.01.
- The initial large-discount alert threshold is either RM50.00 or 10% of the
  pre-discount subtotal, whichever condition is met first.
- An unsubmitted panel claim alerts after two elapsed Monday-Friday dates following
  claim creation; public holidays are not excluded in the first release.
- A probable duplicate payment is an active payment with the same queue entry,
  amount, payment type, and payment method created within five minutes of another
  active payment.
- An excess payment is active paid value greater than the latest valid bill total by
  more than RM0.01.
- A zero-price alert excludes package components intentionally represented by a
  zero-price child line when the active parent package carries the charge.
- No new runtime dependency is required.

---

## File Structure

- `supabase/migrations/20260803100000_add_financial_control_reports.sql`: private canonical facts, summary RPC, paginated details RPC, grants, indexes, and postflight assertions.
- `src/integrations/supabase/types.ts`: generated-style declarations for the two RPCs.
- `src/lib/clinic/financialControl.ts`: report types, enum guards, date/comparison helpers, and CSV serialization.
- `src/hooks/clinic/useFinancialControl.ts`: typed React Query calls for summary and detail reports.
- `src/components/clinic/insight/management/ManagementTab.tsx`: Management navigation boundary; only Financial Control is rendered in this release.
- `src/components/clinic/insight/management/FinancialControlTab.tsx`: coordinates independent summary, reconciliation, alerts, margin, and detail state.
- `src/components/clinic/insight/management/FinancialSummaryStrip.tsx`: compact KPI strip with comparison values.
- `src/components/clinic/insight/management/FinancialReconciliation.tsx`: billed-versus-collected movements.
- `src/components/clinic/insight/management/FinancialAlertsTable.tsx`: urgency-ordered actionable exceptions.
- `src/components/clinic/insight/management/FinancialMarginTable.tsx`: server-grouped margin analysis.
- `src/components/clinic/insight/management/FinancialDetailSheet.tsx`: paginated visit/bill drill-down and navigation.
- `src/pages/clinic/Insight.tsx`: adds the Management tab and passes the existing range.
- `src/test/financial-control-report-migration.test.ts`: executable PostgreSQL metric, access, reconciliation, and pagination contract.
- `src/test/financial-control-lib.test.ts`: date, validation, formatting, and CSV contract.
- `src/test/use-financial-control.test.tsx`: RPC payload and React Query behavior.
- `src/test/financial-control-components.test.tsx`: UI, independent error, alert, pagination, and navigation behavior.
- `src/test/insight-management-tab.test.tsx`: existing Insight integration and date-range propagation.

---

### Task 1: Canonical Financial Visit Facts

**Files:**
- Create: `supabase/migrations/20260803100000_add_financial_control_reports.sql`
- Create: `src/test/financial-control-report-migration.test.ts`

**Interfaces:**
- Consumes: `consultations`, `consultation_items`, `queue_entries`, `payments`, `panel_claims`, `completed_bill_correction_audit` through the existing correction-state boundary, `patients`, `doctors`, `insurance_providers`, and `public.can_view_insights(uuid)`.
- Produces: private SQL function `private.financial_control_visit_facts(date,date,date)` used only by public report RPCs.

- [ ] **Step 1: Write the failing migration contract test**

Create a disposable PostgreSQL test that reads the migration, provisions the minimum source schema, applies the migration, and asserts:

```ts
expect(sql).toMatch(/create or replace function private\.financial_control_visit_facts/i);
expect(sql).toMatch(/timezone\('Asia\/Kuala_Lumpur'/i);
expect(sql).toMatch(/can_view_insights\(auth\.uid\(\)\)/i);
expect(sql).toMatch(/revoke all .* from public, anon/i);
```

Seed visits for a fully paid bill, partial self-pay bill, payment against an older bill, partially received panel claim, discount, tax, refund/correction, zero-cost medicine, partially dispensed medicine, and package.

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
$env:REQUIRE_POSTGRES_TEST='1'
npm.cmd test -- src/test/financial-control-report-migration.test.ts
```

Expected: FAIL because the migration and private fact function do not exist.

- [ ] **Step 3: Implement the private fact boundary**

Create schema `private` if needed and define a stable result with one row per completed visit:

```sql
CREATE OR REPLACE FUNCTION private.financial_control_visit_facts(
  _start_date date,
  _end_date date,
  _as_of_date date
)
RETURNS TABLE (
  queue_entry_id uuid,
  consultation_id uuid,
  completed_date date,
  patient_id uuid,
  patient_name text,
  doctor_id uuid,
  doctor_name text,
  payment_type text,
  payment_method text,
  panel_provider_id uuid,
  panel_provider_name text,
  billed numeric,
  paid_to_date numeric,
  paid_in_period numeric,
  older_debt_collected_in_period numeric,
  cogs numeric,
  discount numeric,
  tax numeric,
  refund numeric,
  outstanding numeric,
  panel_outstanding numeric,
  missing_cost_count integer,
  zero_price_count integer,
  correction_count integer
)
```

Use active completed consultations and non-deleted source rows. Cost medication by
`unit_cost * COALESCE(dispensed_qty, quantity)`, never above ordered quantity and
never below zero. Preserve non-medication configured cost snapshots. Allocate valid
payments by `queue_entry_id` or `consultation_id`; classify payments whose related
bill completed before `_start_date` as older-debt collections. Use latest active
panel claim state and completed-bill correction state.

Reject null, reversed, future `_as_of_date < _end_date`, and ranges over 366 calendar
days with SQLSTATE `22023`.

- [ ] **Step 4: Harden the private boundary**

Set owner to `postgres`, set `search_path = pg_catalog, public, private`, and:

```sql
REVOKE ALL ON FUNCTION private.financial_control_visit_facts(date,date,date)
  FROM PUBLIC, anon, authenticated;
```

Add only indexes proven necessary by `EXPLAIN (ANALYZE, BUFFERS)` for completed-date,
active payments, and active claim lookup. Do not duplicate an existing equivalent
index.

- [ ] **Step 5: Run the executable PostgreSQL test**

Expected: seeded fact rows reconcile billed, paid, COGS, discount, tax, refund,
outstanding, panel outstanding, and exception counts exactly.

- [ ] **Step 6: Commit**

```powershell
git add supabase/migrations/20260803100000_add_financial_control_reports.sql src/test/financial-control-report-migration.test.ts
git commit -m "feat: add canonical financial control facts"
```

---

### Task 2: Summary, Alerts, Grouping, And Paginated Detail RPCs

**Files:**
- Modify: `supabase/migrations/20260803100000_add_financial_control_reports.sql`
- Modify: `src/test/financial-control-report-migration.test.ts`

**Interfaces:**
- Consumes: `private.financial_control_visit_facts(date,date,date)`.
- Produces:
  - `public.get_financial_control_summary(date,date,date,date,date) returns jsonb`
  - `public.get_financial_control_details(date,date,date,text,text,text,integer,integer) returns jsonb`

- [ ] **Step 1: Extend tests for public report contracts**

Assert the summary contains:

```json
{
  "period": {},
  "comparison": {},
  "reconciliation": {},
  "alerts": [],
  "generated_at": ""
}
```

Each period includes `billedRevenue`, `cashCollected`, `cohortCollected`,
`olderDebtCollected`, `collectionRate`, `cogs`, `grossProfit`,
`grossMarginPct`, `cohortOutstanding`, `totalOutstanding`,
`averageBill`, and `completedVisits`.

Assert detail results return:

```ts
{
  rows: Array<FinancialControlDetailRow>,
  total: number,
  page: number,
  pageSize: number,
  totals: { billed: number; paid: number; outstanding: number; cogs: number; profit: number }
}
```

- [ ] **Step 2: Run tests and verify RED**

Expected: FAIL because public RPCs are absent.

- [ ] **Step 3: Implement `get_financial_control_summary`**

Use `SECURITY DEFINER` only because the canonical sources cross RLS boundaries.
Begin with:

```sql
IF auth.uid() IS NULL OR NOT public.can_view_insights(auth.uid()) THEN
  RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
END IF;
```

Call the private facts once for the selected period and once for the comparison.
Compute the reconciliation movements and urgency-ordered alert counts. Return numeric
JSON values rounded to two decimals and percentages rounded to one decimal.
Apply the Global Constraints thresholds literally so alert counts and detail rows use
the same predicates.

- [ ] **Step 4: Implement `get_financial_control_details`**

Allow only these exact values:

```sql
_metric IN (
  'billed_revenue', 'cash_collected', 'cohort_outstanding',
  'total_outstanding', 'cogs', 'gross_profit', 'adjustments', 'alerts', 'margin'
)
_group_by IN ('visit', 'medicine', 'procedure', 'package', 'doctor', 'payment_type', 'panel_provider')
_alert_key IN (
  'unpaid_self_pay', 'unsubmitted_panel', 'overdue_panel', 'missing_cost',
  'zero_price', 'negative_margin', 'large_discount', 'refund_void_correction',
  'payment_mismatch', 'duplicate_or_excess_payment'
)
```

Permit null `_alert_key`, require `1 <= _page`, and require
`1 <= _page_size <= 100`. Use deterministic ordering by amount descending,
completed date descending, then queue entry UUID.

- [ ] **Step 5: Harden grants and add migration postflight**

```sql
REVOKE ALL ON FUNCTION public.get_financial_control_summary(date,date,date,date,date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_financial_control_summary(date,date,date,date,date)
  TO authenticated;
REVOKE ALL ON FUNCTION public.get_financial_control_details(date,date,date,text,text,text,integer,integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_financial_control_details(date,date,date,text,text,text,integer,integer)
  TO authenticated;
```

Postflight asserts both RPC signatures, authenticated-only grants, private function
inaccessibility, and `can_view_insights` enforcement.

- [ ] **Step 6: Verify access, reconciliation, alert, grouping, and pagination tests**

Expected: PASS for authorized fixtures; unauthorized, locum-without-Insight, invalid
enum, invalid page, and invalid date requests fail closed.

- [ ] **Step 7: Commit**

```powershell
git add supabase/migrations/20260803100000_add_financial_control_reports.sql src/test/financial-control-report-migration.test.ts
git commit -m "feat: add financial control reporting RPCs"
```

---

### Task 3: Typed Client Contract

**Files:**
- Create: `src/lib/clinic/financialControl.ts`
- Create: `src/hooks/clinic/useFinancialControl.ts`
- Modify: `src/integrations/supabase/types.ts`
- Create: `src/test/financial-control-lib.test.ts`
- Create: `src/test/use-financial-control.test.tsx`

**Interfaces:**
- Consumes: the two RPCs from Task 2 and `getLocalDateRangeBounds` conventions.
- Produces:
  - `useFinancialControlSummary(range: DateRange)`
  - `useFinancialControlDetails(filters: FinancialControlDetailFilters)`
  - `financialControlRowsToCsv(rows)`

- [ ] **Step 1: Write failing type and hook tests**

Test that a 1-7 August range sends:

```ts
{
  _start_date: '2026-08-01',
  _end_date: '2026-08-07',
  _comparison_start: '2026-07-25',
  _comparison_end: '2026-07-31',
  _as_of_date: '2026-08-07'
}
```

Test complete query keys, disabled queries without both dates, RPC errors, detail
pagination, enum rejection, and RFC-4180-safe CSV output.

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
npm.cmd test -- src/test/financial-control-lib.test.ts src/test/use-financial-control.test.tsx
```

- [ ] **Step 3: Define exact client types**

```ts
export type FinancialControlMetric =
  | 'billed_revenue' | 'cash_collected' | 'cohort_outstanding'
  | 'total_outstanding' | 'cogs' | 'gross_profit'
  | 'adjustments' | 'alerts' | 'margin';

export type FinancialControlGroupBy =
  | 'visit' | 'medicine' | 'procedure' | 'package'
  | 'doctor' | 'payment_type' | 'panel_provider';

export interface FinancialControlDetailFilters {
  startDate: Date;
  endDate: Date;
  metric: FinancialControlMetric;
  groupBy: FinancialControlGroupBy;
  alertKey: FinancialControlAlertKey | null;
  page: number;
  pageSize: number;
}
```

Define every summary, alert, reconciliation, group, and detail property returned by
Task 2. Parse RPC JSON through explicit structural guards; throw
`Invalid financial control response` for malformed shapes.

- [ ] **Step 4: Implement hooks and CSV serialization**

Use query keys rooted at `['financial-control']`. Keep summary and details separate
so a detail failure cannot invalidate the summary. CSV headers must match visible
detail columns and format monetary values to two decimal places without local currency
symbols.

- [ ] **Step 5: Run tests, typecheck, and commit**

```powershell
npm.cmd test -- src/test/financial-control-lib.test.ts src/test/use-financial-control.test.tsx
npx.cmd tsc --noEmit
git add src/lib/clinic/financialControl.ts src/hooks/clinic/useFinancialControl.ts src/integrations/supabase/types.ts src/test/financial-control-lib.test.ts src/test/use-financial-control.test.tsx
git commit -m "feat: add typed financial control client"
```

---

### Task 4: Management Shell, Summary, And Reconciliation

**Files:**
- Create: `src/components/clinic/insight/management/ManagementTab.tsx`
- Create: `src/components/clinic/insight/management/FinancialControlTab.tsx`
- Create: `src/components/clinic/insight/management/FinancialSummaryStrip.tsx`
- Create: `src/components/clinic/insight/management/FinancialReconciliation.tsx`
- Modify: `src/pages/clinic/Insight.tsx`
- Create: `src/test/insight-management-tab.test.tsx`
- Create: `src/test/financial-control-components.test.tsx`

**Interfaces:**
- Consumes: `useFinancialControlSummary`, existing Insight `startDate` and `endDate`.
- Produces: visible `Management > Financial Control` experience and metric-click selection.

- [ ] **Step 1: Write failing rendered tests**

Assert:

- Existing tabs remain present.
- Management receives the exact selected range.
- No later-phase placeholder tabs are rendered.
- Billed Revenue and Cash Collected are distinct.
- Comparison labels use the preceding equal period.
- Loading, empty, and summary-only error states do not blank the Insight page.
- Clicking a KPI emits its exact `FinancialControlMetric`.

- [ ] **Step 2: Run tests and verify RED**

```powershell
npm.cmd test -- src/test/insight-management-tab.test.tsx src/test/financial-control-components.test.tsx
```

- [ ] **Step 3: Add the Management tab**

Pass dates explicitly:

```tsx
<TabsContent value="management" className="mt-0">
  <ManagementTab startDate={startDate} endDate={endDate} />
</TabsContent>
```

`ManagementTab` renders only `FinancialControlTab` in this release.

- [ ] **Step 4: Implement compact summary and reconciliation**

Use stable grid tracks, accessible button semantics for clickable metrics, RM formatting,
comparison arrows with text labels, and a generated-at timestamp. Reconciliation shows
billed cohort, cohort collections, older-debt collections, adjustments, cohort
outstanding, self-pay outstanding, and panel outstanding without implying that period
cash equals period bills.

- [ ] **Step 5: Verify tests, responsive layout, and commit**

```powershell
npm.cmd test -- src/test/insight-management-tab.test.tsx src/test/financial-control-components.test.tsx
npx.cmd tsc --noEmit
git add src/pages/clinic/Insight.tsx src/components/clinic/insight/management src/test/insight-management-tab.test.tsx src/test/financial-control-components.test.tsx
git commit -m "feat: add financial control management summary"
```

---

### Task 5: Alerts, Margin Analysis, And Visit-Level Drill-Down

**Files:**
- Create: `src/components/clinic/insight/management/FinancialAlertsTable.tsx`
- Create: `src/components/clinic/insight/management/FinancialMarginTable.tsx`
- Create: `src/components/clinic/insight/management/FinancialDetailSheet.tsx`
- Modify: `src/components/clinic/insight/management/FinancialControlTab.tsx`
- Modify: `src/test/financial-control-components.test.tsx`

**Interfaces:**
- Consumes: `useFinancialControlDetails`, selected metric/alert/group/page state.
- Produces: urgency-ordered alerts, segmented margin table, and a paginated detail sheet.

- [ ] **Step 1: Add failing interaction tests**

Test all ten alert keys, urgency ordering, group switches, page changes, zero-row state,
detail errors isolated from summary, and links:

```ts
expect(screen.getByRole('link', { name: /open visit/i }))
  .toHaveAttribute('href', '/clinic/visits/queue-1');
expect(screen.getByRole('link', { name: /open bill/i }))
  .toHaveAttribute('href', '/clinic/billings?queue=queue-1');
```

- [ ] **Step 2: Run tests and verify RED**

- [ ] **Step 3: Implement alerts and margin grouping**

Render alerts as a dense table with severity, count, amount at risk, oldest age, and
`View` action. Use a menu or tabs for medicine, procedure/service, package, doctor,
payment type, and panel provider. Keep table headers compact and sortable only where
the server contract supports deterministic sorting.

- [ ] **Step 4: Implement the detail sheet**

The sheet owns metric, group, alert, page, and page-size state. Render only financial
fields from the typed row. Include Previous/Next controls with fixed dimensions,
direct visit/bill links, and no clinical-note fetch.

- [ ] **Step 5: Verify tests, keyboard behavior, and commit**

```powershell
npm.cmd test -- src/test/financial-control-components.test.tsx
npx.cmd tsc --noEmit
git add src/components/clinic/insight/management src/test/financial-control-components.test.tsx
git commit -m "feat: add financial control alerts and drilldowns"
```

---

### Task 6: Export Parity And Failure Isolation

**Files:**
- Modify: `src/components/clinic/insight/management/FinancialDetailSheet.tsx`
- Modify: `src/components/clinic/insight/management/FinancialControlTab.tsx`
- Modify: `src/lib/clinic/financialControl.ts`
- Modify: `src/test/financial-control-lib.test.ts`
- Modify: `src/test/financial-control-components.test.tsx`

**Interfaces:**
- Consumes: current server filters and `financialControlRowsToCsv`.
- Produces: exact visible-row CSV export and section-scoped retry behavior.

- [ ] **Step 1: Write failing export and error tests**

Assert quoted commas/newlines, leading formula characters escaped as text, UTF-8 BOM,
two-decimal money values, current filter in filename, no hidden clinical columns,
and separate retry buttons for summary and details.

- [ ] **Step 2: Run tests and verify RED**

- [ ] **Step 3: Implement safe CSV download**

Filename:

```ts
`financial_control_${startKey}_to_${endKey}_${metric}_${groupBy}.csv`
```

Prefix cells beginning with `=`, `+`, `-`, or `@` with a single quote before
CSV escaping. Export the currently filtered server result; when total rows exceed the
current page, request bounded export pages sequentially with a hard maximum of 10,000
rows and show a clear truncation notice.

- [ ] **Step 4: Implement section-scoped retry and stale-data labeling**

Keep successful sections visible when another query fails. Show `Last updated` from
the server and a retry command scoped to the failed query key.

- [ ] **Step 5: Verify and commit**

```powershell
npm.cmd test -- src/test/financial-control-lib.test.ts src/test/financial-control-components.test.tsx
git add src/components/clinic/insight/management src/lib/clinic/financialControl.ts src/test/financial-control-lib.test.ts src/test/financial-control-components.test.tsx
git commit -m "feat: add financial control export and recovery"
```

---

### Task 7: Final Integration, Security Review, And Release Readiness

**Files:**
- Modify only files required by verified integration defects.
- Update: `docs/superpowers/plans/2026-08-03-financial-control-management-deep-dive.md` checkbox status during execution.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: reviewed migration and application commit ready for coordinated Supabase and web deployment.

- [ ] **Step 1: Run the focused feature suite**

```powershell
$env:REQUIRE_POSTGRES_TEST='1'
npm.cmd test -- src/test/financial-control-report-migration.test.ts src/test/financial-control-lib.test.ts src/test/use-financial-control.test.tsx src/test/financial-control-components.test.tsx src/test/insight-management-tab.test.tsx
```

Expected: all tests pass and the PostgreSQL suite executes rather than skips.

- [ ] **Step 2: Run repository gates**

```powershell
npx.cmd tsc --noEmit
npm.cmd run lint:changed
npm.cmd run build
git diff --check
```

- [ ] **Step 3: Perform desktop and mobile visual verification**

Use the authenticated test environment at desktop and mobile widths. Verify the
summary strip does not overflow, billed and collected remain distinguishable, tables
do not overlap, the detail sheet remains usable, and every metric/alert opens the
expected filtered details.

- [ ] **Step 4: Review database security and performance**

Apply the migration to a disposable PostgreSQL instance, run the executable contract,
inspect `EXPLAIN (ANALYZE, BUFFERS)` for a one-year report and a 100-row detail page,
confirm anonymous users cannot execute either RPC, confirm callers without
`can_view_insights` fail, and run Supabase security and performance advisors after
production DDL.

- [ ] **Step 5: Request independent code review**

Review the complete diff against the approved design, prioritizing incorrect financial
definitions, row duplication, payment allocation, COGS attribution, as-of-date leakage,
authorization bypass, unbounded queries, export mismatch, and missing regression tests.

- [ ] **Step 6: Deploy database and app together**

After review and fresh verification:

1. Confirm the migration is absent from production history.
2. Apply `20260803100000_add_financial_control_reports.sql`.
3. Execute production postflight queries for signatures, grants, and permission checks.
4. Push the reviewed commit to `main`.
5. Wait for Security Gate and Deploy GitHub Pages to succeed.
6. Verify the deployed commit SHA and live Financial Control page.

- [ ] **Step 7: Final release commit if documentation changed**

```powershell
git add docs/superpowers/plans/2026-08-03-financial-control-management-deep-dive.md
git commit -m "docs: record financial control implementation"
```
