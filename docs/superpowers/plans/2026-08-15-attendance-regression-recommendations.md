# Attendance Regression Recommendations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the simple weekday-average off-day suggestion with a count-regression forecast that rejects deceptively quiet weekdays when observed or predicted hourly peaks remain unsafe.

**Architecture:** The existing Supabase RPC remains the privacy boundary and will return bounded, aggregate operating-date/hour observations with roster coverage—not patient rows. A new pure TypeScript negative-binomial GLM module will fit and validate the model in the browser, while the existing descriptive heatmap and training/peak cards remain observation-based; only the doctor off-day recommendation consumes regression output. Model failure or insufficient evidence will produce an explicit no-recommendation state without blocking the dashboard.

**Tech Stack:** React 18, TypeScript, TanStack Query, Vitest, Testing Library, Supabase/PostgreSQL JSONB RPC, pure TypeScript IRLS linear algebra (no new runtime dependency).

## Global Constraints

- Use Malaysia local time (`Asia/Kuala_Lumpur`) for every attendance date and hour.
- Include clinical visits only: native non-null queue number, non-deleted/non-cancelled queue and consultation, and exclude `payment_only` visits.
- Treat uncovered or closed date-hours as missing observations, never as zero attendance.
- Fit only operating date-hours from the selected period, with a minimum of 12 usable weeks, at least 8 comparable operating dates for a recommended weekday, and a maximum range of 52 weeks.
- Use a negative-binomial count model with log link; use the Poisson limit when estimated over-dispersion is negligible.
- Predictors are weekday, hour, month/seasonality, sequential week trend, doctors rostered, selected-doctor scheduled, and backup-doctor coverage.
- Keep the existing heatmap, training-window, peak-staffing, and unstable-period cards descriptive; regression affects possible doctor off-day recommendations only.
- Never expose patient identifiers, queue identifiers, notes, IC/passport numbers, names, or individual visit timestamps in the regression payload.
- Do not add an external analytics/ML service or a new npm runtime dependency.
- A weekday may be suggested only when every safety veto passes; otherwise show “No safe off-day recommendation” and the failed reasons.
- Do not apply the Supabase migration or deploy until the linked dry-run, executable SQL fixture, focused tests, TypeScript, lint, build, and final review gates pass.

---

## File Structure

- Create `src/lib/clinic/attendanceRegression.ts`: pure model types, feature encoding, IRLS fitting, dispersion estimation, prediction intervals, diagnostics, and weekday forecasts.
- Modify `src/lib/clinic/attendanceHeatmap.ts`: normalize aggregate observations and combine regression forecasts with the off-day safety-veto decision; retain descriptive recommendations.
- Modify `supabase/migrations/20260815143000_add_clinical_attendance_heatmap.sql`: add privacy-safe operating observations and roster predictor values to the existing RPC response.
- Modify `supabase/tests/attendance_heatmap.sql`: executable assertions for operating-only observations, roster predictors, privacy, and range limits.
- Modify `src/hooks/clinic/useAttendanceHeatmap.ts`: preserve the current query contract while returning normalized observations and model-ready reports.
- Modify `src/components/clinic/dashboard/AttendanceRecommendations.tsx`: render forecast evidence, uncertainty, veto reasons, and model-unavailable state.
- Modify `src/components/clinic/dashboard/PatientAttendanceHeatmap.tsx`: compute the model without blocking descriptive heatmap rendering and pass its result to recommendations.
- Create `src/test/attendance-regression.test.ts`: deterministic mathematical and forecasting tests.
- Modify `src/test/attendance-heatmap-calculations.test.ts`: recommendation policy and safety-veto tests.
- Modify `src/test/attendance-heatmap-rpc-contract.test.ts`: static RPC contract checks for aggregate observations and privacy.
- Modify `src/test/attendance-heatmap-hook.test.tsx`: observation normalization and malformed-payload rejection.
- Modify `src/test/patient-attendance-heatmap.test.tsx`: UI integration, failure isolation, and evidence copy.

---

### Task 1: Pure Count-Regression Engine

