# Clinic Insight Information Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the crowded seven-tab Insight page with a fast, role-safe four-section decision workspace: Command Centre, Finance, Performance, and Planning.

**Architecture:** Keep the existing financial-control, panel, doctor-activity, and attendance calculations as authoritative sources, but place them behind a shared Insight shell and section-specific query boundaries. Add one role-aware aggregate RPC for performance data, small domain mappers for presentation, and focused components so `Insight.tsx` becomes orchestration rather than a second analytics engine. Load only the active section, preserve the selected section in the URL, and expose definitions and confidence next to every decision metric.

**Tech Stack:** React 18, TypeScript 5.8, React Router 6, TanStack Query 5, shadcn/Radix UI, Recharts, Vitest/Testing Library, Supabase PostgreSQL RPCs and RLS.

## Global Constraints

- The four visible sections are exactly `Command Centre`, `Finance`, `Performance`, and `Planning`.
- `special_admin` and `doctor_admin` may see clinic-wide details and named doctor comparisons.
- `resident_doctor` may see their own named details and anonymized clinic benchmarks only.
- Operations roles may see clinic totals and service performance, but no named doctor financial comparison.
- `locum`, `guest`, unauthenticated users, and account overrides may not obtain Insight access.
- Financial figures must keep visit billing, patient collections, panel billed, panel received, patient outstanding, and panel outstanding separate.
- Panel allocation markers are not patient collections.
- Attendance periods are exactly `08:00–12:00`, `12:00–16:00`, `16:00–20:00`, and `20:00–00:00`.
- Doctor roster planning keeps S1 `08:00–13:00`, S2 `14:00–19:00`, and S3 `20:00–00:00`.
- Performance has no unexplained composite score and no single doctor ranking score.
- Management Dashboard remains the home for marketing, Google reputation, governance, stock/revenue targets, and manual monthly inputs.
- All dates and timestamps displayed or grouped by day use `Asia/Kuala_Lumpur`.
- Every query-driven panel must render loading, error with retry, empty, partial-data, and success states.
- Existing unrelated worktree changes and untracked artifacts must not be modified.

---

## File Structure

Create focused files under `src/components/clinic/insight/` rather than expanding `Insight.tsx`:

- `InsightShell.tsx`: title, date controls, compare control, section navigation, export menu, refresh, and confidence summary.
- `insightAccess.ts`: the single client presentation policy for section and identity visibility.
- `insightSections.ts`: URL section parsing and canonical section definitions.
- `command/CommandCentreTab.tsx`: clinic KPI strip, action centre, patient flow, attendance summary, and confidence drawer.
- `finance/FinanceTab.tsx`: finance sub-navigation and composition of existing financial-control views.
- `performance/PerformanceTab.tsx`: doctor/service summary tables and role-aware details.
- `planning/PlanningTab.tsx`: attendance regression, roster planning, forecast, and operational calendar composition.
- `shared/DataConfidence.tsx`: reusable confidence badge, disclosure, and field definitions.
- `shared/InsightState.tsx`: reusable loading/error/empty/partial panels.
- `shared/InsightExportMenu.tsx`: one export entry point whose items depend on the active section.

Create domain and query boundaries:

- `src/lib/clinic/insight/commandCentre.ts`: KPI and action presentation mapping only.
- `src/lib/clinic/insight/dataConfidence.ts`: reliable/partial/insufficient evaluation.
- `src/lib/clinic/insight/performance.ts`: role-safe doctor/service response normalization.
- `src/hooks/clinic/useInsightPerformance.ts`: the only client for the new performance RPC.
- `src/hooks/clinic/useInsightSectionData.ts`: active-section query enablement and refresh keys.
- `supabase/migrations/20260816120000_add_insight_performance_report.sql`: secured aggregate RPC and supporting indexes. Before creating it, confirm linked history has no version at `20260816120000`; if it does, stop and update this plan plus every reference to the next unused timestamp before implementation.
- `supabase/tests/insight_performance.sql`: rollback-only executable role and metric fixture.

Keep the authoritative existing modules in place and compose them:

- `useFinancialControl.ts`, `FinancialControlTab.tsx`, and its detail components remain the financial reconciliation source.
- `useDoctorClinicalActivity.ts` remains the clinical activity source until its fields are incorporated into the new performance RPC.
- `useAttendanceHeatmap.ts` plus existing regression components remain the planning model.
- `ManagementDashboard.tsx` retains manual management inputs and is linked from Planning rather than duplicated.

---

### Task 1: Lock the Section, URL, and Role Contract

**Files:**
- Create: `src/lib/clinic/insight/insightSections.ts`
- Create: `src/lib/clinic/insight/insightAccess.ts`
- Modify: `src/contexts/AuthContext.tsx:226-287`
- Modify: `src/components/clinic/ClinicLayout.tsx:80-150`
- Test: `src/test/insight-access.test.ts`
- Test: `src/test/insight-sections.test.ts`
- Test: `src/test/auth-guards.test.tsx`

