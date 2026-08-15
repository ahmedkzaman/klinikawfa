# Task 2 report — clinical attendance aggregate RPC

## Delivered

- `supabase/migrations/20260815143000_add_clinical_attendance_heatmap.sql`
  - Adds the protected `public.get_clinical_attendance_heatmap(date, date, uuid)` aggregate RPC.
  - Enforces management-dashboard access, a fixed search path, inclusive date ordering, and the 366-day maximum inclusive range.
  - Produces only 08:00–23:00 weekday/hour aggregates, period/comparison boundaries, doctor ID/name options, and warnings.
  - Uses Malaysia local time for visit date, weekday, and hour; excludes non-native, deleted, cancelled, payment-only, and consultation-less visits; measures waiting time only for non-negative waits.
  - Parses `DOC_S1|shift1`, `DOC_S2|shift2`, and `DOC_S3|shift3` roster assignments. S1/S2/S3 cover 08:00–13:00, 14:00–19:00, and 20:00–24:00 as end-exclusive hour ranges.
  - Returns `complete`, `insufficient`, and `uncovered` separately, including selected-doctor other-doctor coverage.
  - Adds the requested partial queue-created and consultation queue/doctor indexes; revokes `PUBLIC`/`anon` and grants `authenticated` only.

- `supabase/tests/attendance_heatmap.sql`
  - Transactional, rollback-only SQL fixture with synthetic IDs.
  - Covers management authorization, date bounds, cash/card/ewallet/panel and repeat visits, exclusions, Malaysia midnight conversion, wait validity, roster gaps, selected/all-doctor denominators, equal-length comparison, 112-cell grid, warnings, and aggregate-only privacy.

- `src/test/attendance-heatmap-migration.test.ts`
  - Migration contract tests for signature, authorization, bounds, timezone/filtering, queue-number boundary, roster keys/shifts, output privacy, grants, and indexes.

## TDD evidence

1. Added the migration-contract tests before the migration.
2. Ran the focused test file: it failed in the expected way because `20260815143000_add_clinical_attendance_heatmap.sql` did not yet exist (5 failures).
3. Added the minimum migration/fixture implementation and re-ran the focused suite successfully.

## Validation

Passed:

```text
npm test -- src/test/attendance-heatmap-migration.test.ts src/test/attendance-heatmap-calculations.test.ts
Test Files  2 passed (2)
Tests  14 passed (14)
```

Passed linked migration dry-run:

```text
npx --yes supabase@latest db push --dry-run
Would push these migrations:
 • 20260815143000_add_clinical_attendance_heatmap.sql
```

`git diff --check` passed.

## Execution gate / follow-up

The rollback-only fixture was not run against the linked database because the dry-run correctly does not apply the migration and this workspace has no Docker runtime for an isolated local Supabase database. Running it remotely before deployment would require applying the migration (a state-changing action outside this task). After migration application, run:

```text
npx --yes supabase@latest db query --linked --file supabase/tests/attendance_heatmap.sql
```

The fixture ends in `ROLLBACK`, so its synthetic data is not retained.

## Schema note

`public.saved_rosters.month` is documented in its defining migration as `0-11`; this RPC follows that source contract (`extract(month) - 1`). This differs from several older dashboard queries that compare directly to a 1-based extracted month, so production roster rows should retain the documented 0-based convention.
