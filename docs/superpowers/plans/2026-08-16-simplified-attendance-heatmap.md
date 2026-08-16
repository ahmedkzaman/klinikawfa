# Simplified Attendance Heatmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the default 112-cell attendance display with three regression-backed decision cards and a clickable 7-day by 4-period heatmap while retaining the existing hourly analysis under progressive disclosure.

**Architecture:** Add one pure presentation-analysis module that consumes the existing `AttendanceRegressionResult`, `AttendanceHeatmapCell[]`, and `DoctorOffDayAssessment[]`. It aggregates hourly forecasts into four fixed periods, applies the existing safety evidence to training and peak decisions, and returns presentation-ready summaries. Small UI components render the cards, compact grid, and period details; `PatientAttendanceHeatmap` continues to own fetching and fits the regression exactly once.

**Tech Stack:** React 18, TypeScript, TanStack Query data already returned by `useAttendanceHeatmap`, Vitest, Testing Library, Tailwind CSS, existing shadcn Card/Dialog/Collapsible components.

## Global Constraints

- Periods are exactly 08:00–12:00, 12:00–16:00, 16:00–20:00, and 20:00–00:00 in `Asia/Kuala_Lumpur`.
- All default cards, period values, traffic rankings, and recommendations are derived from the existing regression output.
- Doctor off-day assessment retains every existing weekday and hourly safety veto.
- A training period is eligible only when every included operating hour passes coverage, sample-size, waiting-time, uncertainty, observed-peak, and selected-doctor backup checks.
- The attendance RPC, clinical-visit definition, regression family, and existing thresholds are unchanged.
- The model is fitted once per selected date range and doctor; opening details or advanced analysis must not refit it.
- The full hourly heatmap and model evidence remain available under `View detailed analysis`.
- No roster, leave, training schedule, or clinic-hours record is changed automatically.

---

## File Structure

- Create `src/lib/clinic/attendancePeriodAnalysis.ts`: fixed period definitions, forecast aggregation, confidence/traffic classification, and three decision summaries.
- Create `src/components/clinic/dashboard/AttendanceDecisionCards.tsx`: compact off-day, training, and peak cards.
- Create `src/components/clinic/dashboard/AttendancePeriodHeatmap.tsx`: accessible 7-by-4 period grid.
- Create `src/components/clinic/dashboard/AttendancePeriodDetails.tsx`: clicked-period hourly forecast and observed evidence dialog.
- Create `src/components/clinic/dashboard/AttendanceHourlyHeatmap.tsx`: extracted current 16-hour grid used only inside advanced analysis.
- Modify `src/components/clinic/dashboard/PatientAttendanceHeatmap.tsx`: compute the pure period analysis once, render the simplified default, and place existing details under progressive disclosure.
- Preserve `src/components/clinic/dashboard/AttendanceRecommendations.tsx` unchanged as the detailed recommendation evidence inside the advanced section.
- Test `src/test/attendance-period-analysis.test.ts`: pure aggregation and decision rules.
- Modify `src/test/patient-attendance-heatmap.test.tsx`: default/simple UI, click details, progressive disclosure, failure states, and one-fit behavior.
- Modify `src/test/patient-attendance-heatmap-integration.test.tsx`: real regression-to-period-to-render flow.

---

### Task 1: Regression Period Aggregation

**Files:**
- Create: `src/lib/clinic/attendancePeriodAnalysis.ts`
- Test: `src/test/attendance-period-analysis.test.ts`

**Interfaces:**
- Consumes: `AttendanceRegressionResult`, `AttendanceHourlyForecast`, `AttendanceHeatmapCell`, and `DoctorOffDayAssessment`.
- Produces: `ATTENDANCE_PERIODS`, `AttendancePeriodSummary`, `AttendanceDecisionSummary`, and `buildAttendancePeriodAnalysis(input)`.

- [ ] **Step 1: Write failing boundary and aggregation tests**

Create fixtures with one ready hourly forecast for each hour 08–23 and matching complete heatmap cells. Assert exact membership:

```ts
expect(ATTENDANCE_PERIODS.map(period => [period.id, period.startHour, period.endHour])).toEqual([
  ['morning', 8, 12],
  ['afternoon', 12, 16],
  ['evening', 16, 20],
  ['night', 20, 24],
]);

const mondayMorning = result.periods.find(period => period.weekday === 1 && period.periodId === 'morning');
expect(mondayMorning?.hourly.map(item => item.forecast.hour)).toEqual([8, 9, 10, 11]);
expect(mondayMorning).toMatchObject({ expectedVisits: 10, lowerPrediction: 6, upperPrediction: 14 });
```

Also assert that hour 12 belongs only to `afternoon`, hour 16 only to `evening`, hour 20 only to `night`, and hour 23 is included in `night`.

- [ ] **Step 2: Run the pure test and confirm RED**

Run:

```powershell
npm test -- src/test/attendance-period-analysis.test.ts --run --reporter=dot
```

Expected: FAIL because `attendancePeriodAnalysis` does not exist.

- [ ] **Step 3: Implement fixed definitions and typed aggregation**

Create these public types and constants:

```ts
export const ATTENDANCE_PERIODS = [
  { id: 'morning', label: '8am–12pm', startHour: 8, endHour: 12 },
  { id: 'afternoon', label: '12pm–4pm', startHour: 12, endHour: 16 },
  { id: 'evening', label: '4pm–8pm', startHour: 16, endHour: 20 },
  { id: 'night', label: '8pm–12 midnight', startHour: 20, endHour: 24 },
] as const;

export type AttendancePeriodId = typeof ATTENDANCE_PERIODS[number]['id'];
export type AttendanceConfidence = 'high' | 'moderate' | 'insufficient';
export type AttendanceTrafficLevel = 'low' | 'moderate' | 'high' | 'unavailable';

export type AttendancePeriodSummary = {
  weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  periodId: AttendancePeriodId;
  label: string;
  startHour: number;
  endHour: number;
  status: 'ready' | 'closed' | 'uncovered' | 'insufficient' | 'unavailable';
  expectedVisits: number | null;
  lowerPrediction: number | null;
  upperPrediction: number | null;
  trafficLevel: AttendanceTrafficLevel;
  confidence: AttendanceConfidence;
  safeForTraining: boolean;
  safetyReasons: string[];
  hourly: Array<{ forecast: AttendanceHourlyForecast; cell: AttendanceHeatmapCell | null }>;
};
```

Implement `buildAttendancePeriodAnalysis` so it:

1. Returns 28 summaries in weekday order, then period order.
2. Sums `expectedVisits`, `lowerPrediction`, and `upperPrediction` across the four hourly forecasts.
3. Classifies Low at or below the 25th percentile, High at or above the 75th percentile, and Moderate otherwise across ready period totals.
4. Marks uncovered if any constituent hour is uncovered, insufficient if any hour has fewer than eight operating occurrences or incomplete coverage, and unavailable when regression is unavailable or a forecast hour is missing.
5. Calculates High confidence only when usable weeks are at least 24, every hour has at least 12 operating occurrences, and `(upper-lower)/max(expected,1) <= 1`; otherwise an eligible period is Moderate.

- [ ] **Step 4: Run Task 1 tests and confirm GREEN**

Run the pure test again and expect all boundary, sum, status, traffic, and confidence assertions to pass.

- [ ] **Step 5: Commit Task 1**

```powershell
git add src/lib/clinic/attendancePeriodAnalysis.ts src/test/attendance-period-analysis.test.ts
git commit -m "feat: aggregate attendance regression periods"
```

---

### Task 2: Regression-Backed Decision Summaries

**Files:**
- Modify: `src/lib/clinic/attendancePeriodAnalysis.ts`
- Modify: `src/test/attendance-period-analysis.test.ts`

**Interfaces:**
- Consumes: the 28 period summaries plus the existing `DoctorOffDayAssessment[]`.
- Produces: `AttendanceDecisionSummary` in the result of `buildAttendancePeriodAnalysis`.

- [ ] **Step 1: Write failing decision tests**

Test all three decisions:

```ts
expect(result.decisions.offDay).toMatchObject({ status: 'ready', weekday: 2 });
expect(result.decisions.training).toMatchObject({ status: 'ready', weekday: 3, periodId: 'afternoon' });
expect(result.decisions.peak).toMatchObject({ status: 'ready', weekday: 6, periodId: 'evening' });
```

Add rejection cases proving:

- A low expected training period is rejected if one hour has average wait over 45 minutes.
- It is rejected if one hourly upper bound reaches the existing 75th-percentile predicted busy threshold.
- It is rejected if one observed hourly peak reaches the 75th-percentile observed-peak threshold.
- It is rejected if any hour has fewer than eight operating occurrences.
- With a selected doctor, it is rejected unless `otherDoctorCoveredOccurrences === operatingOccurrences` for every hour.
- Peak selects the largest period total, not the largest individual hour.
- Off-day returns the first lowest-score `suggested` assessment without recomputing or weakening it.
- No safe candidate yields `No safe training window` or `No safe off-day recommendation` status.

- [ ] **Step 2: Run the decision tests and confirm RED**

Run the pure test. Expected: failures for missing decision outputs and safety reasons.

- [ ] **Step 3: Implement deterministic decisions**

Use the ready hourly forecasts and cells to calculate:

```ts
export type AttendanceDecision = {
  status: 'ready' | 'none' | 'unavailable';
  title: string;
  weekday: AttendancePeriodSummary['weekday'] | null;
  periodId: AttendancePeriodId | null;
  expectedVisits: number | null;
  lowerPrediction: number | null;
  upperPrediction: number | null;
  confidence: AttendanceConfidence;
  reason: string;
};

export type AttendanceDecisionSummary = {
  offDay: AttendanceDecision;
  training: AttendanceDecision;
  peak: AttendanceDecision;
};
```

Training candidate rules must reuse the existing constants semantically: eight comparable occurrences, no wait above 45 minutes, every hourly upper bound below the global 75th-percentile expected-hour threshold, every observed peak below the global 75th-percentile observed-peak threshold, complete coverage, finite predictions, and 100% backup coverage when a doctor is selected. Sort safe candidates by `expectedVisits`, then `upperPrediction`, weekday, and period order.

Peak staffing chooses the ready period with the largest expected total and uses observed waiting/peak warnings as its concise reason. Off-day consumes only existing assessments and selects the lowest safety score already marked `suggested`.

- [ ] **Step 4: Run the pure suite and confirm GREEN**

Run:

```powershell
npm test -- src/test/attendance-period-analysis.test.ts src/test/attendance-heatmap-calculations.test.ts --run --reporter=dot
```

Expected: new decision tests pass and the existing off-day safety suite is unchanged.

- [ ] **Step 5: Commit Task 2**

```powershell
git add src/lib/clinic/attendancePeriodAnalysis.ts src/test/attendance-period-analysis.test.ts
git commit -m "feat: summarize attendance decisions"
```

---

### Task 3: Compact Decision Cards and Period Grid

**Files:**
- Create: `src/components/clinic/dashboard/AttendanceDecisionCards.tsx`
- Create: `src/components/clinic/dashboard/AttendancePeriodHeatmap.tsx`
- Create: `src/components/clinic/dashboard/AttendancePeriodDetails.tsx`
- Modify: `src/test/patient-attendance-heatmap.test.tsx`

**Interfaces:**
- Consumes: `AttendanceDecisionSummary`, `AttendancePeriodSummary[]`, and `onSelectPeriod(summary)`.
- Produces: accessible compact components with no data fetching or model fitting.

- [ ] **Step 1: Write failing component behavior tests**

Add tests that render `PatientAttendanceHeatmap` and assert:

```ts
expect(screen.getByText('Possible doctor off-day')).toBeInTheDocument();
expect(screen.getByText('Best training window')).toBeInTheDocument();
expect(screen.getByText('Peak staffing period')).toBeInTheDocument();
expect(screen.getByLabelText('Compact attendance period heatmap')).toBeInTheDocument();
expect(screen.getByRole('button', { name: /Monday 8am–12pm/i })).toBeInTheDocument();
expect(screen.queryByText('08:00–09:00')).not.toBeInTheDocument();
```

