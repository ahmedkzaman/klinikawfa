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
