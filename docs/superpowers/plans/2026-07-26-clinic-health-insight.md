# Clinic Health Insight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend Clinic Insight into a transparent, actionable health dashboard covering finances, operations, panel claims, inventory, patients, and data completeness.

**Architecture:** Add a default `Clinic Health` tab composed from small metric modules. Keep raw aggregation in focused hooks/database RPCs, keep scoring in pure tested functions, and let each dashboard section load and fail independently. Deliver the work in reviewable phases so every phase is independently deployable.

**Tech Stack:** React 18, TypeScript, React Query, Supabase/PostgreSQL, Recharts, shadcn/ui, date-fns, Vitest, Testing Library.

## Global Constraints

- Preserve all existing Insight tabs.
- Date-bound metrics use an inclusive selected range and an equal-length prior period.
- Live metrics are explicitly labelled “Current.”
- Empty or incomplete data must not appear as a healthy zero.
- Every critical alert explains the problem and links to an authorized resolution workflow where practical.
- Aggregate cards must not expose patient-identifying information.
- Use test-first development and commit after every independently reviewable task.

## File Map

- Create `src/lib/clinic/insight/periods.ts`: inclusive current/prior ranges.
- Create `src/lib/clinic/insight/healthScore.ts`: transparent score calculation.
- Create `src/lib/clinic/insight/alerts.ts`: alert severity and prioritization.
- Create `src/hooks/clinic/useClinicHealth.ts`: executive metric orchestration.
- Create `src/hooks/clinic/usePanelHealth.ts`, `useOperationsHealth.ts`, `useInventoryHealth.ts`, `usePatientHealth.ts`.
- Create focused components in `src/components/clinic/insight/`.
- Modify `src/pages/clinic/Insight.tsx` to add tabs and quick ranges.
- Add additive Supabase RPC/view migrations per phase.

---

## Milestone A: Executive Clinic Health and Panel Visibility

### Task 1: Shared date-period utility

**Files:**
- Create: `src/lib/clinic/insight/periods.ts`
- Test: `src/test/insight-periods.test.ts`

**Interfaces:**
- Produces: `buildComparisonPeriod(startDate: Date, endDate: Date): InsightPeriod`
- `InsightPeriod` contains `startKey`, `endKey`, `priorStartKey`, `priorEndKey`, and `days`.

- [ ] **Step 1: Write failing tests**

Test one-day, seven-day, and month-boundary ranges. For `2026-07-20` through `2026-07-26`, expect prior range `2026-07-13` through `2026-07-19` and `days: 7`.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/test/insight-periods.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement using `differenceInCalendarDays`, `format`, and `subDays`**

```ts
export function buildComparisonPeriod(startDate: Date, endDate: Date): InsightPeriod {
  const days = Math.max(1, differenceInCalendarDays(endDate, startDate) + 1);
  const priorEnd = subDays(startDate, 1);
  const priorStart = subDays(priorEnd, days - 1);
  return {
    startKey: format(startDate, 'yyyy-MM-dd'),
    endKey: format(endDate, 'yyyy-MM-dd'),
    priorStartKey: format(priorStart, 'yyyy-MM-dd'),
    priorEndKey: format(priorEnd, 'yyyy-MM-dd'),
    days,
  };
}
```

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm test -- src/test/insight-periods.test.ts`

Commit:

```bash
git add src/lib/clinic/insight/periods.ts src/test/insight-periods.test.ts
git commit -m "feat: standardize insight comparison periods"
```

### Task 2: Executive and panel-health RPC

**Files:**
- Create: `supabase/migrations/20260726100000_add_clinic_health_metrics.sql`
- Test: `src/test/clinic-health-migration.test.ts`

**Interfaces:**
- Produces RPC: `get_clinic_health_metrics(_start_date date, _end_date date) returns jsonb`
- JSON keys: `financial`, `visits`, `claims`, `panelFees`, `inventory`, `dataQuality`.

- [ ] **Step 1: Write a failing SQL contract test**

Assert the migration defines the RPC, uses authenticated role checks consistent with existing financial RPCs, bounds rows by the supplied inclusive dates, and returns all six JSON keys.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/test/clinic-health-migration.test.ts`