**Files:**
- Create: `src/lib/clinic/attendanceRegression.ts`
- Create: `src/test/attendance-regression.test.ts`

**Interfaces:**
- Consumes: aggregate `AttendanceRegressionObservation[]` defined in this task.
- Produces:

```ts
export type AttendanceRegressionObservation = {
  date: string;
  weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  hour: number;
  visits: number;
  averageWaitMinutes: number | null;
  waitMeasuredVisits: number;
  doctorsRostered: number;
  selectedDoctorScheduled: boolean;
  backupDoctorCovered: boolean;
};

export type AttendanceModelDiagnostics = {
  family: 'negative_binomial' | 'poisson';
  converged: boolean;
  iterations: number;
  usableWeeks: number;
  observationCount: number;
  dispersion: number;
  warnings: string[];
};

export type AttendanceHourlyForecast = {
  weekday: AttendanceRegressionObservation['weekday'];
  hour: number;
  expectedVisits: number;
  lowerPrediction: number;
  upperPrediction: number;
};

export type AttendanceWeekdayForecast = {
  weekday: AttendanceRegressionObservation['weekday'];
  expectedTotal: number;
  lowerPrediction: number;
  upperPrediction: number;
  highestExpectedHour: AttendanceHourlyForecast;
  highestObservedPeak: number;
  averageWaitMinutes: number | null;
  comparableDates: number;
  backupCoverageRate: number;
};

export type AttendanceRegressionResult =
  | { status: 'ready'; diagnostics: AttendanceModelDiagnostics; hourly: AttendanceHourlyForecast[]; weekdays: AttendanceWeekdayForecast[] }
  | { status: 'unavailable'; diagnostics: AttendanceModelDiagnostics; reasons: string[] };

export function fitAttendanceRegression(
  observations: AttendanceRegressionObservation[],
  selectedDoctorId?: string | null,
): AttendanceRegressionResult;
```

- [ ] **Step 1: Write deterministic failing tests for validation and feature encoding**

```ts
it('rejects uncovered, invalid, or shorter-than-12-week samples', () => {
  expect(fitAttendanceRegression([], null)).toMatchObject({
    status: 'unavailable',
    reasons: expect.arrayContaining(['At least 12 usable weeks are required.']),
  });
});

it('encodes weekday, hour, month, trend, roster count, selected doctor, and backup coverage', () => {
  const matrix = buildAttendanceDesignMatrix(syntheticObservations({ weeks: 12 }));
  expect(matrix.featureNames).toEqual(expect.arrayContaining([
    'weekday_2', 'hour_9', 'month_8', 'week_trend',
    'doctors_rostered', 'selected_doctor_scheduled', 'backup_doctor_covered',
  ]));
});
```

- [ ] **Step 2: Run the new suite and verify RED**

Run: `npm test -- --run src/test/attendance-regression.test.ts`

Expected: FAIL because `attendanceRegression.ts` and its exports do not exist.

- [ ] **Step 3: Implement validation, stable feature encoding, and small matrix helpers**

Implement `buildAttendanceDesignMatrix()` with an intercept, reference levels Monday/08:00/January, centered sequential-week trend, finite-value validation, and ridge-ready normal equations. Export it only for tests as `export const __attendanceRegressionTestables = { buildAttendanceDesignMatrix }`.

```ts
const MIN_USABLE_WEEKS = 12;
const MAX_ITERATIONS = 50;
const CONVERGENCE_TOLERANCE = 1e-7;
const RIDGE = 1e-6;

function safeExp(value: number): number {
  return Math.exp(Math.max(-20, Math.min(20, value)));
}
```

- [ ] **Step 4: Add failing synthetic-data tests for Poisson and over-dispersed fits**

```ts
it('uses the Poisson limit for stable equidispersed counts', () => {
  const result = fitAttendanceRegression(poissonLikeFixture(), null);
  expect(result).toMatchObject({ status: 'ready', diagnostics: { family: 'poisson', converged: true } });
});

it('uses negative binomial variance when peak dispersion is material', () => {
  const result = fitAttendanceRegression(overdispersedFixture(), null);
  expect(result).toMatchObject({ status: 'ready', diagnostics: { family: 'negative_binomial', converged: true } });
  if (result.status === 'ready') expect(result.diagnostics.dispersion).toBeGreaterThan(0);
});
```

