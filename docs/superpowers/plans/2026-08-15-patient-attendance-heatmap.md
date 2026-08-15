# Patient Attendance Heatmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an aggregate clinical-attendance heatmap to the Management Dashboard so management can identify quiet training windows, possible doctor off-days, peak staffing periods, and unstable attendance patterns.

**Architecture:** A bounded, staff-authorized Supabase RPC aggregates native clinical queue arrivals in Malaysia time and applies historical doctor-roster coverage as the operating denominator. A React Query hook fetches only aggregate cells. Pure TypeScript functions normalize the response and calculate deterministic recommendations, while the dashboard renders an accessible weekday/hour grid with a non-identifying detail drawer.

**Tech Stack:** PostgreSQL/Supabase RPC and RLS, React, TypeScript, TanStack Query, Vitest, Testing Library, Tailwind CSS.

## Global Constraints

- Follow `docs/superpowers/specs/2026-08-15-patient-attendance-heatmap-google-reputation-design.md`.
- Count clinical visits, not payments, OTC purchases, or general footfall.
- Use `Asia/Kuala_Lumpur` for date, weekday, hour, and default-period boundaries.
- Do not return patient IDs, names, IC/passport numbers, phone numbers, addresses, notes, diagnoses, or queue-entry IDs.
- Exclude cancelled/deleted visits, `payment_only` visits, visits without consultations, and imported/synthetic arrivals. Treat a non-null native queue number as the current trust boundary; document and test this assumption.
- Use treating doctor (`consultations.doctor_id`) for doctor filters.
- Treat roster gaps 13:00-14:00 and 19:00-20:00 as uncovered under the current roster model.
- Never suggest an automatic roster change, leave approval, or clinic closure.
- Require at least eight comparable operating dates before showing a recommendation.
- Keep the report range bounded to 366 inclusive days.

---

## Task 1: Define the aggregate client contract and deterministic calculations

**Files:**

- Create: `src/lib/clinic/attendanceHeatmap.ts`
- Create: `src/test/attendance-heatmap-calculations.test.ts`

- [ ] **Step 1: Write failing normalization and recommendation tests**

Cover malformed numeric values, missing arrays, weekday/hour bounds, comparison percentages, insufficient coverage, two-hour training windows, peak staffing, unstable peaks, selected-doctor off-day coverage, and the eight-occurrence minimum.

Run:

```powershell
npm test -- src/test/attendance-heatmap-calculations.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 2: Add exact public types**

Implement:

```ts
export type AttendanceHeatmapCell = {
  weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  hour: number;
  totalVisits: number;
  operatingOccurrences: number;
  averageVisits: number | null;
  medianVisits: number | null;
  peakVisits: number | null;
  averageWaitMinutes: number | null;
  waitMeasuredVisits: number;
  comparisonAverageVisits: number | null;
  comparisonAbsoluteChange: number | null;
  comparisonPercentChange: number | null;
  otherDoctorCoveredOccurrences: number;
  dates: Array<{
    date: string;
    visits: number;
    averageWaitMinutes: number | null;
  }>;
  coverage: 'complete' | 'insufficient';
};

export type AttendanceHeatmapReport = {
  period: {
    startDate: string;
    endDate: string;
    comparisonStartDate: string;
    comparisonEndDate: string;
    timezone: 'Asia/Kuala_Lumpur';
  };
  cells: AttendanceHeatmapCell[];
  doctors: Array<{ id: string; name: string }>;
  warnings: string[];
};
```

Export `normalizeAttendanceHeatmapReport(raw: unknown): AttendanceHeatmapReport` and `buildAttendanceRecommendations(cells, selectedDoctorId)`.

- [ ] **Step 3: Implement recommendation rules without UI dependencies**

Return typed recommendation groups for:

- two-or-more consecutive quiet training hours in the bottom quartile;
- possible doctor off-day, with other-doctor coverage when filtered;
- busiest-quartile or >45-minute peak staffing periods;
- unstable cells where peak materially exceeds median/average.

Each recommendation must include sample size and evidence values. Suppress it when coverage is insufficient, sample size is below eight, waiting exceeds 45 minutes for a quiet-window candidate, or peaks make the candidate unsafe.

- [ ] **Step 4: Verify the pure contract**

Run the focused test and `npm run lint:changed`.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/clinic/attendanceHeatmap.ts src/test/attendance-heatmap-calculations.test.ts
git commit -m "test: define attendance heatmap calculations"
```

---

## Task 2: Add the aggregate Supabase RPC

**Files:**