**Interfaces:**
- Produces `InsightSection = 'command' | 'finance' | 'performance' | 'planning'`.
- Produces `parseInsightSection(search: string): InsightSection` and `withInsightSection(search: string, section: InsightSection): string`.
- Produces `getInsightAccess(role, doctorId): InsightAccess` where `InsightAccess` has `canOpenInsight`, `canSeeNamedDoctors`, `canSeeClinicDoctorBenchmarks`, `canSeeServicePerformance`, and `ownDoctorId`.
- `locum`, `guest`, and `null` always return `canOpenInsight: false`, regardless of account permission overrides.

- [ ] **Step 1: Write failing section and access tests**

```ts
expect(parseInsightSection('?section=performance')).toBe('performance');
expect(parseInsightSection('?section=unknown')).toBe('command');
expect(getInsightAccess('doctor_admin', null).canSeeNamedDoctors).toBe(true);
expect(getInsightAccess('resident_doctor', 'doctor-7')).toMatchObject({
  canOpenInsight: true,
  canSeeNamedDoctors: false,
  ownDoctorId: 'doctor-7',
});
expect(getInsightAccess('ops_staff', null).canSeeServicePerformance).toBe(true);
expect(getInsightAccess('locum', 'doctor-8').canOpenInsight).toBe(false);
expect(getInsightAccess('guest', null).canOpenInsight).toBe(false);
```

- [ ] **Step 2: Run the tests and confirm RED**

Run: `npm test -- src/test/insight-access.test.ts src/test/insight-sections.test.ts src/test/auth-guards.test.tsx`

Expected: FAIL because the section parser and policy do not exist and `canViewInsights` currently excludes resident and operations roles.

- [ ] **Step 3: Implement the exact section and access types**

```ts
export const INSIGHT_SECTIONS = ['command', 'finance', 'performance', 'planning'] as const;
export type InsightSection = typeof INSIGHT_SECTIONS[number];

export type InsightAccess = {
  canOpenInsight: boolean;
  canSeeNamedDoctors: boolean;
  canSeeClinicDoctorBenchmarks: boolean;
  canSeeServicePerformance: boolean;
  ownDoctorId: string | null;
};
```

Implement the allowlists explicitly. Do not infer access from `isAdmin`, and do not let the mutable account override bypass the locum/guest deny rule.

- [ ] **Step 4: Wire AuthContext and sidebar visibility to the policy**

`AuthContext.canViewInsights` must call the policy. `ClinicLayout` must show Insight to every role for which `canOpenInsight` is true and hide it for locum/guest. Preserve existing Management Dashboard permission behavior.

- [ ] **Step 5: Run focused tests and type-check**

Run: `npm test -- src/test/insight-access.test.ts src/test/insight-sections.test.ts src/test/auth-guards.test.tsx`

Run: `npx tsc --noEmit -p tsconfig.app.json`

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/clinic/insight/insightSections.ts src/lib/clinic/insight/insightAccess.ts src/contexts/AuthContext.tsx src/components/clinic/ClinicLayout.tsx src/test/insight-access.test.ts src/test/insight-sections.test.ts src/test/auth-guards.test.tsx
git commit -m "feat: define clinic insight access and sections"
```

---

### Task 2: Build the Shared Insight Shell and Active-Section Loading

**Files:**
- Create: `src/components/clinic/insight/InsightShell.tsx`
- Create: `src/components/clinic/insight/shared/InsightExportMenu.tsx`
- Create: `src/components/clinic/insight/shared/InsightState.tsx`
- Create: `src/hooks/clinic/useInsightSectionData.ts`
- Modify: `src/pages/clinic/Insight.tsx`
- Test: `src/test/insight-shell.test.tsx`
- Test: `src/test/insight-query-enablement.test.tsx`
- Test: `src/test/insight-periods.test.ts`

**Interfaces:**
- Consumes `InsightSection`, `parseInsightSection`, and `withInsightSection` from Task 1.
- Produces `<InsightShell section onSectionChange range onRangeChange comparisonEnabled onComparisonChange onRefresh exportItems confidence />`.
- Produces `insightQueryFlags(section)` returning `{ command, finance, performance, planning }` booleans with exactly one `true`.
- Export items use `{ id, label, download, disabled, disabledReason }`; no section may render standalone export buttons outside the shared menu.

- [ ] **Step 1: Write the failing shell interaction test**

```tsx
render(<Insight initialSearch="?section=performance" />);
expect(screen.getByRole('heading', { name: 'Clinic Insight' })).toBeVisible();
expect(screen.getByRole('tab', { name: 'Performance' })).toHaveAttribute('aria-selected', 'true');
await user.click(screen.getByRole('tab', { name: 'Finance' }));
expect(window.location.search).toContain('section=finance');
expect(screen.getByRole('button', { name: 'Export' })).toBeVisible();
```

Mock all section hooks and assert only the active section has `enabled: true`.

- [ ] **Step 2: Run the tests and confirm RED**

Run: `npm test -- src/test/insight-shell.test.tsx src/test/insight-query-enablement.test.tsx src/test/insight-periods.test.ts`

Expected: FAIL because the current page has seven tabs, three export buttons, and eagerly invokes page-level hooks.

- [ ] **Step 3: Extract date presets and CSV actions without changing calculations**

Move existing preset/date utilities and download callbacks out of the rendered page into focused helpers. Keep `MAX_RANGE_DAYS = 365`, Malaysian date semantics, existing filenames, and existing CSV columns during this task.

- [ ] **Step 4: Implement the shell**

Use a compact wrapping header: title and period summary first; date range, compare, refresh, confidence, and one Export menu second; four horizontally scrollable accessible tabs third. On narrow screens controls wrap without horizontal page overflow.

- [ ] **Step 5: Replace eager page queries with enabled flags**

Every section hook receives or derives an `enabled` option. Query keys retain date range and identity dimensions. Refresh invalidates only the active section's query-key prefix.

- [ ] **Step 6: Verify focused and existing export regressions**

Run: `npm test -- src/test/insight-shell.test.tsx src/test/insight-query-enablement.test.tsx src/test/insight-periods.test.ts src/test/insight-panel-billed-card.test.tsx src/test/sales-insights.test.ts src/test/panel-billed-insights.test.ts`

Run: `npx eslint src/pages/clinic/Insight.tsx src/components/clinic/insight/InsightShell.tsx src/components/clinic/insight/shared/InsightExportMenu.tsx src/components/clinic/insight/shared/InsightState.tsx src/hooks/clinic/useInsightSectionData.ts`

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/pages/clinic/Insight.tsx src/components/clinic/insight/InsightShell.tsx src/components/clinic/insight/shared/InsightExportMenu.tsx src/components/clinic/insight/shared/InsightState.tsx src/hooks/clinic/useInsightSectionData.ts src/test/insight-shell.test.tsx src/test/insight-query-enablement.test.tsx src/test/insight-periods.test.ts
git commit -m "feat: add focused clinic insight shell"
```

