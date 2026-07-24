# Financial Insights All Sales Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show every active payment collected in the selected clinic date range while preserving consultation revenue, COGS, profit, and margin as separate accounting measures.

**Architecture:** Read active rows from `payments` in deterministic pages so the dashboard is not capped by the API row limit. Aggregate payment collections in a pure, tested module, while leaving `insight_financials_view` as the source for consultation revenue and profitability.

**Tech Stack:** React, TypeScript, TanStack Query, Supabase JS, date-fns, Recharts, Vitest, GitHub Actions Pages.

## Global Constraints

- “Total Collected” means the sum of active `payments.amount` rows created in the selected local clinic date range.
- “Consultation Revenue”, COGS, Gross Profit, and Gross Margin remain derived from completed consultation items.
- Deleted payment rows must not be included.
- More than 1,000 payment rows must be retrievable without truncation.
- Existing role restrictions for `/clinic/insight` remain unchanged.
- No database schema or RLS changes are required.

---

### Task 1: Tested sales aggregation

**Files:**
- Create: `src/lib/clinic/salesInsights.ts`
- Create: `src/test/sales-insights.test.ts`

**Interfaces:**
- Produces: `aggregateSalesInsights(rows)` returning summary, daily trends, payment-method totals, and CSV rows.
- Produces: `getLocalDateRangeBounds(startDate, endDate)` returning ISO timestamps for inclusive local calendar dates.

- [ ] **Step 1: Write failing tests**

Cover totals, unique payments, local-day grouping, method grouping, numeric strings, negative adjustments, invalid amounts, and inclusive date bounds.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm test -- src/test/sales-insights.test.ts`

Expected: FAIL because `salesInsights.ts` does not exist.

- [ ] **Step 3: Implement the pure aggregation module**

Normalize finite amounts, preserve signed adjustments, sort days chronologically, sort payment methods by collected amount, and produce stable raw rows.

- [ ] **Step 4: Run the focused test**

Run: `npm test -- src/test/sales-insights.test.ts`

Expected: PASS with zero failures.

### Task 2: Fetch every active payment

**Files:**
- Modify: `src/hooks/clinic/useSalesInsights.ts`
- Modify: `src/test/sales-insights.test.ts`

**Interfaces:**
- Consumes: `aggregateSalesInsights` and `getLocalDateRangeBounds`.
- Produces: `useSalesInsights(startDate, endDate)` with complete paginated results.

- [ ] **Step 1: Add a failing pagination contract test**

Assert a page size constant and continuation rule that fetches the next page only when the prior page is full.

- [ ] **Step 2: Verify the new test fails**

Run: `npm test -- src/test/sales-insights.test.ts`

Expected: FAIL because pagination helpers are missing.

- [ ] **Step 3: Implement deterministic pagination**

Order by `created_at` and `id`, request pages with `.range()`, stop on a short page, and aggregate all returned active rows.

- [ ] **Step 4: Verify the focused tests pass**

Run: `npm test -- src/test/sales-insights.test.ts`

Expected: PASS with zero failures.

### Task 3: Clarify the dashboard and preserve all original metrics

**Files:**
- Modify: `src/pages/clinic/Insight.tsx`

**Interfaces:**
- Consumes: consultation insights and sales collection insights independently.
- Produces: visible collection totals even when consultation rows are empty, plus clear loading, empty, and error states.

- [ ] **Step 1: Restore the Gross Margin card**

Use a five-card responsive grid and keep “Total Collected” visually distinct from consultation revenue.

- [ ] **Step 2: Decouple empty states**

Do not hide collected-sales data when no completed consultation exists. Show each section’s own empty state.

- [ ] **Step 3: Add sales-query error feedback**

Display a concise error message without suppressing consultation analytics.

- [ ] **Step 4: Correct labels and export names**

Label the profit metrics as consultation-based and retain separate CSV exports for consultation economics and collected payments.

### Task 4: Verify and deploy

**Files:**
- Verify: all changed source and test files
- Deploy: `.github/workflows/deploy-pages.yml`

**Interfaces:**
- Produces: a commit on `main` that passes the Security Gate and triggers the GitHub Pages production deployment.

- [ ] **Step 1: Run focused tests**

Run: `npm test -- src/test/sales-insights.test.ts`

Expected: PASS.

- [ ] **Step 2: Run changed-file lint and TypeScript/build validation**

Run: `npm run lint:changed`

Run: `npm run build`

Expected: both exit successfully.

- [ ] **Step 3: Run the relevant financial and hosting regression tests**

Run: `npm test -- src/test/finance-boundary-hardening.test.ts src/test/financial-config-policy.test.ts src/test/github-pages-hosting.test.ts`

Expected: PASS.

- [ ] **Step 4: Review the final diff and commit**

Confirm only the planned files changed, then commit with a focused message.

- [ ] **Step 5: Push the change to production**

Push the validated commit to `main` using the repository’s established integration flow.

- [ ] **Step 6: Verify GitHub Actions and the live route**

Confirm the Security Gate succeeds, the Pages deployment succeeds, and `https://klinikawfa.com/clinic/insight` serves the deployed application.