- [ ] **Step 5: Implement IRLS, dispersion estimation, and prediction intervals**

Use log-link IRLS with `variance = mu + alpha * mu * mu`, Pearson dispersion estimate, Poisson when `alpha <= 0.01`, ridge stabilization, pivoted Gaussian elimination, maximum 50 iterations, and an unavailable result on singular/non-finite/non-convergent fits. Prediction bounds must be non-negative and use count variance rather than only coefficient standard error.

- [ ] **Step 6: Add and pass forecast-behavior tests**

```ts
it('preserves a low average weekday but exposes its dangerous peak bound', () => {
  const result = fitAttendanceRegression(lowAverageHighPeakFixture(), null);
  expect(result.status).toBe('ready');
  if (result.status === 'ready') {
    const monday = result.weekdays.find(day => day.weekday === 1)!;
    expect(monday.expectedTotal).toBeLessThan(result.weekdays.find(day => day.weekday === 6)!.expectedTotal);
    expect(monday.highestExpectedHour.upperPrediction).toBeGreaterThanOrEqual(peakBusyThreshold(result));
  }
});
```

Run: `npm test -- --run src/test/attendance-regression.test.ts`

Expected: PASS.

- [ ] **Step 7: Run static checks and commit**

Run:

```powershell
npx eslint src/lib/clinic/attendanceRegression.ts src/test/attendance-regression.test.ts
npx tsc --noEmit -p tsconfig.app.json
git add src/lib/clinic/attendanceRegression.ts src/test/attendance-regression.test.ts
git commit -m "feat: add attendance count regression"
```

Expected: all commands exit 0.

---

### Task 2: Privacy-Safe Model Observations from Supabase

**Files:**
- Modify: `supabase/migrations/20260815143000_add_clinical_attendance_heatmap.sql`
- Modify: `supabase/tests/attendance_heatmap.sql`
- Modify: `src/test/attendance-heatmap-rpc-contract.test.ts`

**Interfaces:**
- Consumes: existing `cell_daily`, `roster_slots`, selected/comparison periods, and management-dashboard authorization.
- Produces: top-level RPC property `observations: AttendanceRegressionObservation[]` for selected-period operating slots only.

- [ ] **Step 1: Add failing contract tests for aggregate observations and privacy**

```ts
expect(sql).toContain("'observations'");
expect(sql).toMatch(/'doctorsRostered'[\s\S]*'selectedDoctorScheduled'[\s\S]*'backupDoctorCovered'/);
expect(sql).toMatch(/FILTER \(WHERE cd\.period = 'selected' AND cd\.operating\)/);
for (const forbidden of ['queueEntryId', 'patientId', 'patientName', 'icNo', 'consultationNotes']) {
  expect(observationJsonFragment).not.toContain(forbidden);
}
```

- [ ] **Step 2: Run RPC contract tests and verify RED**

Run: `npm test -- --run src/test/attendance-heatmap-rpc-contract.test.ts`

Expected: FAIL because `observations` is absent.

- [ ] **Step 3: Extend roster slots and observation aggregation**

Add `count(DISTINCT ra.doctor_id)::integer AS doctors_rostered` to `roster_slots`. Add an `observations` CTE sourced only from selected `cell_daily` rows where `operating = true`; emit exactly:

```sql
jsonb_build_object(
  'date', cd.day,
  'weekday', cd.weekday,
  'hour', cd.hour,
  'visits', cd.visits,
  'averageWaitMinutes', CASE WHEN cd.wait_measured_visits > 0
    THEN round(cd.wait_total_minutes / cd.wait_measured_visits, 1) END,
  'waitMeasuredVisits', cd.wait_measured_visits,
  'doctorsRostered', cd.doctors_rostered,
  'selectedDoctorScheduled', cd.selected_doctor_scheduled,
  'backupDoctorCovered', cd.other_doctor_covered
)
```