- [ ] **Step 3: Implement the RPC**

Return:

```ts
interface ClinicHealthMetrics {
  financial: { revenue: number; profit: number; marginPct: number };
  visits: { registered: number; completed: number; cancelled: number; noShow: number };
  claims: { outstandingAmount: number; unsubmittedCount: number; overdueCount: number };
  panelFees: { activePanels: number; missingDefaultCount: number; mismatchedVisitCount: number };
  inventory: { outOfStockCount: number; belowReorderCount: number; expiring60DaysCount: number };
  dataQuality: { completedWithoutPayment: number; panelVisitWithoutPanel: number; consultationWithoutFee: number };
}
```

Use `COALESCE` for aggregate values, but return explicit counts that allow the UI to distinguish “no issue” from “no underlying records.” Grant execute only to the same authorized clinic roles that can view Insight.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm test -- src/test/clinic-health-migration.test.ts`

Commit:

```bash
git add supabase/migrations/20260726100000_add_clinic_health_metrics.sql src/test/clinic-health-migration.test.ts
git commit -m "feat: add clinic health metric RPC"
```

### Task 3: Transparent scoring and prioritized alerts

**Files:**
- Create: `src/lib/clinic/insight/healthScore.ts`
- Create: `src/lib/clinic/insight/alerts.ts`
- Test: `src/test/clinic-health-score.test.ts`
- Test: `src/test/clinic-health-alerts.test.ts`

**Interfaces:**
- Produces: `scoreClinicHealth(metrics, comparisons): ClinicHealthScore`
- Produces: `buildClinicAlerts(metrics): ClinicHealthAlert[]`
- Alert shape: `{ id; severity: 'critical' | 'warning' | 'info'; title; detail; href }`

- [ ] **Step 1: Write failing score tests**

Assert all six dimension scores are visible, total score is their weighted mean, scores clamp to `0..100`, and unavailable input yields `status: 'insufficient-data'` instead of a score of 100.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/test/clinic-health-score.test.ts`

- [ ] **Step 3: Implement initial weights**

```ts
const WEIGHTS = {
  financial: 0.25,
  operations: 0.20,
  claims: 0.20,
  inventory: 0.15,
  patients: 0.10,
  dataQuality: 0.10,
} as const;
```

Expose every dimension's raw inputs and explanation in the return value. Do not make thresholds configurable in this release.

- [ ] **Step 4: Write failing alert tests**

Assert critical alerts sort before warnings, missing panel fees link to `/clinic/settings/panels`, overdue claims link to `/clinic/panel-claims`, and zero issue counts generate no alert.

- [ ] **Step 5: Implement alert rules and verify GREEN**

Run:

```bash
npm test -- src/test/clinic-health-score.test.ts
npm test -- src/test/clinic-health-alerts.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/clinic/insight/healthScore.ts src/lib/clinic/insight/alerts.ts src/test/clinic-health-score.test.ts src/test/clinic-health-alerts.test.ts
git commit -m "feat: score clinic health and prioritize alerts"
```

### Task 4: Executive Clinic Health UI

**Files:**
- Create: `src/hooks/clinic/useClinicHealth.ts`
- Create: `src/components/clinic/insight/ClinicHealthTab.tsx`
- Create: `src/components/clinic/insight/HealthScoreCard.tsx`
- Create: `src/components/clinic/insight/HealthAlertsList.tsx`
- Modify: `src/pages/clinic/Insight.tsx`
- Test: `src/test/clinic-health-tab.test.tsx`

**Interfaces:**
- Consumes: `get_clinic_health_metrics`, `scoreClinicHealth`, `buildClinicAlerts`
- Produces default tab value `clinic-health`.

- [ ] **Step 1: Write failing component tests**

Assert:

- Clinic Health is the first and default tab.
- Score dimensions and raw explanations render.
- Critical alerts appear first and their links are correct.
- One section error does not remove the other successful cards.
- `insufficient-data` renders “Not enough data to score.”

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/test/clinic-health-tab.test.tsx`

- [ ] **Step 3: Implement the hook and focused components**

Use one React Query call for the executive RPC and `select` to calculate score and alerts. Do not place scoring formulas inside JSX.

- [ ] **Step 4: Add quick date ranges**

Add buttons for `Today`, `This week`, `This month`, `Last month`, `This quarter`, and `Year to date`. Each button sets the existing `DateRange`, so every tab continues to use one shared filter.

- [ ] **Step 5: Verify GREEN and regression suite**

Run:

```bash
npm test -- src/test/clinic-health-tab.test.tsx
npm test
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/hooks/clinic/useClinicHealth.ts src/components/clinic/insight/ClinicHealthTab.tsx src/components/clinic/insight/HealthScoreCard.tsx src/components/clinic/insight/HealthAlertsList.tsx src/pages/clinic/Insight.tsx src/test/clinic-health-tab.test.tsx
git commit -m "feat: add executive clinic health dashboard"
```

## Milestone B: Operations

### Task 5: Operations metrics and tab

**Files:**
- Create: `supabase/migrations/20260726110000_add_operations_health_metrics.sql`
- Create: `src/hooks/clinic/useOperationsHealth.ts`
- Create: `src/components/clinic/insight/OperationsHealthTab.tsx`
- Test: `src/test/operations-health.test.ts`
- Modify: `src/pages/clinic/Insight.tsx`

**Interfaces:**
- RPC: `get_operations_health(_start_date date, _end_date date) returns jsonb`
- Returns counts, average/median wait, average consultation duration, current waiting, doctor load, hourly load, weekday load, and appointment conversion.

- [ ] **Step 1: Write failing SQL and aggregation tests**

Use fixtures covering cross-midnight visits, missing timestamps, cancelled appointments, and two doctors. Assert missing durations are excluded from averages rather than treated as zero.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/test/operations-health.test.ts`

- [ ] **Step 3: Implement the RPC and hook**

Calculate durations only where both timestamps exist and the end is not before the start. Return median via `percentile_cont(0.5)`.

- [ ] **Step 4: Implement the tab**

Show visit funnel, average and median waits, current queue, doctor load, peak hours, busiest weekdays, and appointment conversion. Label current waiting count as `Current`.

- [ ] **Step 5: Verify and commit**

Run:

```bash
npm test -- src/test/operations-health.test.ts
npm test
npm run build
```

Commit all Task 5 files with `feat: add operations health insights`.

## Milestone C: Panel and Claims Detail

### Task 6: Panel health drill-down

**Files:**
- Create: `supabase/migrations/20260726120000_add_panel_health_metrics.sql`
- Create: `src/hooks/clinic/usePanelHealth.ts`
- Create: `src/components/clinic/insight/PanelHealthTab.tsx`
- Test: `src/test/panel-health.test.ts`
- Modify: `src/pages/clinic/Insight.tsx`

**Interfaces:**
- RPC: `get_panel_health(_start_date date, _end_date date) returns jsonb`
- Per panel: visits, revenue, average consultation fee, configured fee, mismatch count, claim status counts, outstanding amount, aging buckets, average days to payment.

- [ ] **Step 1: Write failing metric-definition tests**

Cover blank default fee, zero default fee, paid and unpaid claims, rejected claims, and 0–30/31–60/61–90/90+ day aging.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/test/panel-health.test.ts`

- [ ] **Step 3: Implement RPC and hook**

Compare fee rows using the configured clinic consultation-fee name plus the existing consultation-fee fallback match. Treat `0` as configured and `null` as missing.

- [ ] **Step 4: Implement tab and drill-down links**

Render panel summary cards and a sortable table. Links to claims preserve panel/status through query parameters; the settings link opens the panel list.

- [ ] **Step 5: Verify and commit**

Run focused test, full suite, and build. Commit with `feat: add panel and claims health insights`.

## Milestone D: Inventory

### Task 7: Inventory health

**Files:**
- Create: `supabase/migrations/20260726130000_add_inventory_health_metrics.sql`
- Create: `src/hooks/clinic/useInventoryHealth.ts`
- Create: `src/components/clinic/insight/InventoryHealthTab.tsx`
- Test: `src/test/inventory-health.test.ts`
- Modify: `src/pages/clinic/Insight.tsx`

**Interfaces:**
- RPC returns stock value, out-of-stock, below-reorder, expiry buckets, fast/slow movement, medication revenue, COGS, and margin.

- [ ] **Step 1: Write failing tests**

Cover zero stock, missing cost, multiple batches, expiry boundaries at 30/60/90 days, and an item with no movement.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/test/inventory-health.test.ts`