Click a period and assert the dialog lists each constituent hour with predicted attendance, range, observed average/median/peak, recent trend, wait, roster coverage, and safety reasons. Assert labels include Low/Moderate/High text so colour is not the only signal.

- [ ] **Step 2: Run the UI test and confirm RED**

Run:

```powershell
npm test -- src/test/patient-attendance-heatmap.test.tsx --run --reporter=dot
```

Expected: missing cards, compact grid, and period details.

- [ ] **Step 3: Implement the three presentational components**

`AttendanceDecisionCards` renders a three-card responsive grid. Every card includes title, decision, predicted value/range, confidence badge, and one reason. `none` and `unavailable` states retain their exact safe wording.

`AttendancePeriodHeatmap` renders weekdays as rows and the four periods as columns to produce 28 buttons. Use traffic-level classes but also render the traffic word:

```tsx
<button aria-label={`${day} ${period.label}: ${trafficLabel}, predicted ${expectedLabel} visits`}>
  <span>{expectedLabel}</span>
  <span>{trafficLabel}</span>
</button>
```

`AttendancePeriodDetails` uses the existing Dialog primitives and lists the period aggregate first, followed by the four hourly entries. It accepts only aggregate data and never shows patient identifiers.

- [ ] **Step 4: Run the component tests and confirm GREEN**

Run the focused UI test and explicit ESLint on the three new components.

- [ ] **Step 5: Commit Task 3**

```powershell
git add src/components/clinic/dashboard/AttendanceDecisionCards.tsx src/components/clinic/dashboard/AttendancePeriodHeatmap.tsx src/components/clinic/dashboard/AttendancePeriodDetails.tsx src/test/patient-attendance-heatmap.test.tsx
git commit -m "feat: add compact attendance decision view"
```

---

### Task 4: Progressive Disclosure and Page Integration

**Files:**
- Create: `src/components/clinic/dashboard/AttendanceHourlyHeatmap.tsx`
- Modify: `src/components/clinic/dashboard/PatientAttendanceHeatmap.tsx`
- Modify: `src/test/patient-attendance-heatmap.test.tsx`

**Interfaces:**
- Consumes: the Task 1/2 pure analysis and Task 3 components.
- Produces: the final default-simple dashboard with existing detailed analysis preserved.

- [ ] **Step 1: Write failing progressive-disclosure tests**

Assert that the full hourly grid, complete safety checks, unstable-period list, and model diagnostics are absent initially. Click `View detailed analysis` and assert they appear. Click a compact period, close the dialog, toggle advanced analysis, and assert `fitAttendanceRegression` remains called exactly once.

Add an unavailable-model test: the three decision cards show unavailable/no-safe states, the compact grid clearly shows unavailable, and opening advanced analysis still shows the descriptive hourly heatmap.

- [ ] **Step 2: Run the UI test and confirm RED**

Expected: existing hourly content remains visible by default and no advanced disclosure exists.

- [ ] **Step 3: Extract the hourly grid without changing behaviour**

Move the current `hours`, `timeRange`, `cellStatus`, `statusText`, and colour rendering into `AttendanceHourlyHeatmap`. Its interface is:

```ts
export function AttendanceHourlyHeatmap(props: {
  cells: AttendanceHeatmapCell[];
  onSelectCell: (cell: AttendanceHeatmapCell) => void;
}): JSX.Element;
```

Preserve existing accessible labels, coverage states, wait alerts, and cell click behavior.

- [ ] **Step 4: Integrate the simple and advanced views**

In `PatientAttendanceHeatmap`, keep the existing `useAttendanceHeatmap`, `fitAttendanceRegression`, and `assessDoctorOffDays` memos. Add exactly one memo:

```ts
const periodAnalysis = useMemo(() => buildAttendancePeriodAnalysis({
  regression,
  cells,
  offDayAssessments,
  selectedDoctorId: doctorId,
}), [regression, cells, offDayAssessments, doctorId]);
```

Render order:

1. Existing filters and warnings.
2. Three decision cards.
3. Compact 7-by-4 period heatmap.
4. `View detailed analysis` collapsed control.
5. Inside the control: existing legend, full hourly heatmap, full `AttendanceRecommendations`, and model diagnostics.
6. Period dialog and existing hourly-cell dialog.