Keep the maximum `_end_date - _start_date <= 365`, so the payload cannot exceed 52 weeks plus one day.

- [ ] **Step 4: Add executable SQL assertions**

Extend `supabase/tests/attendance_heatmap.sql` to assert:

```sql
-- closed/uncovered hours are absent from observations;
-- operating zero-visit hours are present with visits = 0;
-- S1/S2/S3 roster counts are correct;
-- doctor-filtered observations carry selectedDoctorScheduled and backupDoctorCovered;
-- no observation object exposes row or patient identifiers;
-- null and >365-day ranges still raise INVALID_DATE_RANGE.
```

Use seeded August rosters with 1-based `saved_rosters.month = 8`.

- [ ] **Step 5: Run focused tests and safe database preflight**

Run:

```powershell
npm test -- --run src/test/attendance-heatmap-rpc-contract.test.ts
npx supabase@latest db push --dry-run --linked
```

Expected: tests PASS; dry-run lists only `20260815143000_add_clinical_attendance_heatmap.sql` and performs no write.

- [ ] **Step 6: Execute the rollback-only fixture when a disposable test database is available**

Run: `npx supabase@latest test db supabase/tests/attendance_heatmap.sql`

Expected: PASS and transaction rolls back. If no local disposable database is available, stop the release gate and document the exact blocker; do not substitute a production apply.

- [ ] **Step 7: Commit**

```powershell
git add supabase/migrations/20260815143000_add_clinical_attendance_heatmap.sql supabase/tests/attendance_heatmap.sql src/test/attendance-heatmap-rpc-contract.test.ts
git commit -m "feat: expose aggregate attendance model observations"
```

---

### Task 3: Normalize Model Observations and Preserve Query Behavior

**Files:**
- Modify: `src/lib/clinic/attendanceHeatmap.ts`
- Modify: `src/hooks/clinic/useAttendanceHeatmap.ts`
- Modify: `src/test/attendance-heatmap-calculations.test.ts`
- Modify: `src/test/attendance-heatmap-hook.test.tsx`

**Interfaces:**
- Consumes: `AttendanceRegressionObservation` from Task 1 and RPC `observations` from Task 2.
- Produces: `AttendanceHeatmapReport.observations: AttendanceRegressionObservation[]`.

- [ ] **Step 1: Add failing normalization tests**

```ts
expect(normalizeAttendanceHeatmapReport(raw).observations).toEqual([
  {
    date: '2026-08-03', weekday: 1, hour: 8, visits: 4,
    averageWaitMinutes: 18.5, waitMeasuredVisits: 4,
    doctorsRostered: 2, selectedDoctorScheduled: true, backupDoctorCovered: true,
  },
]);
```

Add malformed cases for invalid ISO dates, weekday/hour, negative visits/counts, non-booleans, uncovered payload rows, and more than 5,824 observations; malformed rows must be discarded and add a warning without crashing the heatmap.

- [ ] **Step 2: Run calculation and hook tests to verify RED**

Run: `npm test -- --run src/test/attendance-heatmap-calculations.test.ts src/test/attendance-heatmap-hook.test.tsx`

Expected: FAIL because the report has no `observations` field.

- [ ] **Step 3: Implement strict observation normalization**

Add `observations` to `AttendanceHeatmapReport`. Reuse finite/non-negative helpers, require `YYYY-MM-DD`, integer hours 0–23, weekday 1–7, and literal booleans. Cap accepted observations at `52 * 7 * 16 = 5824`; append `Attendance model observations were truncated.` if exceeded.

- [ ] **Step 4: Verify the hook keeps the same cache identity and failure semantics**

The query key remains:

```ts
['clinical-attendance-heatmap', startDate, endDate, doctorId ?? 'all']
```

No second network request is introduced. RPC errors still reject the query; malformed model observations do not discard valid descriptive cells.

- [ ] **Step 5: Run tests and commit**