- [ ] **Step 3: Implement RPC and hook**

Value stock from unexpired available batches using the established batch cost field. Report missing cost separately; do not silently value it at zero.

- [ ] **Step 4: Implement tab**

Show action cards first, then expiry, movement, and medication-margin details. Link inventory alerts to the inventory page.

- [ ] **Step 5: Verify and commit**

Run focused test, full suite, and build. Commit with `feat: add inventory health insights`.

## Milestone E: Patients

### Task 8: Patient continuity health

**Files:**
- Create: `supabase/migrations/20260726140000_add_patient_health_metrics.sql`
- Create: `src/hooks/clinic/usePatientHealth.ts`
- Create: `src/components/clinic/insight/PatientHealthTab.tsx`
- Test: `src/test/patient-health.test.ts`
- Modify: `src/pages/clinic/Insight.tsx`

**Interfaces:**
- RPC returns new/returning counts, repeat rate, retained cohorts, follow-up completion, no-show rate, diagnosis distribution, high-frequency count, and overdue follow-up count.

- [ ] **Step 1: Write failing tests**

Define:

- New patient: first completed visit falls in the selected period.
- Returning patient: completed visit before and during the period.
- Repeat rate: patients with at least two completed visits in the period divided by patients with at least one.
- Follow-up completion: scheduled follow-ups whose due date passed and have a subsequent completed visit within the allowed window.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/test/patient-health.test.ts`

- [ ] **Step 3: Implement RPC and hook**

Return aggregates only. Patient-level rows are fetched only after an authorized drill-down action.

- [ ] **Step 4: Implement tab**

Render acquisition/return, repeat behavior, follow-up, no-show, diagnosis, and high-frequency summaries without names or IC numbers.

- [ ] **Step 5: Verify and commit**

Run focused test, full suite, and build. Commit with `feat: add patient continuity insights`.

## Milestone F: Hardening, Export, and Deployment

### Task 9: Independent error boundaries and CSV export

**Files:**
- Create: `src/components/clinic/insight/InsightSectionState.tsx`
- Modify all new Insight tabs.
- Modify: `src/pages/clinic/Insight.tsx`
- Test: `src/test/insight-section-resilience.test.tsx`

- [ ] **Step 1: Write failing resilience tests**

Assert one failed hook renders a local retry card while other tabs/cards remain usable. Assert CSV export includes selected period, metric name, value, comparison, and status but excludes patient identifiers.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/test/insight-section-resilience.test.tsx`

- [ ] **Step 3: Implement shared loading/error/empty state and health export**

Retry invalidates only the failed query key. Keep the existing raw financial CSV export and add a separate `Download Health Summary` action.

- [ ] **Step 4: Verify GREEN**

Run focused test, full suite, lint, and build.

- [ ] **Step 5: Commit**

Commit with `feat: harden and export clinic health insights`.

### Task 10: Production rollout by milestone

- [ ] **Step 1: Before each milestone, run**

```bash
npm test
npm run lint
npm run build
git diff --check
```

- [ ] **Step 2: Apply only that milestone's additive migration**

Run `supabase db push` and verify the new RPC with an authorized user and an unauthorized role.

- [ ] **Step 3: Push and monitor**

```bash
git push origin main
gh run list --limit 5
gh run watch <deployment-run-id> --exit-status
```

- [ ] **Step 4: Smoke test the milestone**

Check desktop and mobile layouts, empty/partial/error states, date presets, prior-period comparisons, alert links, and role restrictions.

- [ ] **Step 5: Validate definitions with clinic data**

For each new metric, manually reconcile at least one selected period against its source workflow. Record any threshold adjustment as a new reviewed change; do not silently alter historical definitions during deployment.

