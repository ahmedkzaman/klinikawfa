# Task 5 Report: Alerts, Margin Analysis, And Visit-Level Drill-Down

## RED Evidence

Command:

```powershell
npm.cmd test -- src/test/financial-control-components.test.tsx
```

Observed result: exit code 1. Vitest collected 16 tests; the 10 existing Task 4
tests passed and all 6 new Task 5 interaction tests failed. The failures were the
expected missing behaviors: no alerts table, no alert View action, no detail sheet,
no grouping or pagination controls, no detail loading/empty/error state, and no
visit or billing links.

## Implementation Summary

- Added an urgency-ordered alert table for all ten server alert keys. Sorting uses
  severity, amount descending, oldest age descending, and stable alert key.
- Added text-and-icon severity indicators, count, amount at risk, oldest age, and
  an accessible View action for every alert.
- Wired KPI selections and alert actions to a non-modal financial detail sheet so
  Task 4 summary and reconciliation content remains mounted and accessible while
  detail data loads, is empty, or fails.
- Added visit-level detail rows for non-margin metrics and alerts, plus margin
  grouping switches for medicine, procedure/service, package, doctor, payment
  type, and panel provider using the exact server enum values.
- Added fixed-width Previous and Next controls, disabled boundaries, page counts,
  and page sizes of 25, 50, or 100. Metric, alert, group, and page-size changes reset
  the page to 1.
- Rendered only typed financial-management fields and omitted links when a row has
  no queue entry. Visit and bill links use the exact existing destinations.
- Kept detail loading, zero-row, and error states inside the sheet. No summary retry,
  detail retry, CSV export, BOM/formula handling, or other Task 6 behavior was added.

## GREEN Verification

```powershell
npm.cmd test -- src/test/financial-control-components.test.tsx
```

Exit code 0. One test file passed; 16 tests passed; 0 failed. Vitest duration:
12.39s.

```powershell
npx.cmd eslint src/components/clinic/insight/management src/test/financial-control-components.test.tsx
```

Exit code 0. No lint errors or warnings.

```powershell
npx.cmd tsc --noEmit
```

Exit code 0. No TypeScript errors.

```powershell
npm.cmd run build
```

Exit code 0. Vite transformed 5,306 modules and completed the production build in
12.14s.

```powershell
git diff --cached --check
```

Exit code 0 before the implementation commit. No whitespace errors.

## Fix Round 1 RED/GREEN

### RED

The two review regressions were run against the pre-fix Task 5 production code while
keeping the new tests in place:

```powershell
npm.cmd test -- src/test/financial-control-components.test.tsx
```

Exit code 1. Vitest ran 18 tests: 16 passed and the 2 review regressions failed for
the expected reasons. The changed date range continued to request page 2 instead of
page 1, and closing the KPI detail sheet did not return focus to its launcher.

The consolidated KPI trigger callback was also verified test-first:

```powershell
npm.cmd test -- src/test/financial-control-components.test.tsx -t "emits the exact metric"
```

Exit code 1. The callback received the metric but not the exact button element.

### GREEN

- Date-range identity is tracked alongside pagination. A range change immediately
  supplies page 1 to the detail query, and an effect synchronizes the stored page
  without setting state during render.
- KPI and alert launcher callbacks each require and pass their exact button element.
  The parent stores that single trigger reference and restores focus after either the
  close button or Escape closes the sheet. No duplicate trigger callback remains.

```powershell
npm.cmd test -- src/test/financial-control-components.test.tsx
```

Exit code 0. One test file passed; 18 tests passed; 0 failed. Vitest test duration:
3.59s.

```powershell
npx.cmd eslint src/components/clinic/insight/management src/test/financial-control-components.test.tsx
```

Exit code 0. No lint errors or warnings.

```powershell
npx.cmd tsc --noEmit
```

Exit code 0. No TypeScript errors.

```powershell
npm.cmd run build
```

Exit code 0. Vite transformed 5,306 modules and completed the production build in
11.19s. Existing Browserslist, dependency, dynamic-import, chunk-size, and plugin
timing warnings remain.

## Changed Files

- `src/components/clinic/insight/management/FinancialAlertsTable.tsx`
- `src/components/clinic/insight/management/FinancialMarginTable.tsx`
- `src/components/clinic/insight/management/FinancialDetailSheet.tsx`
- `src/components/clinic/insight/management/FinancialControlTab.tsx`
- `src/test/financial-control-components.test.tsx`
- `.superpowers/sdd/2026-08-03-financial-control-management-deep-dive/task-5-report.md`

## Self-Review

- Confirmed the alert comparator catches mutations to severity, amount, age, or key
  ordering and does not mutate the server response.
- Confirmed alert and non-margin KPI details use visit grouping, while Gross Margin
  starts at medicine and exposes only the six approved analytical groupings.
- Confirmed all query state is passed through the typed detail hook, page size never
  exceeds 100, and Previous/Next cannot cross a boundary.
- Confirmed the summary and reconciliation are not replaced by detail loading,
  empty, or error states; detail failures stay in the sheet.
- Confirmed visit and bill links are derived only from `queueEntryId`, URL encoding is
  applied to the query value, and no links render without a queue entry.
- Confirmed enriched test rows containing clinical notes, diagnoses, and attachments
  do not expose those fields, and no consultation-note hook or fetch was introduced.
- Confirmed controls have accessible names, pressed/disabled state where applicable,
  visible focus styles, fixed pagination dimensions, and mobile-safe horizontal table
  scrolling.
- Confirmed new framed elements use at most 8px radius, severity is not color-only,
  and no nested cards, decorative gradients, or viewport-scaled typography were added.
- Confirmed the implementation commit contains only the five Task 5 source/test files.

## Concerns

- The production build retains existing repository warnings for stale Browserslist
  data, `face-api.js` browser externalization, CommonJS use in `dashjs`, large chunks,
  ineffective dynamic imports, and plugin timings.
- Responsive and keyboard behavior was reviewed through rendered interaction tests,
  semantic markup, and breakpoint/focus classes. No authenticated live browser
  fixture was available for a screenshot pass.
- The full repository suite was not run. The requested focused test file, scoped
  lint, type-check, and production build all completed successfully.

## Commit SHA

Implementation and tests commit: `ed4a54e6123867b55e8f321e62474e6b5f711f96`
