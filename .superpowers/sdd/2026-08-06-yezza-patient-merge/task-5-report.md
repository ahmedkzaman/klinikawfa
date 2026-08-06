# Task 5 report — reconcile, document, and prepare deployment

## Outcome

Completed the Task 5 operational artifacts without deploying, applying a migration, calling an approval RPC, or writing production data. The repository now has a gated Yezza runbook, an updated assessment with the verified source baseline and release blockers, and a read-only PostgreSQL post-import reconciliation suite.

## Delivered files

- `docs/YEZZA_IMPORT_RUNBOOK.md` documents backup, local dry-run, source reconciliation, patient/repeated-IC/unresolved-doctor review, the orphan-financial-visit policy, approval RPC, apply, idempotent retry, backup-based rollback, and post-import verification. It explicitly blocks production apply until the PostgreSQL integration and reconciliation suites pass in isolated non-production.
- `docs/YEZZA_IMPORT_ASSESSMENT.md` records the financial baseline, repeated-IC and financial-only review requirements, the full-dry-run memory prerequisite, and the production release gate.
- `supabase/tests/yezza_import_reconciliation.sql` is a read-only, rollback-terminated full-import verification. It requires `app.yezza_reconciliation_environment = 'isolated-non-production'` and verifies patient identity, visit, financial-only visit, bill uniqueness, billed/paid and payment totals, patient-to-visit links, financial-only clinical exclusion, and completed import-ledger ownership.

## Read-only source reconciliation

Executed against the supplied local transaction exports:

```text
inputRows: 69,832
duplicateRowsRemoved: 2,390
uniqueBills: 67,442
sourceTotal: RM5,684,929.22
paidTotal: RM1,099,076.00
matchesExpectedBaseline: true
```

This `npm.cmd run yezza:reconcile` command reads only the two local CSV files and returns aggregate values; it has no database client or write path.

## Full dry-run limitation

The full `yezza:dry-run` was attempted against all four supplied files with no Supabase credentials configured. It made no database connection or write. The first attempt reached Node's default heap limit while parsing the 352 MB consultation export. A retry with a 6 GiB heap exceeded the local command window, and its exact `dryRun.ts` process was stopped. No source file was changed and no report artifact was committed.

The runbook and assessment make this an explicit operational prerequisite: run the full dry-run on the approved local import workstation with a recorded, sufficient Node memory allocation; then have an admin/doctor-admin review every patient-review row, all five repeated-IC cases, each unresolved doctor, and the 17,442 financial-only visit policy before approval. It is not acceptable to skip that review based only on the financial totals.

## Verification evidence

Focused import behavior:

```text
npm.cmd test -- src/test/yezza-patient-matching.test.ts src/test/yezza-dry-run.test.ts src/test/yezza-import-transform.test.ts src/test/yezza-import-idempotency.test.ts

4 test files passed; 34 tests passed.
```

Focused TypeScript validation completed with exit 0 using ESNext/Bundler resolution across the Yezza scripts and focused tests. `npx.cmd --yes deno@2.5.6 check supabase/functions/yezza-import/index.ts` completed with exit 0, and `auth_test.ts` passed 2/2 tests. PostgreSQL parsing with `pglast` succeeded for the source-identity migration, guarded-RPC migration, existing RPC integration suite, and the new `yezza_import_reconciliation.sql` suite. `git diff --check` passed after the Task 5 changes.

## Remaining required actions before any production apply

1. Run both PostgreSQL suites in an isolated non-production project with the deployed migrations and a representative approved fixture.
2. Run the complete four-CSV dry-run on a memory-capable local workstation and retain only sanitized review artifacts.
3. Obtain documented patient-review, repeated-IC, unresolved-doctor, financial-only-policy, count, total, artifact, and payload-hash approval.
4. Take and restore-test a production backup under a separately authorized change request.
5. Only after those gates pass, execute a separately authorized production apply and post-import verification. This task did not do so.