```powershell
npm test -- --run src/test/attendance-heatmap-calculations.test.ts src/test/attendance-heatmap-hook.test.tsx
npx eslint src/lib/clinic/attendanceHeatmap.ts src/hooks/clinic/useAttendanceHeatmap.ts src/test/attendance-heatmap-calculations.test.ts src/test/attendance-heatmap-hook.test.tsx
git add src/lib/clinic/attendanceHeatmap.ts src/hooks/clinic/useAttendanceHeatmap.ts src/test/attendance-heatmap-calculations.test.ts src/test/attendance-heatmap-hook.test.tsx
git commit -m "feat: normalize attendance model observations"
```

Expected: all commands exit 0.

---

### Task 4: Regression-Based Off-Day Safety Policy

**Files:**
- Modify: `src/lib/clinic/attendanceHeatmap.ts`
- Modify: `src/test/attendance-heatmap-calculations.test.ts`

**Interfaces:**
- Consumes: `AttendanceRegressionResult`, existing descriptive cells, and selected doctor ID.
- Produces:

```ts
export type DoctorOffDayAssessment = {
  status: 'suggested' | 'rejected' | 'unavailable';
  weekday: AttendanceHeatmapCell['weekday'] | null;
  forecast: AttendanceWeekdayForecast | null;
  safetyScore: number | null;
  reasons: string[];
  passedChecks: string[];
};

export function assessDoctorOffDays(
  cells: AttendanceHeatmapCell[],
  regression: AttendanceRegressionResult,
  selectedDoctorId?: string | null,
): DoctorOffDayAssessment[];
```

- [ ] **Step 1: Write failing safety-veto tests**

Cover every veto separately:

```ts
it.each([
  'fewer than 12 usable weeks',
  'fewer than 8 comparable dates',
  'upper daily prediction reaches the busy-day threshold',
  'predicted hour enters the busiest quartile',
  'observed peak enters the busiest observed-peak quartile',
  'hourly upper prediction crosses the busy threshold',
  'average wait exceeds 45 minutes',
  'volatility is too high',
  'backup doctor coverage is incomplete',
])('rejects a weekday when %s', scenario => {
  expect(assessmentFor(scenario).status).toBe('rejected');
});
```

The main regression must reproduce the user’s case: low weekday average plus one very high peak hour is rejected, not suggested.

- [ ] **Step 2: Run the calculation suite and verify RED**

Run: `npm test -- --run src/test/attendance-heatmap-calculations.test.ts`

Expected: FAIL because `assessDoctorOffDays` does not exist.

- [ ] **Step 3: Implement explicit thresholds and veto evaluation**

Use cross-weekday quartiles calculated from ready forecasts/cells:

```ts
const busyDailyThreshold = percentile(expectedDailyTotals, 0.75);
const busyHourlyThreshold = percentile(expectedHourlyVisits, 0.75);
const observedPeakThreshold = percentile(observedWeekdayPeaks, 0.75);
const MAX_AVERAGE_WAIT_MINUTES = 45;
const MIN_COMPARABLE_DATES = 8;
const MAX_BACKUP_MISS_RATE = 0;
```

Define excessive volatility as `(upperPrediction - lowerPrediction) / Math.max(expectedTotal, 1) > 1.0`. A suggestion must pass all checks. Rank passing days with a deterministic lower-is-safer score after min-max normalizing each component across eligible weekdays:

```ts
safetyScore =
  0.30 * predictedDailyAttendance
  + 0.25 * dailyUpperPrediction
  + 0.15 * highestPredictedHour
  + 0.10 * observedPeakPercentile
  + 0.10 * waitingRisk
  + 0.05 * volatility
  + 0.05 * (1 - backupCoverageRate);
```

Use weekday number as the final tie-breaker. Return rejected assessments and reasons for auditability. If no day passes, return no `suggested` item. If the model has fewer than 12 usable weeks, the primary reason must be the exact copy `Not enough data for regression recommendation`.

- [ ] **Step 4: Preserve descriptive recommendation behavior**

Remove only the old `possibleDoctorOffDays` average-based construction from `buildAttendanceRecommendations`. Keep training windows, peak staffing, and unstable periods byte-for-byte equivalent in behavior. Add a regression ensuring those three lists do not change when model status changes.

- [ ] **Step 5: Run tests and commit**

