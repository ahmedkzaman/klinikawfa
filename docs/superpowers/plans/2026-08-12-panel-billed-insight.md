# Panel Billed Insight Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the billed value and claim count of eligible panel claims for the selected Insight date range beside the existing collected-payment method cards.

**Architecture:** Add a pure panel-claim aggregation module and a React Query hook that reads date-filtered rows from `panel_claims`. Keep this receivables measure separate from `useSalesInsights`, then compose both query results in `Insight.tsx` so collected totals and charts retain their existing meaning.

**Tech Stack:** React 18, TypeScript, TanStack React Query, Supabase JS, Vitest, Testing Library, Tailwind CSS.

## Global Constraints

- Panel Billed sums `panel_claims.amount` using inclusive `claim_date` boundaries.
- Include `pending`, `submitted`, `approved`, and `received`; exclude `rejected` and `cancelled`.
- Use original `amount`, not `approved_amount` or `received_amount`.
- Show the eligible claim count.
- Do not add Panel Billed to Total Collected, the collected-sales chart, or the collected-sales CSV.
- Render `RM 0.00` and `0 claims` when the query succeeds with no eligible claims.
- No database migration or Edge Function deployment.

---

## File Structure

- Create `src/lib/clinic/panelBilledInsights.ts`: panel-claim types, status eligibility, numeric normalization, and pure aggregation.
- Create `src/hooks/clinic/usePanelBilledInsights.ts`: date-keyed Supabase query and React Query integration.
- Create `src/test/panel-billed-insights.test.ts`: unit coverage for accounting rules and empty data.
- Modify `src/pages/clinic/Insight.tsx`: query composition, error/loading treatment, and fourth summary tile.
- Modify or create `src/test/insight-panel-billed-card.test.tsx`: page-level rendering regression coverage with mocked hooks.

### Task 1: Panel-billed accounting domain

**Files:**
- Create: `src/lib/clinic/panelBilledInsights.ts`
- Test: `src/test/panel-billed-insights.test.ts`

**Interfaces:**
- Produces: `PanelClaimStatus`, `PanelClaimRow`, `PanelBilledSummary`, `isPanelClaimBilled(status)`, and `aggregatePanelBilledClaims(rows)`.
- `aggregatePanelBilledClaims(rows: PanelClaimRow[]): PanelBilledSummary` returns `{ totalBilled: number; claimCount: number }`.

- [ ] **Step 1: Write failing aggregation tests**

```ts
import { describe, expect, it } from 'vitest';
import { aggregatePanelBilledClaims } from '@/lib/clinic/panelBilledInsights';

describe('aggregatePanelBilledClaims', () => {
  it('sums original amounts for billable statuses and excludes rejected and cancelled claims', () => {
    expect(aggregatePanelBilledClaims([
      { amount: '100.50', status: 'pending' },
      { amount: 50, status: 'submitted' },
      { amount: '75', status: 'approved' },
      { amount: 25, status: 'received' },
      { amount: 500, status: 'rejected' },
      { amount: 900, status: 'cancelled' },
    ])).toEqual({ totalBilled: 250.5, claimCount: 4 });
  });

  it('returns zero totals for no eligible claims and normalizes invalid amounts to zero', () => {
    expect(aggregatePanelBilledClaims([
      { amount: 'invalid', status: 'pending' },
      { amount: 20, status: 'cancelled' },
    ])).toEqual({ totalBilled: 0, claimCount: 1 });
    expect(aggregatePanelBilledClaims([])).toEqual({ totalBilled: 0, claimCount: 0 });
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- --run src/test/panel-billed-insights.test.ts`

Expected: FAIL because `@/lib/clinic/panelBilledInsights` does not exist.

- [ ] **Step 3: Implement the minimal accounting module**

```ts
export type PanelClaimStatus =
  | 'pending'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'received'
  | 'cancelled';

export interface PanelClaimRow {
  amount: number | string | null;
  status: PanelClaimStatus;
}

export interface PanelBilledSummary {
  totalBilled: number;
  claimCount: number;
}

const BILLED_STATUSES = new Set<PanelClaimStatus>([
  'pending',
  'submitted',
  'approved',
  'received',
]);

export function isPanelClaimBilled(status: PanelClaimStatus): boolean {
  return BILLED_STATUSES.has(status);
}

export function aggregatePanelBilledClaims(rows: PanelClaimRow[]): PanelBilledSummary {
  return rows.reduce<PanelBilledSummary>((summary, row) => {
    if (!isPanelClaimBilled(row.status)) return summary;
    const amount = Number(row.amount ?? 0);
    summary.totalBilled += Number.isFinite(amount) ? amount : 0;
    summary.claimCount += 1;
    return summary;
  }, { totalBilled: 0, claimCount: 0 });
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- --run src/test/panel-billed-insights.test.ts`