---

### Task 3: Add Data Confidence and the Command Centre

**Files:**
- Create: `src/lib/clinic/insight/dataConfidence.ts`
- Create: `src/lib/clinic/insight/commandCentre.ts`
- Create: `src/components/clinic/insight/shared/DataConfidence.tsx`
- Create: `src/components/clinic/insight/command/CommandCentreTab.tsx`
- Create: `src/components/clinic/insight/command/CommandActionCentre.tsx`
- Create: `src/components/clinic/insight/command/CommandKpiStrip.tsx`
- Modify: `src/components/clinic/insight/ClinicHealthTab.tsx`
- Modify: `src/components/clinic/insight/HealthAlertsList.tsx`
- Test: `src/test/insight-data-confidence.test.ts`
- Test: `src/test/insight-command-centre.test.tsx`
- Test: `src/test/clinic-health-alerts.test.ts`

**Interfaces:**
- Produces `DataConfidenceLevel = 'reliable' | 'partial' | 'insufficient'`.
- Produces `evaluateDataConfidence({ expectedRows, observedRows, missingAttributionRows, lastRefreshedAt, source }): DataConfidence`.
- Produces `CommandAction` with `key`, `group`, `severity`, `title`, `count`, `amount`, `oldestDate`, `href`, and `confidence`.
- Consumes existing clinic-health and financial-control results; it must not recalculate money from raw payment rows.

- [ ] **Step 1: Write failing confidence and action tests**

```ts
expect(evaluateDataConfidence({ expectedRows: 10, observedRows: 10, missingAttributionRows: 0, lastRefreshedAt: now, source: 'financial-control' }).level).toBe('reliable');
expect(evaluateDataConfidence({ expectedRows: 10, observedRows: 8, missingAttributionRows: 2, lastRefreshedAt: now, source: 'financial-control' }).level).toBe('partial');
expect(buildCommandActions({ unpaidSelfPay: 0, overduePanel: 4 })).toHaveLength(1);
expect(buildCommandActions({ unpaidSelfPay: 0, overduePanel: 4 })[0].title).toMatch(/panel/i);
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm test -- src/test/insight-data-confidence.test.ts src/test/insight-command-centre.test.tsx src/test/clinic-health-alerts.test.ts`

Expected: FAIL because zero-count health alerts are currently rendered and no confidence model exists.

- [ ] **Step 3: Implement deterministic confidence rules**

Use `insufficient` when the source failed, the expected denominator is unknown, or there are no observed rows for a period expected to contain data. Use `partial` for missing attribution or incomplete costs. Use `reliable` only when the source succeeded and the relevant completeness counters are zero. Expose the reason, source, date basis, refresh timestamp, and missing count.

- [ ] **Step 4: Implement Command Centre composition**

Primary KPIs are total patients, average waiting time, visit billing, patient collections, panel receivable, and critical action count. Group actions into Money, Panels, Billing, Clinical records, and Inventory. Hide zero-count alerts. Preserve existing deep links such as missing-payment queue focus and financial detail drawers.

- [ ] **Step 5: Add patient-flow and compact attendance summaries**

Render patient-flow counts and a four-period attendance summary; link `View planning analysis` to `?section=planning`. Do not duplicate the full heatmap here.

- [ ] **Step 6: Verify accessibility and regressions**

Run: `npm test -- src/test/insight-data-confidence.test.ts src/test/insight-command-centre.test.tsx src/test/clinic-health-alerts.test.ts src/test/clinic-health-score.test.ts src/test/financial-control-components.test.tsx`

Expected: all PASS; a zero alert is absent, partial confidence has an explanation, and each actionable card is keyboard reachable.

- [ ] **Step 7: Commit**

