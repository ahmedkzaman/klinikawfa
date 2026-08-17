# Task 7 — Regression-led Clinic Planning report

## Status

DONE

## Summary

- Added the Planning tab as the Insight destination for regression-led attendance planning.
- Added Planning composition components:
  - `PlanningTab`
  - `PlanningAttendanceSummary`
  - `DoctorCoveragePlan`
  - `OperationalCalendar`
- Preserved the approved four patient-attendance periods:
  - `08:00-12:00`
  - `12:00-16:00`
  - `16:00-20:00`
  - `20:00-00:00`
- Kept hourly heatmap and full recommendation diagnostics behind `Advanced detail`.
- Added period click-through to `Attendance details`.
- Added aggregate doctor coverage rows for S1, S2, and S3 without exposing individual salary.
- Linked operational follow-up to the roster editor and Management Dashboard instead of duplicating management inputs.

## Files changed

- `src/components/clinic/insight/planning/PlanningTab.tsx`
- `src/components/clinic/insight/planning/PlanningAttendanceSummary.tsx`
- `src/components/clinic/insight/planning/DoctorCoveragePlan.tsx`
- `src/components/clinic/insight/planning/OperationalCalendar.tsx`
- `src/components/clinic/insight/planning/coverageMath.ts`
- `src/components/clinic/dashboard/PatientAttendanceHeatmap.tsx`
- `src/components/clinic/dashboard/AttendancePeriodHeatmap.tsx`
- `src/components/clinic/dashboard/AttendancePeriodDetails.tsx`
- `src/components/clinic/dashboard/AttendanceRecommendations.tsx`
- `src/pages/clinic/Insight.tsx`
- `src/test/insight-planning-tab.test.tsx`
- `src/test/attendance-period-components.test.tsx`
- `src/test/patient-attendance-heatmap-integration.test.tsx`
- `src/test/patient-attendance-heatmap.test.tsx`
- `src/test/insight-query-enablement.test.tsx`
- `src/test/insight-command-navigation.test.tsx`

## TDD RED → GREEN

The initial RED command was:

```text
npm test -- src/test/insight-planning-tab.test.tsx src/test/attendance-period-components.test.tsx src/test/patient-attendance-heatmap-integration.test.tsx
Test Files 3 failed (3)
Tests 4 failed | 1 passed (5)
```

The expected causes were missing Planning composition, legacy period labels, and the old detailed-analysis disclosure. A later coverage-math regression test also failed with `averageShiftExpectedVisits is not a function` before its minimal implementation.

## Verification

Command:

```bash
npm test -- src/test/insight-planning-tab.test.tsx src/test/attendance-period-components.test.tsx src/test/patient-attendance-heatmap-integration.test.tsx src/test/attendance-regression.test.ts src/test/attendance-heatmap-calculations.test.ts src/test/attendance-period-analysis.test.ts
```

Result:

- 6 files passed
- 66 tests passed

Final fresh command:

```text
npm test -- src/test/insight-planning-tab.test.tsx src/test/attendance-period-components.test.tsx src/test/patient-attendance-heatmap-integration.test.tsx src/test/attendance-regression.test.ts src/test/attendance-heatmap-calculations.test.ts src/test/attendance-period-analysis.test.ts src/test/insight-query-enablement.test.tsx src/test/insight-command-navigation.test.tsx src/test/patient-attendance-heatmap.test.tsx
Test Files 9 passed (9)
Tests 95 passed (95)
```

Command:

```bash
npx eslint src/components/clinic/insight/planning/PlanningTab.tsx src/components/clinic/insight/planning/PlanningAttendanceSummary.tsx src/components/clinic/insight/planning/DoctorCoveragePlan.tsx src/components/clinic/insight/planning/OperationalCalendar.tsx src/components/clinic/dashboard/AttendancePeriodDetails.tsx src/components/clinic/dashboard/AttendancePeriodHeatmap.tsx src/components/clinic/dashboard/AttendanceRecommendations.tsx src/components/clinic/dashboard/PatientAttendanceHeatmap.tsx src/pages/clinic/Insight.tsx src/test/insight-planning-tab.test.tsx src/test/attendance-period-components.test.tsx src/test/patient-attendance-heatmap-integration.test.tsx
```

Result:

- 0 errors, 0 warnings

Also verified: `npx tsc --noEmit` and `git diff --check` both exited 0.

## Authoritative-source decisions

- Planning calls `useAttendanceHeatmap` only with `permissionDomain: 'insight'`; it has no raw Supabase fetch and does not invoke the management RPC.
- Regression fitting, `assessDoctorOffDays`, and `buildAttendancePeriodAnalysis` remain the exclusive sources for forecasts, suitability, confidence, veto reasons, and under-coverage warnings. No UI computes an off-day or training candidate itself.
- S1 (`08:00–13:00`), S2 (`14:00–19:00`), and S3 (`20:00–00:00`) use average daily regression demand and aggregate rostered-doctor observations. No raw visit-count staffing threshold is used.
- Individual salary, rates, and pay are never fetched or rendered. OT and locum remuneration remain aggregate-only management inputs, linked rather than duplicated. Valuation remains in Finance Advanced.

## Accessibility and responsive behavior

- The period cells are native buttons with descriptive 24-hour names and open a labelled `Attendance details` dialog.
- The regression card is a named region; coverage is a semantic table; the advanced disclosure remains keyboard-operable.
- The heatmap and coverage table scroll horizontally at narrow widths, while summary/calendar grids collapse responsively.

## Concerns

- `npm run lint:changed` cannot calculate `origin/main...HEAD` in this isolated branch because there is no merge base; direct ESLint across every changed file passed cleanly.
- The secured attendance report provides aggregate rostered-doctor counts and an attendance-scope doctor list, not per-shift named assignments or payroll aggregates. Planning labels this boundary and links to the authoritative roster/management surfaces instead of fabricating data.
- No migration, Supabase push, or deployment was performed.

## Fix Round 1

Review findings addressed:

- Replaced old period keys with the approved contract keys: `08_12`, `12_16`, `16_20`, and `20_24`.
- Added `averageShiftExpectedVisits()` and wired S1/S2/S3 coverage to average daily regression demand, so shift expected visits do not become unavailable when the forecast contains all seven weekdays.
- Aligned Command Centre compact attendance keys with the same contract.

Fresh verification:

```text
npm test -- src/test/insight-planning-tab.test.tsx src/test/attendance-period-components.test.tsx src/test/patient-attendance-heatmap-integration.test.tsx src/test/attendance-regression.test.ts src/test/attendance-heatmap-calculations.test.ts src/test/attendance-period-analysis.test.ts src/test/insight-command-centre.test.tsx
Test Files 7 passed (7)
Tests 72 passed (72)
```

```text
npx eslint src/lib/clinic/attendancePeriodAnalysis.ts src/lib/clinic/insight/commandCentre.ts src/components/clinic/insight/planning/coverageMath.ts src/components/clinic/insight/planning/DoctorCoveragePlan.tsx src/components/clinic/dashboard/AttendanceDecisionCards.tsx src/test/insight-planning-tab.test.tsx src/test/attendance-period-analysis.test.ts src/test/attendance-period-components.test.tsx src/test/insight-command-centre.test.tsx
0 errors
```