Expected: 2 tests pass.

- [ ] **Step 5: Commit the accounting unit**

```bash
git add src/lib/clinic/panelBilledInsights.ts src/test/panel-billed-insights.test.ts
git commit -m "feat: aggregate billed panel claims"
```

### Task 2: Date-filtered panel billing query

**Files:**
- Create: `src/hooks/clinic/usePanelBilledInsights.ts`
- Test: `src/test/use-panel-billed-insights.test.tsx`

**Interfaces:**
- Consumes: `aggregatePanelBilledClaims(rows)` from Task 1.
- Produces: `usePanelBilledInsights(startDate: Date, endDate: Date)`, returning a TanStack query whose data is `PanelBilledSummary`.

- [ ] **Step 1: Write a failing hook test for date and status filters**

Use a hoisted Supabase query-chain mock matching the existing hook-test style. Assert that the hook:

```ts
expect(from).toHaveBeenCalledWith('panel_claims');
expect(select).toHaveBeenCalledWith('amount, status');
expect(gte).toHaveBeenCalledWith('claim_date', '2026-08-10');
expect(lte).toHaveBeenCalledWith('claim_date', '2026-08-10');
expect(not).toHaveBeenCalledWith('status', 'in', '(rejected,cancelled)');
expect(result.current.data).toEqual({ totalBilled: 250, claimCount: 2 });
```

Mock rows:

```ts
[
  { amount: '100', status: 'pending' },
  { amount: '150', status: 'approved' },
]
```

- [ ] **Step 2: Run the hook test and verify RED**

Run: `npm test -- --run src/test/use-panel-billed-insights.test.tsx`

Expected: FAIL because `usePanelBilledInsights` does not exist.

- [ ] **Step 3: Implement the React Query hook**

```ts
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import {
  aggregatePanelBilledClaims,
  type PanelBilledSummary,
  type PanelClaimRow,
} from '@/lib/clinic/panelBilledInsights';

export function usePanelBilledInsights(startDate: Date, endDate: Date) {
  const startKey = format(startDate, 'yyyy-MM-dd');
  const endKey = format(endDate, 'yyyy-MM-dd');

  return useQuery<PanelBilledSummary>({
    queryKey: ['panel-billed-insights', startKey, endKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('panel_claims')
        .select('amount, status')
        .gte('claim_date', startKey)
        .lte('claim_date', endKey)
        .not('status', 'in', '(rejected,cancelled)');

      if (error) throw error;
      return aggregatePanelBilledClaims((data ?? []) as PanelClaimRow[]);
    },
  });
}
```

- [ ] **Step 4: Run hook and domain tests and verify GREEN**

Run: `npm test -- --run src/test/panel-billed-insights.test.ts src/test/use-panel-billed-insights.test.tsx`

Expected: all focused tests pass.

- [ ] **Step 5: Commit the query hook**

```bash
git add src/hooks/clinic/usePanelBilledInsights.ts src/test/use-panel-billed-insights.test.tsx
git commit -m "feat: query panel billed insight"
```

### Task 3: Render Panel Billed beside collected methods

**Files:**
- Modify: `src/pages/clinic/Insight.tsx`
- Create: `src/test/insight-panel-billed-card.test.tsx`

**Interfaces:**
- Consumes: `usePanelBilledInsights(startDate, endDate)` from Task 2.
- Produces: a `Panel Billed` tile showing formatted `totalBilled` and pluralized `claimCount`.

- [ ] **Step 1: Write a failing rendering regression test**

Mock `useFinancialInsights`, `useSalesInsights`, and `usePanelBilledInsights` with successful settled values. Render `Insight` inside the repository's standard router/query test providers, select the `Overview` tab, and assert:

```ts
expect(await screen.findByText('Panel Billed')).toBeInTheDocument();
expect(screen.getByText('RM 450.00')).toBeInTheDocument();
expect(screen.getByText('3 claims')).toBeInTheDocument();
expect(screen.getByText('Total Collected').parentElement).toHaveTextContent('RM 200.00');
```