```bash
git add src/lib/clinic/insight/dataConfidence.ts src/lib/clinic/insight/commandCentre.ts src/components/clinic/insight/shared/DataConfidence.tsx src/components/clinic/insight/command src/components/clinic/insight/ClinicHealthTab.tsx src/components/clinic/insight/HealthAlertsList.tsx src/test/insight-data-confidence.test.ts src/test/insight-command-centre.test.tsx src/test/clinic-health-alerts.test.ts
git commit -m "feat: add clinic insight command centre"
```

---

### Task 4: Reorganize Finance Around the Dual Ledger

**Files:**
- Create: `src/components/clinic/insight/finance/FinanceTab.tsx`
- Create: `src/components/clinic/insight/finance/FinanceLedgerSummary.tsx`
- Create: `src/components/clinic/insight/finance/PanelLifecycleTable.tsx`
- Create: `src/lib/clinic/insight/financeSections.ts`
- Modify: `src/components/clinic/insight/management/FinancialControlTab.tsx`
- Modify: `src/components/clinic/insight/management/FinancialSummaryStrip.tsx`
- Modify: `src/components/clinic/insight/management/FinancialAlertsTable.tsx`
- Modify: `src/pages/clinic/Insight.tsx`
- Test: `src/test/insight-finance-tab.test.tsx`
- Test: `src/test/insight-finance-ledger.test.ts`
- Test: `src/test/financial-control-components.test.tsx`

**Interfaces:**
- Produces `FinanceSection = 'summary' | 'collections' | 'panels' | 'costs' | 'reconciliation' | 'advanced'`.
- Consumes existing `FinancialControlPeriodSummary`, panel-billed insights, sales insights, and dual-ledger classifications.
- The summary contract exposes `visitBilled`, `patientCollected`, `panelBilled`, `panelReceived`, `patientOutstanding`, and `panelOutstanding` as distinct values.

- [ ] **Step 1: Write failing finance identity tests**

```ts
expect(summary.patientCollected).toBe(98);
expect(summary.panelBilled).toBe(45);
expect(summary.panelReceived).toBe(0);
expect(summary.patientOutstanding).toBe(0);
expect(summary.panelOutstanding).toBe(45);
expect(screen.queryByText('panel', { selector: '[data-collection-method]' })).not.toBeInTheDocument();
```

Use a co-payment fixture with Cash/QR patient portions and a separate panel claim.

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm test -- src/test/insight-finance-tab.test.tsx src/test/insight-finance-ledger.test.ts src/test/financial-control-components.test.tsx`

Expected: FAIL because the current Overview and Management tabs split the concepts and expose separate export controls.

- [ ] **Step 3: Implement finance sub-navigation and summary**

Summary shows the six ledger values above and their definitions. Collections groups physical methods: Card, QR Pay, Cash, E-wallet, and Other. Panels show claim lifecycle and provider. Costs & Margin reuse existing COGS/margin details. Reconciliation displays the existing equations and attribution warnings. Bank Health and Valuation live under Advanced and remain permission-gated.

- [ ] **Step 4: Preserve details and comparison safeguards**

Keep visit-grouped detail drawers and CSV detail exports. Suppress percentage comparisons when the prior denominator is zero or confidence is insufficient; show `Comparison unavailable` with the reason instead of extreme percentages.

- [ ] **Step 5: Consolidate export actions**

The Finance export menu contains Consultation CSV, Collected CSV, Daily Consultation Revenue, panel claim detail, and reconciliation detail. Remove the three independent header buttons after the menu tests pass.

- [ ] **Step 6: Run the financial regression suite**

Run: `npm test -- src/test/insight-finance-tab.test.tsx src/test/insight-finance-ledger.test.ts src/test/financial-control-components.test.tsx src/test/financial-control-lib.test.ts src/test/financial-payment-classification.test.ts src/test/dual-ledger.test.ts src/test/sales-insights.test.ts src/test/panel-billed-insights.test.ts`

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/clinic/insight/finance src/lib/clinic/insight/financeSections.ts src/components/clinic/insight/management/FinancialControlTab.tsx src/components/clinic/insight/management/FinancialSummaryStrip.tsx src/components/clinic/insight/management/FinancialAlertsTable.tsx src/pages/clinic/Insight.tsx src/test/insight-finance-tab.test.tsx src/test/insight-finance-ledger.test.ts src/test/financial-control-components.test.tsx
git commit -m "feat: organize insight finance by ledger"
```

---

### Task 5: Add the Role-Safe Performance Aggregate

**Files:**
- Create: `supabase/migrations/20260816120000_add_insight_performance_report.sql`
- Create: `supabase/tests/insight_performance.sql`
- Create: `src/lib/clinic/insight/performance.ts`
- Create: `src/hooks/clinic/useInsightPerformance.ts`
- Modify: `src/integrations/supabase/types.ts`
- Test: `src/test/insight-performance-migration.test.ts`
- Test: `src/test/insight-performance-domain.test.ts`
- Test: `src/test/use-insight-performance.test.tsx`