- Create: `supabase/migrations/20260815143000_add_clinical_attendance_heatmap.sql`
- Create: `src/test/attendance-heatmap-migration.test.ts`
- Create: `supabase/tests/attendance_heatmap.sql`

- [ ] **Step 1: Write failing migration-contract tests**

Assert the migration contains:

- `public.get_clinical_attendance_heatmap(_start_date date, _end_date date, _doctor_id uuid default null)`;
- `SECURITY DEFINER` and a fixed `search_path`;
- `can_view_management_dashboard(auth.uid())` authorization;
- inclusive date validation and 366-day maximum;
- native clinical filters;
- `Asia/Kuala_Lumpur` conversion;
- roster coverage based on `saved_rosters` doctor JSON;
- aggregate-only JSON output;
- revoked public/anonymous execution and authenticated grant;
- supporting partial indexes.

- [ ] **Step 2: Write executable SQL fixtures first**

In `supabase/tests/attendance_heatmap.sql`, create a transaction-scoped fixture covering:

- native cash, card, QR/e-wallet, other, and panel clinical visits;
- cancelled, deleted, payment-only, no-consultation, and null-queue-number imported rows;
- arrivals around Malaysia-local midnight;
- valid and invalid `called_at` waiting measurements;
- S1, S2, and S3 roster coverage, including uncovered gaps;
- all-doctor and selected-doctor denominators;
- preceding equal-length comparison values;
- absence of identifying keys in the returned JSON.

The SQL file must raise on mismatched totals, averages, medians, peaks, coverage, or authorization.

- [ ] **Step 3: Implement the RPC**

Use CTEs with these responsibilities:

1. validate caller and range;
2. derive selected and equal-length comparison periods;
3. build Malaysia-local date/hour series for 08:00 through 23:00;
4. parse `saved_rosters.roster_data` keys `DOC_S1|shift1`, `DOC_S2|shift2`, and `DOC_S3|shift3`;
5. map S1 to 08:00-13:00, S2 to 14:00-19:00, and S3 to 20:00-24:00;
6. select qualifying queue/consultation visits and optional treating doctor;
7. aggregate daily counts and valid waiting minutes;
8. calculate operating occurrences, total, average, median, peak, comparison values, and other-doctor coverage;
9. return doctors, cells, boundaries, and warnings as JSONB.

Recommended indexes:

```sql
create index if not exists queue_entries_attendance_created_idx
  on public.queue_entries (created_at)
  where deleted_at is null and cancelled_at is null and queue_number is not null;

create index if not exists consultations_queue_doctor_idx
  on public.consultations (queue_entry_id, doctor_id);
```

- [ ] **Step 4: Verify migration structure and database behaviour**

Run:

```powershell
npm test -- src/test/attendance-heatmap-migration.test.ts
npx supabase db push --dry-run --linked --skip-vault
```

Run `supabase test db` when the project test database is available. If it is unavailable, run the established PGlite migration smoke but keep the exact Supabase SQL test as a release gate before production migration apply.

- [ ] **Step 5: Commit**

```powershell
git add supabase/migrations/20260815143000_add_clinical_attendance_heatmap.sql supabase/tests/attendance_heatmap.sql src/test/attendance-heatmap-migration.test.ts
git commit -m "feat: aggregate clinical attendance by roster hour"
```

---

## Task 3: Add date presets and the query hook

**Files:**

- Create: `src/hooks/clinic/useAttendanceHeatmap.ts`
- Create: `src/test/attendance-heatmap-hook.test.tsx`

- [ ] **Step 1: Write failing hook tests**

Test:

- default latest-12-week Malaysia range;
- month, quarter, and custom inclusive ranges;
- immediately preceding equal-length comparison boundaries;
- doctor ID included in the query key and RPC parameters;
- disabled invalid custom ranges;
- normalized aggregate response and surfaced RPC errors.

- [ ] **Step 2: Implement helpers and hook**

Export:

```ts
export type AttendancePeriodPreset = 'latest_12_weeks' | 'month' | 'quarter' | 'custom';
export function malaysiaToday(now?: Date): string;
export function attendancePresetRange(input: AttendanceRangeInput): { startDate: string; endDate: string };
export function useAttendanceHeatmap(input: {
  startDate: string;
  endDate: string;
  doctorId: string | null;
});
```

Use a query key of `['clinical-attendance-heatmap', startDate, endDate, doctorId ?? 'all']` and call the RPC with `_start_date`, `_end_date`, and `_doctor_id`.

- [ ] **Step 3: Verify and commit**

