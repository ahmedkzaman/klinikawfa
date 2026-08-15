# Task 6 report — final attendance heatmap review fixes

## Scope completed

Addressed the three final-review findings together without applying or pushing the migration.

### 1. Production roster month convention

- Changed the attendance RPC roster join to use the production `saved_rosters.month` convention directly: January `1` through December `12`.
- Removed the stale `extract(month) - 1` behavior.
- Updated the rollback fixture to use July `7` and August `8`.
- Added migration-contract coverage that requires the 1-based join and rejects a zero-based subtraction regression.

### 2. Roster-operating attendance aggregates

- Split qualifying attendance into:
  - `totalVisits`: visits on roster-operating dates only;
  - `rawTotalVisits`: all qualifying clinical visits, including uncovered dates.
- Restricted averages, waiting-time totals/counts, medians, peaks, comparison averages, and date details to roster-operating dates.
- Date details now represent every operating date behind the denominator, including zero-visit operating dates; uncovered dates are not mixed into the detail list.
- A weekday-hour cell with both operating samples and off-roster visits is marked `insufficient`; a cell with no operating occurrence remains `uncovered`.
- Updated the insufficient-coverage warning to cover both incomplete roster coverage and fewer than eight operating occurrences.
- Updated the detail dialog to label covered and raw totals separately.
- Added a qualifying August 10 visit outside roster coverage to the rollback fixture and asserted that a mixed Monday 08:00 cell reports covered total `5`, raw total `6`, operating average/median/peak `5`, covered wait evidence only, one operating date detail, and `insufficient` coverage.

### 3. Weekday-level possible doctor off-day

- Reimplemented `buildAttendanceRecommendations` so off-day output is a weekday recommendation rather than an hourly zero-volume cell.
- The weekday evidence uses the sum of covered hourly averages, the minimum comparable operating-date sample across its operating hours, and its busiest hourly average/peak evidence.
- Only the lowest-attendance weekday is considered. It is suppressed if its busiest hour falls in the busiest attendance quartile.
- All-doctor reports can now produce off-day suggestions.
- Selected-doctor reports additionally require another doctor on every comparable selected-doctor operating occurrence across the weekday.
- Corrected the SQL meaning of `otherDoctorCoveredOccurrences`: it now counts selected-doctor operating dates where another doctor is also scheduled, rather than dates where the selected doctor is absent.
- Suppressed weekday inference when any roster-backed hour on that weekday is incomplete.
- Updated the recommendation card to show the weekday without a misleading hour.
- Added real calculation tests for all-doctor recommendations, selected-doctor comparable-date support, busiest-peak suppression, and incomplete-weekday suppression.

## TDD evidence

The new regressions were written and run before the fixes. The initial focused run failed in the expected five places:

- all-doctor off-day returned no recommendation;
- selected-doctor off-day returned no weekday recommendation;
- the migration still contained the zero-based month subtraction;
- raw and covered attendance aggregates were not separated;
- the SQL fixture had no outside-operating-coverage assertion.

The detail-dialog regression was also run red before the UI labels were changed: it still displayed only `Total visits` and omitted the raw uncovered-date total.

## Verification

Passed focused attendance regression suite:

```text
npm test -- src/test/attendance-heatmap-calculations.test.ts src/test/attendance-heatmap-migration.test.ts src/test/patient-attendance-heatmap.test.tsx
Test Files  3 passed (3)
Tests  28 passed (28)
```

Passed all affected attendance and Management Dashboard suites:

```text
npm test -- src/test/attendance-heatmap-calculations.test.ts src/test/attendance-heatmap-migration.test.ts src/test/attendance-heatmap-hook.test.tsx src/test/patient-attendance-heatmap.test.tsx src/test/management-dashboard-attendance.test.tsx src/test/management-dashboard-access-defaults.test.ts src/test/management-dashboard-hook-contract.test.ts src/test/management-dashboard-page-contract.test.ts src/test/management-dashboard-reporting.test.ts
Test Files  9 passed (9)
Tests  51 passed (51)
```

Also passed:

- `npm run lint:changed`
- direct ESLint over all changed TypeScript/TSX files
- `npx tsc --noEmit`
- `npm run build`
- `git diff --check`

The production build completed with existing advisory warnings about chunk size, dynamic imports, and a third-party CommonJS global; it exited successfully.

Linked migration dry-run passed and confirmed no apply occurred:

```text
npx --yes supabase@latest db push --dry-run
DRY RUN: migrations will not be pushed to the database.
Would push only 20260815143000_add_clinical_attendance_heatmap.sql
```

## Remaining release gate

The rollback-only `supabase/tests/attendance_heatmap.sql` fixture was not executed. The attendance migration is intentionally not applied to the linked database, and the local Supabase status check reports that Docker and Podman are unavailable. The fixture must be run in an approved non-production database after the migration is present and before production apply. It ends with `ROLLBACK`.

No migration was applied or pushed during this task.