**Interfaces:**
- Produces RPC `public.get_insight_performance(_start_date date, _end_date date)` returning one JSON document.
- JSON contains `clinic`, `doctors`, `services`, `quality`, `confidence`, and `generated_at`.
- Doctor rows contain `doctor_id`, `doctor_name`, `completed_visits`, `unique_patients`, `rostered_hours`, `patients_per_hour`, `visit_billing`, `revenue_per_hour`, `procedures`, `documents`, and `missing_attribution`.
- Service rows contain `service_id`, `service_name`, `volume`, `unique_patients`, `revenue`, `cogs`, `profit`, `margin_pct`, `average_price`, `trend_pct`, `doctor_count`, and `missing_cost_count`.
- The server returns named doctor rows only to special/admin roles; resident output includes only the caller's doctor plus anonymized clinic benchmark; operations output has `doctors: []` and retains services.

- [ ] **Step 1: Write the migration contract test first**

Assert fixed `search_path`, date validation, maximum 365-day inclusive range, role deny for locum/guest, resident doctor identity binding, operations doctor suppression, saved quantity for billing, active-item filters, Malaysia-local visit date, and revoke/grant statements.

- [ ] **Step 2: Run the contract test and confirm RED**

Run: `npm test -- src/test/insight-performance-migration.test.ts`

Expected: FAIL because the migration and RPC do not exist.

- [ ] **Step 3: Implement the secured RPC**

Use `SECURITY DEFINER SET search_path = public, pg_temp`. Resolve the caller through `auth.uid()`, `user_roles`, `profiles`, and `doctors`; raise SQLSTATE `42501` for locum/guest or missing approved role. Aggregate only completed clinical visits; exclude deleted/cancelled consultation items and voided payments. Use saved `quantity`, not `dispensed_qty`, for authoritative billed values. Reuse the same claim/payment classifications as financial-control migrations.

- [ ] **Step 4: Add supporting indexes only after EXPLAIN evidence**

Before adding an index, run `EXPLAIN (ANALYZE, BUFFERS)` on the aggregate fixture. Add only indexes that remove a demonstrated sequential scan on bounded completed-visit, doctor, roster, or active-item predicates. Record the before/after plans in the task report.

- [ ] **Step 5: Write the executable SQL fixture**

Seed admin, resident, operations, locum, and guest identities; two doctors; roster hours; one co-payment panel visit; one self-pay visit; one deleted item; one missing-cost service. Assert exact JSON visibility and values under each role, and wrap the fixture in a transaction ending with `ROLLBACK`.

- [ ] **Step 6: Add TypeScript normalization and hook tests**

Normalize nullable numerics, preserve missing-data counters, reject malformed JSON, use query key `['insight-performance', start, end, viewerScope]`, and accept an `enabled` option.

- [ ] **Step 7: Run database and client gates**

Run: `npm test -- src/test/insight-performance-migration.test.ts src/test/insight-performance-domain.test.ts src/test/use-insight-performance.test.tsx`

Run: `npx supabase db test --linked supabase/tests/insight_performance.sql` only against the explicitly approved non-production validation project. If linked test execution is unavailable, run the approved disposable PostgreSQL/PGlite reconstruction and record the limitation; do not apply production migrations on that basis alone.

Run: `npx supabase db push --dry-run --linked`