```powershell
npm test -- --run src/test/attendance-regression.test.ts src/test/attendance-heatmap-calculations.test.ts
npx eslint src/lib/clinic/attendanceHeatmap.ts src/test/attendance-heatmap-calculations.test.ts
git add src/lib/clinic/attendanceHeatmap.ts src/test/attendance-heatmap-calculations.test.ts
git commit -m "feat: assess doctor off-days with regression safety"
```

Expected: all commands exit 0.

---

### Task 5: Dashboard Evidence and Failure Isolation

**Files:**
- Modify: `src/components/clinic/dashboard/AttendanceRecommendations.tsx`
- Modify: `src/components/clinic/dashboard/PatientAttendanceHeatmap.tsx`
- Modify: `src/test/patient-attendance-heatmap.test.tsx`

**Interfaces:**
- Consumes: `AttendanceRegressionResult`, `DoctorOffDayAssessment[]`, descriptive recommendations, report observations, and selected doctor ID.
- Produces: non-blocking dashboard presentation with predicted demand and explicit safety explanations.

- [ ] **Step 1: Add failing UI tests**

```tsx
expect(screen.getByText('Possible doctor off-day — suggestion only')).toBeInTheDocument();
expect(screen.getByText(/Predicted visits/)).toBeInTheDocument();
expect(screen.getByText(/Prediction range/)).toBeInTheDocument();
expect(screen.getByText(/Highest-risk hour/)).toBeInTheDocument();
expect(screen.getByText(/Observed peak/)).toBeInTheDocument();
expect(screen.getByText(/Backup coverage/)).toBeInTheDocument();
```

Add tests for: no safe weekday, fewer than 12 weeks, non-convergent model, selected-doctor missing backup coverage, and descriptive heatmap still visible when regression is unavailable.

- [ ] **Step 2: Run UI tests and verify RED**

Run: `npm test -- --run src/test/patient-attendance-heatmap.test.tsx`

Expected: FAIL because model evidence is not rendered.

- [ ] **Step 3: Fit the model without blocking rendering**

In `PatientAttendanceHeatmap`, compute with `useMemo`:

```ts
const regression = useMemo(
  () => fitAttendanceRegression(query.data?.observations ?? [], doctorId),
  [query.data?.observations, doctorId],
);

const offDayAssessments = useMemo(
  () => assessDoctorOffDays(cells, regression, doctorId),
  [cells, regression, doctorId],
);
```

Pass both to `AttendanceRecommendations`. Catch no exceptions in render: the pure model must return `unavailable`; add a final defensive wrapper that maps unexpected failure to `unavailable` and leaves the heatmap visible.

- [ ] **Step 4: Render concise clinical-management evidence**

For a suggestion show weekday, predicted total and interval, highest-risk hour and interval, observed peak, average wait, usable weeks/comparable dates, backup coverage, safety score, and a concise explanation of why it ranked safest. Display predicted numeric values to one decimal place while retaining full precision in model objects. For rejection/unavailability show “No safe off-day recommendation” plus up to three highest-priority reasons and a “View all checks” disclosure. Label the output “Planning aid only — confirm against roster and current operations.”

- [ ] **Step 5: Add accessibility and performance assertions**

Use semantic headings/lists, an `aria-label` for the safety-check disclosure, and no color-only pass/fail meaning. Assert the model is not refit when unrelated component state changes and that the existing refresh button still triggers one query refetch without resetting filters.

- [ ] **Step 6: Run tests and commit**

```powershell
npm test -- --run src/test/patient-attendance-heatmap.test.tsx src/test/management-dashboard-page-contract.test.ts
npx eslint src/components/clinic/dashboard/AttendanceRecommendations.tsx src/components/clinic/dashboard/PatientAttendanceHeatmap.tsx src/test/patient-attendance-heatmap.test.tsx
npx tsc --noEmit -p tsconfig.app.json
git add src/components/clinic/dashboard/AttendanceRecommendations.tsx src/components/clinic/dashboard/PatientAttendanceHeatmap.tsx src/test/patient-attendance-heatmap.test.tsx
git commit -m "feat: show regression off-day evidence"
```