Add a second case with `{ totalBilled: 0, claimCount: 0 }` and empty collected methods, asserting `Panel Billed`, `RM 0.00`, and `0 claims` remain visible.

- [ ] **Step 2: Run the page test and verify RED**

Run: `npm test -- --run src/test/insight-panel-billed-card.test.tsx`

Expected: FAIL because the Panel Billed tile is not rendered.

- [ ] **Step 3: Compose the new query state in `Insight.tsx`**

Import and call the hook:

```ts
import { usePanelBilledInsights } from '@/hooks/clinic/usePanelBilledInsights';

const {
  data: panelBilledData,
  isLoading: panelBilledLoading,
  isError: panelBilledIsError,
  error: panelBilledError,
} = usePanelBilledInsights(startDate, endDate);
```

Include `panelBilledLoading` in the existing skeleton condition. Add a dedicated error card:

```tsx
{panelBilledIsError && (
  <Card className={bento}>
    <CardContent className="py-6 text-sm text-rose-600">
      Failed to load panel billed amount: {(panelBilledError as Error)?.message ?? 'Unknown error'}
    </CardContent>
  </Card>
)}
```

- [ ] **Step 4: Render a four-card responsive method row**

Replace the current condition and mapping wrapper with an always-available row when either collected methods or panel data exists:

```tsx
<div className="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
  {salesByMethod.slice(0, 3).map((method) => (
    <div key={method.method} className={softTile}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {method.method}
      </div>
      <div className="text-lg font-semibold text-slate-900">{formatRM(method.collected)}</div>
      <div className="text-xs text-slate-500">
        {method.paymentCount} payment{method.paymentCount === 1 ? '' : 's'}
      </div>
    </div>
  ))}
  <div className={softTile}>
    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
      Panel Billed
    </div>
    <div className="text-lg font-semibold text-slate-900">
      {formatRM(panelBilledData?.totalBilled ?? 0)}
    </div>
    <div className="text-xs text-slate-500">
      {panelBilledData?.claimCount ?? 0} claim{panelBilledData?.claimCount === 1 ? '' : 's'}
    </div>
  </div>
</div>
```

- [ ] **Step 5: Run the page and focused tests and verify GREEN**

Run: `npm test -- --run src/test/insight-panel-billed-card.test.tsx src/test/panel-billed-insights.test.ts src/test/use-panel-billed-insights.test.tsx`

Expected: all focused tests pass.

- [ ] **Step 6: Commit the UI integration**

```bash
git add src/pages/clinic/Insight.tsx src/test/insight-panel-billed-card.test.tsx
git commit -m "feat: show panel billed in financial insights"
```

### Task 4: Verify production readiness

**Files:**
- Modify only if verification identifies a defect in the files listed above.

**Interfaces:**
- Consumes: complete feature from Tasks 1–3.
- Produces: verified test, lint, build, database, and browser evidence.

- [ ] **Step 1: Run the complete automated test suite**

Run: `npm test -- --run`

Expected: all tests pass with zero failures.

- [ ] **Step 2: Run lint**

Run: `npm run lint`

Expected: exit code 0 with no new errors.

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: exit code 0 and a generated production bundle.

- [ ] **Step 4: Verify the selected-day database result**

Run this read-only SQL through the connected Supabase project, substituting the selected UI date:

```sql
select
  coalesce(sum(amount), 0) as total_billed,
  count(*) as claim_count
from public.panel_claims
where claim_date = date '2026-08-10'
  and status not in ('rejected', 'cancelled');
```

Expected: the total and count match the Panel Billed card for 10 August 2026.

- [ ] **Step 5: Deploy through the repository's existing GitHub Pages workflow**

Push the verified commits to `main` only after reviewing `git status`, `git diff main~3..main`, and confirming no unrelated files are included.

- [ ] **Step 6: Verify the deployed browser UI**

Open `https://klinikawfa.com/clinic/insight`, select **Overview**, choose 10 August 2026, and confirm:

- `Panel Billed` appears as the fourth tile.
- The amount and count equal the SQL result from Step 4.
- `Total Collected` and the blue collected-sales bar remain unchanged.
- The four tiles wrap cleanly on desktop and mobile widths.

- [ ] **Step 7: Commit any verification-only correction, if required**

If no correction is required, do not create an empty commit. If a defect is found, reproduce it with a failing test, implement the smallest correction, rerun Steps 1–6, and commit only the tested files.