Expected: tests PASS and dry-run lists exactly the intended pending migrations in timestamp order.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/*_add_insight_performance_report.sql supabase/tests/insight_performance.sql src/lib/clinic/insight/performance.ts src/hooks/clinic/useInsightPerformance.ts src/integrations/supabase/types.ts src/test/insight-performance-migration.test.ts src/test/insight-performance-domain.test.ts src/test/use-insight-performance.test.tsx
git commit -m "feat: add role-safe insight performance report"
```

---

### Task 6: Build the Performance Workspace

**Files:**
- Create: `src/components/clinic/insight/performance/PerformanceTab.tsx`
- Create: `src/components/clinic/insight/performance/DoctorPerformanceTable.tsx`
- Create: `src/components/clinic/insight/performance/DoctorPerformanceDetail.tsx`
- Create: `src/components/clinic/insight/performance/ServicePerformanceTable.tsx`
- Modify: `src/components/clinic/insight/DoctorClinicalActivity.tsx`
- Modify: `src/components/clinic/insight/ScoreboardsTab.tsx`
- Modify: `src/pages/clinic/Insight.tsx`
- Test: `src/test/insight-performance-tab.test.tsx`
- Test: `src/test/insight-performance-permissions.test.tsx`
- Test: `src/test/doctor-clinical-activity-component.test.tsx`

**Interfaces:**
- Consumes `InsightPerformanceReport` and `InsightAccess` from Tasks 1 and 5.
- Produces doctor table sorted by completed visits by default and service table sorted by revenue by default.
- Detail drawer route state uses `?section=performance&doctor=<uuid>` for permitted users only.

- [ ] **Step 1: Write failing role-sensitive UI tests**

Admin fixture: named doctors and financial columns visible. Resident fixture: own name visible, other doctor rows replaced by clinic benchmark. Operations fixture: doctor comparison absent, service table visible. Locum fixture: route denied before data hooks execute.

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm test -- src/test/insight-performance-tab.test.tsx src/test/insight-performance-permissions.test.tsx src/test/doctor-clinical-activity-component.test.tsx`

Expected: FAIL because Scoreboards and Leaderboards currently expose independent ranking presentations.

- [ ] **Step 3: Implement clinic KPIs and doctor table**

Show completed visits, unique patients, rostered hours, patients/hour, visit billing, and revenue/hour. Do not show an overall score or rank number. Add definition tooltips for rostered hours, attribution, and financial basis.

- [ ] **Step 4: Implement doctor detail**

Tabs inside the drawer are Workload, Financial, Clinical activity, and Quality guardrails. Reuse procedure/document details from `DoctorClinicalActivity`; make queue/visit references retain existing visit navigation.

- [ ] **Step 5: Implement service performance**

Show volume, patients, revenue, COGS, profit, margin, average price, trend, doctor count, and missing-cost warning. On mobile render summary cards plus a `View details` sheet rather than a 1,180-pixel table.

- [ ] **Step 6: Remove obsolete ranking surfaces from navigation**

Stop rendering standalone Scoreboards and Leaderboards sections in the new shell. Keep their source modules temporarily until all reused functionality and exports are covered, then remove only imports and unreachable UI in this task.

- [ ] **Step 7: Verify**

Run: `npm test -- src/test/insight-performance-tab.test.tsx src/test/insight-performance-permissions.test.tsx src/test/doctor-clinical-activity-component.test.tsx src/test/doctor-clinical-activity.test.ts src/test/scoreboards-doctor-clinical-activity.test.tsx`

Run: `npx eslint src/components/clinic/insight/performance src/components/clinic/insight/DoctorClinicalActivity.tsx src/pages/clinic/Insight.tsx`

Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/clinic/insight/performance src/components/clinic/insight/DoctorClinicalActivity.tsx src/components/clinic/insight/ScoreboardsTab.tsx src/pages/clinic/Insight.tsx src/test/insight-performance-tab.test.tsx src/test/insight-performance-permissions.test.tsx src/test/doctor-clinical-activity-component.test.tsx
git commit -m "feat: add clinic performance workspace"
```

---

### Task 7: Build Planning Around the Existing Regression Model

**Files:**
- Create: `src/components/clinic/insight/planning/PlanningTab.tsx`
- Create: `src/components/clinic/insight/planning/PlanningAttendanceSummary.tsx`
- Create: `src/components/clinic/insight/planning/DoctorCoveragePlan.tsx`
- Create: `src/components/clinic/insight/planning/OperationalCalendar.tsx`
- Modify: `src/components/clinic/dashboard/PatientAttendanceHeatmap.tsx`
- Modify: `src/components/clinic/dashboard/AttendancePeriodHeatmap.tsx`
- Modify: `src/components/clinic/dashboard/AttendanceRecommendations.tsx`
- Modify: `src/pages/clinic/Insight.tsx`
- Test: `src/test/insight-planning-tab.test.tsx`
- Test: `src/test/attendance-period-components.test.tsx`
- Test: `src/test/patient-attendance-heatmap-integration.test.tsx`

**Interfaces:**
- Consumes the existing clinical attendance RPC, regression fit, recommendation assessment, and roster data.
- Produces four period summaries keyed `08_12`, `12_16`, `16_20`, and `20_24`.
- Produces shift coverage rows keyed `S1`, `S2`, `S3` with rostered doctors, expected visits, patients/doctor-hour, confidence, and warning reason.

- [ ] **Step 1: Write failing Planning composition tests**

```tsx
expect(screen.getByRole('button', { name: /08:00.*12:00/ })).toBeVisible();
expect(screen.getByRole('button', { name: /12:00.*16:00/ })).toBeVisible();
expect(screen.getByRole('button', { name: /16:00.*20:00/ })).toBeVisible();
expect(screen.getByRole('button', { name: /20:00.*00:00/ })).toBeVisible();
await user.click(screen.getByRole('button', { name: /12:00.*16:00/ }));
expect(screen.getByRole('dialog', { name: /attendance details/i })).toBeVisible();
```

Also assert the recommendation card displays regression status, predicted attendance, uncertainty, veto reason, observed context, and model/data confidence.

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm test -- src/test/insight-planning-tab.test.tsx src/test/attendance-period-components.test.tsx src/test/patient-attendance-heatmap-integration.test.tsx`

Expected: FAIL because attendance is currently owned by Management Dashboard and is denser than the approved Planning summary.

- [ ] **Step 3: Compose the four-period summary**

Default view shows four periods by weekday with one selected detail at a time. Clicking a period opens visits, average and peak attendance, wait context, doctor coverage, and regression explanation. Keep the full hourly heatmap behind `Advanced detail`.

- [ ] **Step 4: Add doctor-hour planning**

Map roster S1/S2/S3 to their exact shift windows. Show aggregate approved OT hours/pay and aggregate locum pay only; never render individual salary. Flag under-coverage using expected visits and confidence, not a raw visit-count threshold.

- [ ] **Step 5: Add demand and calendar surfaces**

Show forecast direction and confidence. Operational Calendar displays training/off-day candidates and links to the roster editor. Add a clear link to Management Dashboard for marketing, Google review, governance, targets, and manual inputs; do not duplicate them.

- [ ] **Step 6: Verify the regression model remains authoritative**

Run: `npm test -- src/test/insight-planning-tab.test.tsx src/test/attendance-period-components.test.tsx src/test/patient-attendance-heatmap-integration.test.tsx src/test/attendance-regression.test.ts src/test/attendance-heatmap-calculations.test.ts src/test/attendance-period-analysis.test.ts`

Expected: all PASS; no UI code independently labels a day suitable for off-day without the regression assessment.

- [ ] **Step 7: Commit**

```bash
git add src/components/clinic/insight/planning src/components/clinic/dashboard/PatientAttendanceHeatmap.tsx src/components/clinic/dashboard/AttendancePeriodHeatmap.tsx src/components/clinic/dashboard/AttendanceRecommendations.tsx src/pages/clinic/Insight.tsx src/test/insight-planning-tab.test.tsx src/test/attendance-period-components.test.tsx src/test/patient-attendance-heatmap-integration.test.tsx
git commit -m "feat: add regression-led clinic planning"
```

---

### Task 8: Responsive, Accessibility, and Query-Performance Hardening

**Files:**
- Modify: `src/components/clinic/insight/InsightShell.tsx`
- Modify: `src/components/clinic/insight/command/CommandCentreTab.tsx`
- Modify: `src/components/clinic/insight/finance/FinanceTab.tsx`
- Modify: `src/components/clinic/insight/performance/PerformanceTab.tsx`
- Modify: `src/components/clinic/insight/planning/PlanningTab.tsx`
- Modify: `src/hooks/clinic/useInsightSectionData.ts`
- Modify: `src/pages/clinic/Insight.tsx`
- Test: `src/test/insight-responsive.test.tsx`
- Test: `src/test/insight-accessibility.test.tsx`
- Test: `src/test/insight-query-enablement.test.tsx`

**Interfaces:**
- All charts expose an adjacent table/list alternative and textual summary.
- Every detail sheet returns focus to its trigger.
- Inactive sections issue zero network requests on first render.

- [ ] **Step 1: Write failing mobile and accessibility tests**

At 390-pixel viewport assert no document-level horizontal overflow, four section tabs remain keyboard reachable, tables switch to cards/details, chart summaries are present, and error Retry controls have accessible names.

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm test -- src/test/insight-responsive.test.tsx src/test/insight-accessibility.test.tsx src/test/insight-query-enablement.test.tsx`

- [ ] **Step 3: Remove fixed-width page overflow**

Use component-local `overflow-x-auto` only for advanced tables, `min-w-0` on grid children, wrapping header controls, and mobile summary cards. Do not hide financial columns without a details path.

- [ ] **Step 4: Add semantic and focus behavior**

Use real headings in order, `aria-describedby` for definitions, live regions for refresh/error status, keyboard-operable tabs, and trigger focus restoration for dialogs/sheets.

- [ ] **Step 5: Measure query and render behavior**

Use React Query dev instrumentation or test spies to prove only active queries execute. Capture before/after request counts and time-to-first-section-content for a 30-day range. Investigate and fix the known management access `undefined.rest` call path if it can be reached from Planning links or shared permission refresh.

- [ ] **Step 6: Run affected tests, lint, type-check, and build**

Run: `npm test -- src/test/insight-responsive.test.tsx src/test/insight-accessibility.test.tsx src/test/insight-query-enablement.test.tsx src/test/insight-command-centre.test.tsx src/test/insight-finance-tab.test.tsx src/test/insight-performance-tab.test.tsx src/test/insight-planning-tab.test.tsx`

Run: `npm run lint:changed`

Run: `npx tsc --noEmit -p tsconfig.app.json`

Run: `npm run build`

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/clinic/insight src/hooks/clinic/useInsightSectionData.ts src/pages/clinic/Insight.tsx src/test/insight-responsive.test.tsx src/test/insight-accessibility.test.tsx src/test/insight-query-enablement.test.tsx
git commit -m "fix: harden clinic insight usability and loading"
```

---

### Task 9: Remove Legacy Navigation and Complete Release Verification

**Files:**
- Modify: `src/pages/clinic/Insight.tsx`
- Delete only if no longer imported: `src/components/clinic/insight/LeaderboardsTab.tsx`
- Delete only if no longer imported: `src/components/clinic/insight/HealthScoreCard.tsx`
- Modify: `src/test/insight-management-tab.test.tsx`
- Create: `src/test/insight-information-architecture.test.tsx`
- Create: `docs/clinic-insight-metric-definitions.md`

**Interfaces:**
- The page exposes exactly four top-level section tabs.
- The definitions document names source, date basis, formula, exclusions, owner, and confidence rule for every primary KPI.

- [ ] **Step 1: Write the final architecture regression**

```tsx
expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual([
  'Command Centre', 'Finance', 'Performance', 'Planning',
]);
expect(screen.queryByRole('tab', { name: 'Leaderboards' })).not.toBeInTheDocument();
expect(screen.queryByText(/clinic health score/i)).not.toBeInTheDocument();
```

- [ ] **Step 2: Run the test and confirm any remaining RED**

Run: `npm test -- src/test/insight-information-architecture.test.tsx src/test/insight-management-tab.test.tsx`

- [ ] **Step 3: Remove unreachable legacy presentation code**

Use `rg` before deleting. Retain any legacy component still imported by another route or test; remove only obsolete Insight navigation and unexplained composite-score UI. Update Management-tab regression to assert a link to the standalone Management Dashboard instead of an embedded tab.

- [ ] **Step 4: Write the metric definition catalogue**

For each KPI document: display label, business question, formula, authoritative query/RPC, included statuses, excluded rows, date column/timezone, update cadence, confidence downgrade conditions, and permitted audiences. Include the six distinct finance ledger values and the roster/attendance definitions.

- [ ] **Step 5: Run the complete affected suite**

Run all Insight, financial-control, dual-ledger, panel, doctor-activity, attendance, management-access, and auth tests serially:

```bash
npm test -- src/test/insight-information-architecture.test.tsx src/test/insight-*.test.ts src/test/insight-*.test.tsx src/test/financial-control-*.test.ts src/test/financial-control-*.test.tsx src/test/dual-ledger.test.ts src/test/panel-billed-insights.test.ts src/test/doctor-clinical-activity*.test.ts src/test/doctor-clinical-activity*.test.tsx src/test/attendance-*.test.ts src/test/attendance-*.test.tsx src/test/management-dashboard-access-defaults.test.ts src/test/auth-guards.test.tsx
```

Expected: all affected tests PASS.

- [ ] **Step 6: Run final repository and migration gates**

Run: `npm run lint:changed`

Run: `npx tsc --noEmit -p tsconfig.app.json`

Run: `npm run build`

Run: `git diff --check <merge-base>...HEAD`

Run: `npx supabase migration list --linked`

Run: `npx supabase db push --dry-run --linked`

Expected: changed lint, TypeScript, build, and diff checks PASS; migration history has no remote-only divergence; dry-run lists only reviewed local migrations.

- [ ] **Step 7: Perform a fresh code and security review**

Use `superpowers:requesting-code-review` and the Supabase skill. Review role leakage, SECURITY DEFINER search paths, resident doctor identity binding, operations anonymization, financial classification, query paging, active-item filters, URL state, error false-states, and mobile overflow. Resolve every Critical/Important finding and rerun its focused regressions.

- [ ] **Step 8: Commit release cleanup**

```bash
git add src/pages/clinic/Insight.tsx src/components/clinic/insight src/test/insight-management-tab.test.tsx src/test/insight-information-architecture.test.tsx docs/clinic-insight-metric-definitions.md
git commit -m "docs: finalize clinic insight workspace"
```

---

### Task 10: Stage, Deploy, and Canary the Insight Redesign

**Files:**
- No new product files unless canary fixes are required.
- Record verification evidence in the implementation task report created by the execution workflow.

**Interfaces:**
- Deployment order is database migration, production build/GitHub Pages, cache refresh, then role-based canary.
- Rollback is application rollback first; additive RPC remains harmless and can be removed only by a separately reviewed migration.

- [ ] **Step 1: Back up and validate the approved non-production Supabase project**

Store schema/data backup artifacts in the user-approved Downloads backup folder with project reference and UTC timestamp. Verify the backup is non-empty and record checksums. Do not expose tokens in logs or commits.

- [ ] **Step 2: Apply migration to the approved validation project**

Run the migration, executable SQL fixture, and role-specific RPC calls. Confirm admin, resident, operations, locum, and guest behavior exactly matches Task 5.

- [ ] **Step 3: Run browser QA on the validation build**

Check four sections at desktop and 390-pixel mobile widths for doctor_admin, resident_doctor, operations, locum, and guest. Verify URL restoration, active-only queries, exports, deep links, empty/error states, named-doctor restrictions, and no console errors.

- [ ] **Step 4: Obtain explicit production deployment approval**

Present migration list, backup evidence, test/build results, review verdict, validation screenshots, and rollback instructions. Do not apply production migrations or push `main` before approval.

- [ ] **Step 5: Deploy in order**

Apply the reviewed Supabase migration to the main project, verify the RPC/schema cache, push the reviewed commit to `main`, and watch Security Gate and Deploy GitHub Pages to completion.

- [ ] **Step 6: Run production canary**

For 30 minutes, verify `/clinic/insight` HTTP availability, browser console, RPC error rate, section load latency, four role policies, financial reconciliation, one doctor detail, one service detail, one planning recommendation, and all CSV exports. Use the `canary` skill and stop/rollback on role leakage, financial mismatch, repeated RPC timeout, or page-level unavailability.

- [ ] **Step 7: Close deployment**

Record deployed commit, migration version, workflow URLs, production checks, known limitations, and rollback status. Do not claim full functionality if any external database fixture or role canary remains unverified.

---

## Self-Review Record

- **Spec coverage:** All approved sections, permissions, financial identities, doctor/service performance, attendance periods, regression explanation, management boundary, responsive behavior, data confidence, exports, and deployment gates map to Tasks 1–10.
- **Boundary check:** Marketing, Google reputation, governance, revenue/stock targets, and manual monthly inputs remain in Management Dashboard; Planning links there and does not duplicate those controls.
- **Type consistency:** `InsightSection`, `InsightAccess`, `DataConfidence`, `InsightPerformanceReport`, finance ledger names, period keys, and shift keys are defined before consumers.
- **Placeholder scan:** No `TBD`, `TODO`, generic error-handling instruction, undefined interface, or deferred implementation behavior remains. The migration uses the explicit candidate version `20260816120000` with a collision-stop rule.
- **Release safety:** No production mutation occurs until linked dry-run, executable role fixture, code/security review, validation-project QA, backup verification, and explicit approval are complete.