Keep `AttendanceRecommendations` unchanged as the detailed evidence component. Its `Recommendations` heading appears only after `View detailed analysis` is expanded, so it does not duplicate the default decision-card titles.

- [ ] **Step 5: Run affected UI and calculation tests**

Run:

```powershell
npm test -- src/test/attendance-period-analysis.test.ts src/test/attendance-regression.test.ts src/test/attendance-heatmap-calculations.test.ts src/test/patient-attendance-heatmap.test.tsx --run --reporter=dot
```

Expected: all pass, and the one-fit assertion remains green.

- [ ] **Step 6: Commit Task 4**

```powershell
git add src/components/clinic/dashboard/AttendanceHourlyHeatmap.tsx src/components/clinic/dashboard/PatientAttendanceHeatmap.tsx src/test/patient-attendance-heatmap.test.tsx
git commit -m "feat: simplify attendance heatmap dashboard"
```

---

### Task 5: Real Regression Integration and Release Verification

**Files:**
- Modify: `src/test/patient-attendance-heatmap-integration.test.tsx`

**Interfaces:**
- Consumes: production-shaped aggregate observations through the real regression, period analysis, and UI.
- Produces: release evidence that the simplified presentation uses real regression output and preserves safety decisions.

- [ ] **Step 1: Extend the real-model integration test**

Use the existing SQL-shaped 12-week observations. Render with only `useAttendanceHeatmap` mocked and assert:

- Four period columns are visible with exact boundaries.
- A real period predicted total equals the sum of the four real hourly predictions.
- The training and peak cards match the pure period analysis.
- The selected-doctor backup veto reaches the training/off-day details.
- The compact aggregation does not change `assessDoctorOffDays` output.
- A dangerous hour suppresses an otherwise quiet training period.

- [ ] **Step 2: Run the integration test and fix only demonstrated defects**

Run:

```powershell
npm test -- src/test/patient-attendance-heatmap-integration.test.tsx --run --reporter=dot
```

Expected: GREEN using the real regression implementation.

- [ ] **Step 3: Run complete affected verification**

```powershell
npm test -- src/test/attendance-regression.test.ts src/test/attendance-heatmap-calculations.test.ts src/test/attendance-heatmap-hook.test.tsx src/test/attendance-period-analysis.test.ts src/test/patient-attendance-heatmap.test.tsx src/test/patient-attendance-heatmap-integration.test.tsx src/test/management-dashboard-attendance.test.tsx src/test/management-dashboard-page-contract.test.ts --run --reporter=dot
npx eslint src/lib/clinic/attendancePeriodAnalysis.ts src/components/clinic/dashboard/AttendanceDecisionCards.tsx src/components/clinic/dashboard/AttendancePeriodHeatmap.tsx src/components/clinic/dashboard/AttendancePeriodDetails.tsx src/components/clinic/dashboard/AttendanceHourlyHeatmap.tsx src/components/clinic/dashboard/PatientAttendanceHeatmap.tsx src/test/attendance-period-analysis.test.ts src/test/patient-attendance-heatmap.test.tsx src/test/patient-attendance-heatmap-integration.test.tsx
npx tsc --noEmit -p tsconfig.app.json
npm run build
git diff --check
```

Expected: all affected tests, lint, TypeScript, build, and whitespace checks pass.

- [ ] **Step 4: Perform a focused visual and interaction check**

At desktop width verify no horizontal scroll in the compact grid. At mobile width verify readable stacked rows. Exercise all four period cells, decision-card details, doctor filter, period filter, unavailable regression, uncovered roster, advanced disclosure, and keyboard focus.

- [ ] **Step 5: Commit final test adjustments**

```powershell
git add src/test/patient-attendance-heatmap-integration.test.tsx
git commit -m "test: verify simplified attendance regression flow"
```

- [ ] **Step 6: Deploy only after all gates pass**

Push the verified commit series to `origin/main`, wait for the Security Gate and GitHub Pages workflows to succeed, then confirm `https://klinikawfa.com/` returns HTTP 200. Do not change or apply any Supabase migration because this feature uses the existing aggregate RPC.