Expected: all commands exit 0.

---

### Task 6: Final Verification, Database Gate, and Deployment

**Files:**
- Review: all files changed in Tasks 1–5
- Update only if evidence requires it: `docs/superpowers/specs/2026-08-15-attendance-regression-recommendations-design.md`

**Interfaces:**
- Consumes: complete implementation and the pending attendance migration.
- Produces: reviewed, tested, database-applied, GitHub-deployed feature with a post-deploy canary result.

- [ ] **Step 1: Run the complete affected test suite**

```powershell
npm test -- --run src/test/attendance-regression.test.ts src/test/attendance-heatmap-calculations.test.ts src/test/attendance-heatmap-rpc-contract.test.ts src/test/attendance-heatmap-hook.test.tsx src/test/patient-attendance-heatmap.test.tsx src/test/management-dashboard-page-contract.test.ts
```

Expected: all tests PASS with no unexpected skips.

- [ ] **Step 2: Run repository quality gates**

```powershell
npx tsc --noEmit -p tsconfig.app.json
npx eslint src/lib/clinic/attendanceRegression.ts src/lib/clinic/attendanceHeatmap.ts src/hooks/clinic/useAttendanceHeatmap.ts src/components/clinic/dashboard/AttendanceRecommendations.tsx src/components/clinic/dashboard/PatientAttendanceHeatmap.tsx src/test/attendance-regression.test.ts src/test/attendance-heatmap-calculations.test.ts src/test/attendance-heatmap-rpc-contract.test.ts src/test/attendance-heatmap-hook.test.tsx src/test/patient-attendance-heatmap.test.tsx
npm run build
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 3: Review mathematical and safety invariants**

Confirm from tests and code that: uncovered slots never become zeroes; all predictions are finite/non-negative; the 12-week/8-date minimums work; low-average/high-peak is rejected; every safety veto has a user-facing reason; model failure does not hide descriptive data; selected-doctor recommendations require complete backup coverage.

- [ ] **Step 4: Run the linked migration dry-run and executable fixture**

```powershell
npx supabase@latest migration list --linked
npx supabase@latest db push --dry-run --linked
npx supabase@latest test db supabase/tests/attendance_heatmap.sql
```

Expected: history is aligned except the single intended attendance migration; dry-run selects only `20260815143000_add_clinical_attendance_heatmap.sql`; SQL fixture passes and rolls back.

- [ ] **Step 5: Obtain an independent code review**

Use `superpowers:requesting-code-review`. The reviewer must inspect the model math, privacy boundary, SQL coverage semantics, safety-veto completeness, UI claims, and migration ordering. Resolve all Critical and Important findings and repeat Steps 1–4.

- [ ] **Step 6: Apply the database migration only after all gates pass**

Run: `npx supabase@latest db push --linked`

Expected: exactly `20260815143000_add_clinical_attendance_heatmap.sql` is applied to the intended Klinik Awfa Supabase project. Immediately verify `get_clinical_attendance_heatmap` as an authorized management user for All doctors and one selected doctor.

- [ ] **Step 7: Push the reviewed commits and monitor deployment**

Use the repository’s approved GitHub deployment workflow. Confirm the Security Gate and Deploy GitHub Pages workflows are green before claiming deployment.

- [ ] **Step 8: Run production canary checks**

At `https://klinikawfa.com/clinic/insight`, verify:

```text
1. Management → Patient Attendance loads for Latest 12 weeks.
2. Heatmap values still match descriptive observations.
3. All doctors and a selected doctor can be filtered.
4. A low-average/high-peak weekday is not recommended.
5. Suggested weekday shows prediction range, risky hour, observed peak, wait, sample, and backup coverage.
6. Insufficient/non-convergent data shows no recommendation while the heatmap remains usable.
7. Refresh refetches without resetting date/doctor filters.
```

- [ ] **Step 9: Record deployment evidence and commit any documentation-only update**

Record the migration applied, commit hashes, test counts, workflow run URLs, and canary results. Do not describe regression output as a guaranteed safe staffing decision.
