## Task 8 Report - Responsive, Accessibility, and Query-Performance Hardening

Date: 2026-08-17

### Summary

- Added RED-first coverage in `src/test/insight-responsive.test.tsx` and `src/test/insight-accessibility.test.tsx`.
- Kept top-level sections as Command Centre, Finance, Performance, Planning and wrapped the shell tablist on mobile instead of relying on document-level horizontal scrolling.
- Added explicit live-region behavior and fallback retry names in `InsightState`.
- Added focus restoration for Finance collection detail sheets.
- Added mobile service-card detail paths and clearer mobile revenue text.
- Added a Planning text alternative adjacent to the attendance period heatmap.
- Formatted Planning operational period ids such as `12_16` as readable ranges like `12:00-16:00`.

### RED Evidence

Command:

```bash
npm test -- src/test/insight-responsive.test.tsx src/test/insight-accessibility.test.tsx src/test/insight-query-enablement.test.tsx
```

Result: failed as expected before implementation.

Expected failures:

- Missing `data-insight-shell` / mobile shell wrapping contract.
- Missing service mobile card test id and mobile-specific detail label.
- Retry fallback label was `Retry insights` instead of source-specific text.
- Collection sheet did not restore focus to its trigger.
- Operational calendar exposed raw period ids like `12_16`.

### Verification Evidence

Command:

```bash
npm test -- src/test/insight-responsive.test.tsx src/test/insight-accessibility.test.tsx src/test/insight-query-enablement.test.tsx src/test/insight-command-centre.test.tsx src/test/insight-finance-tab.test.tsx src/test/insight-performance-tab.test.tsx src/test/insight-planning-tab.test.tsx
```

Result: PASS, 7 files / 40 tests.

Command:

```bash
npx eslint src/components/clinic/insight/InsightShell.tsx src/components/clinic/insight/shared/InsightState.tsx src/components/clinic/insight/finance/CollectionDetailSheet.tsx src/components/clinic/insight/performance/ServicePerformanceTable.tsx src/components/clinic/insight/planning/OperationalCalendar.tsx src/components/clinic/insight/planning/PlanningAttendanceSummary.tsx src/test/insight-responsive.test.tsx src/test/insight-accessibility.test.tsx src/test/insight-finance-tab.test.tsx src/test/insight-performance-tab.test.tsx
```

Result: PASS.

Command:

```bash
npm run lint:changed
```

Result: failed before linting because Git reported `fatal: origin/main...HEAD: no merge base`.

Command:

```bash
npx tsc --noEmit -p tsconfig.app.json
```

Result: failed on existing project-wide type errors outside the Task 8 implementation, including `RichTextEditor.tsx`, website CMS/home components, Supabase RPC typing, `replaceAll` lib-target errors, and several existing tests. Task 8 fixture type issues found during the first run were corrected.

Command:

```bash
npm run build
```

Result: PASS. Vite emitted existing warnings about native config loading, browser externalization of `fs` from `face-api.js`, large chunks, and ineffective dynamic imports.

### Concerns

- `npm run lint:changed` cannot currently run on this branch because there is no merge base with `origin/main`.
- Full `tsc --noEmit -p tsconfig.app.json` remains blocked by broad pre-existing type debt outside this task.

## Review fix round - 2026-08-17

Addressed Task 8 review findings:
- Restored keyboard focus to Service Performance detail triggers after sheet close by capturing the clicked trigger before opening the controlled sheet.
- Restored keyboard focus to Doctor Performance detail trigger after sheet close.
- Added an adjacent readable hourly text summary for the advanced attendance heatmap.
- Corrected active-section refresh query prefixes for Finance, Performance detail, and Planning attendance heatmap.

Verification:
- `npm test -- src/test/insight-accessibility.test.tsx src/test/insight-query-enablement.test.tsx` — PASS, 2 files / 17 tests.
- `npm test -- src/test/insight-responsive.test.tsx src/test/insight-accessibility.test.tsx src/test/insight-query-enablement.test.tsx src/test/insight-command-centre.test.tsx src/test/insight-finance-tab.test.tsx src/test/insight-performance-tab.test.tsx src/test/insight-planning-tab.test.tsx` — PASS, 7 files / 45 tests.
- `npx eslint src/components/clinic/insight/performance/ServicePerformanceTable.tsx src/components/clinic/insight/performance/DoctorPerformanceDetail.tsx src/components/clinic/insight/planning/PlanningAttendanceSummary.tsx src/hooks/clinic/useInsightSectionData.ts src/test/insight-accessibility.test.tsx src/test/insight-query-enablement.test.tsx` — PASS.
- `npm run build` — PASS.
- `git diff --check` — PASS.