```powershell
npm test -- src/test/attendance-heatmap-hook.test.tsx src/test/attendance-heatmap-calculations.test.ts
git add src/hooks/clinic/useAttendanceHeatmap.ts src/test/attendance-heatmap-hook.test.tsx
git commit -m "feat: load attendance heatmap periods"
```

---

## Task 4: Build the heatmap and detail UI

**Files:**

- Create: `src/components/clinic/dashboard/PatientAttendanceHeatmap.tsx`
- Create: `src/components/clinic/dashboard/AttendanceHeatmapCellDetails.tsx`
- Create: `src/components/clinic/dashboard/AttendanceRecommendations.tsx`
- Create: `src/test/patient-attendance-heatmap.test.tsx`

- [ ] **Step 1: Write failing component tests**

Test the 7-column by 16-hour grid, accessible cell names, grey uncovered slots, relative blue scale, red wait outline, legend, loading/error/empty states, presets, doctor filter, cell details, comparison values, and privacy (no patient-identifying fields).

- [ ] **Step 2: Implement the filter header and accessible grid**

Render Monday-Sunday columns and rows `08:00-09:00` through `23:00-00:00`. Use a semantic table or grid with keyboard-focusable cell buttons. Show the numeric average in every covered cell, not colour alone.

Colour logic:

- grey for `operatingOccurrences === 0` or insufficient coverage;
- calculate the blue scale from covered cell averages in the selected response;
- add a visible red outline when `averageWaitMinutes > 45`;
- include a colour legend and text explanation.

- [ ] **Step 3: Implement non-identifying cell details**

Display total, average, median, peak, sample count, average wait, measured-wait count, absolute/percentage comparison, and date/count rows. Do not accept or render patient-level data.

- [ ] **Step 4: Implement recommendation cards**

Render the four decision-support categories from `buildAttendanceRecommendations`. Label off-day output `Possible doctor off-day` and include a disclaimer that these are planning suggestions only.

- [ ] **Step 5: Verify responsive and accessible behaviour**

At narrow widths, horizontally scroll only the grid inside its card; do not overflow the dashboard page. Confirm keyboard navigation, focus visibility, and colour-independent status text.

- [ ] **Step 6: Commit**

```powershell
npm test -- src/test/patient-attendance-heatmap.test.tsx
git add src/components/clinic/dashboard/PatientAttendanceHeatmap.tsx src/components/clinic/dashboard/AttendanceHeatmapCellDetails.tsx src/components/clinic/dashboard/AttendanceRecommendations.tsx src/test/patient-attendance-heatmap.test.tsx
git commit -m "feat: render patient attendance heatmap"
```

---

## Task 5: Integrate independently into Management Dashboard

**Files:**

- Modify: `src/pages/clinic/ManagementDashboard.tsx`
- Modify: `src/test/management-dashboard-page-contract.test.ts`
- Create: `src/test/management-dashboard-attendance.test.tsx`

- [ ] **Step 1: Write the failing integration tests**

Require the attendance card to appear for users who can view the Management Dashboard, use its own loading/error state, default to latest 12 weeks independent of the monthly KPI selector, and refresh when the dashboard refresh button is used.

- [ ] **Step 2: Integrate the component**

Place `PatientAttendanceHeatmap` below the automatic KPI/operations panels and above manual Growth & Marketing/Governance. Do not block existing dashboard metrics when attendance loading fails.

- [ ] **Step 3: Verify authorization regression**

Run existing Management Dashboard access, hook, page, and reporting tests together with the new integration test.

```powershell
npm test -- src/test/management-dashboard-access-defaults.test.ts src/test/management-dashboard-hook-contract.test.ts src/test/management-dashboard-page-contract.test.ts src/test/management-dashboard-reporting.test.ts src/test/management-dashboard-attendance.test.tsx
```

- [ ] **Step 4: Commit**

```powershell
git add src/pages/clinic/ManagementDashboard.tsx src/test/management-dashboard-page-contract.test.ts src/test/management-dashboard-attendance.test.tsx
git commit -m "feat: add attendance planning to management dashboard"
```

---

## Task 6: Final verification and release gate

- [ ] Run all focused attendance and existing Management Dashboard tests.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run `npm run lint:changed`.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check`.
- [ ] Run the linked migration dry-run and confirm only the intended migration is pending.
- [ ] Run the executable SQL fixture against the approved non-production Supabase environment before applying to production.
- [ ] Confirm the RPC response contains no patient-identifying keys.
- [ ] Apply the migration only after SQL verification, then deploy the frontend through the existing Security Gate and GitHub Pages workflow.
- [ ] Perform a production canary: load default range, switch doctor, open a cell, verify recommendations and existing dashboard panels.

