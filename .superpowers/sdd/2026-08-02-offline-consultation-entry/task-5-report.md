# Task 5 Local Reporting Report

## Status

Completed the local reporting portion of Task 5. No production migration,
remote verification, push, deployment, or live-data operation was performed.

## Changes

- Added attribution regression coverage for patient visit history, Completed
  Today, consultation history, doctor clinical activity, and reporting without
  approval-state filtering.
- Updated Completed Today to join the consultation doctor through
  `consultations.doctor_id` and use that doctor for the existing card shape.
- Made the consultation-history doctor relationship explicit with
  `doctors:doctor_id`.

## TDD Evidence

- The new reporting test was run before the source changes and failed in the
  intended places: Completed Today used `assigned_doctor_id`, and consultation
  history used an implicit doctor relationship.
- After the minimal query corrections, the reporting and doctor-activity
  migration tests passed: 11 tests across 2 files.

## Verification

- Focused reporting suite: 39 tests passed across 7 files.
- `npm.cmd run lint:changed`: passed.
- Direct lint for the three changed TypeScript files: passed.
- `npx.cmd tsc --noEmit`: passed.
- `npm.cmd run build`: passed.
- `git diff --check`: passed.
- A full `npm.cmd test` run was started, then intentionally stopped at the
  user's checkpoint request before it produced a final result. It must not be
  represented as passing.

## Concerns

- The focused financial-reporting test emitted an existing accessibility
  warning about a dialog description.
- The build completed with existing dependency, browser-data, dynamic-import,
  and large-chunk warnings.

## Fix Round 1

- Replaced the reporting file's source-text assertions with executable hook
  tests. Their fixtures give the consultation doctor, queue assigned doctor,
  and entering user distinct IDs and names, so a wrong relationship produces a
  visible reporting failure.
- The tests execute patient visit history, Completed Today normalization,
  consultation history, and the doctor clinical activity hook. A temporary
  pre-fix run failed for Completed Today and consultation history; restoring
  the existing fixed joins made the behavioral suite pass.
- Added an opt-in disposable PostgreSQL test for the deployed activity RPC and
  financial view. It inserts a `pending` completed consultation and checks the
  consultation doctor plus financial inclusion. The test remains required when
  `REQUIRE_POSTGRES_TEST=1` or `CI=true`.

### Fix Round 1 Concern

The disposable PostgreSQL path
`src/test/offline-consultation-reporting.test.ts` - `returns a pending
completed consultation from the actual activity RPC and financial view` could
not be completed locally: on this Windows runtime, its temporary server starts
but the test process does not return during teardown. The local focused run
therefore skips it unless `RUN_DISPOSABLE_POSTGRES_REPORTING_TEST=1`; this is
the only blocked reporting path. No production database was contacted.
