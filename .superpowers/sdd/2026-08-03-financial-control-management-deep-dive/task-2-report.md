# Task 2 Report: Public Financial Control Reporting RPCs

## Status

DONE

## Implementation Commit

- `d16f579` - `feat: add financial control reporting RPCs`

## Files Changed

- `supabase/migrations/20260803100000_add_financial_control_reports.sql`
- `src/test/financial-control-report-migration.test.ts`
- `.superpowers/sdd/2026-08-03-financial-control-management-deep-dive/task-2-report.md`

Task 3 client code was not implemented or modified.

## Implementation

- Added `public.get_financial_control_summary(date,date,date,date,date) returns jsonb`.
- Added `public.get_financial_control_details(date,date,date,text,text,text,integer,integer) returns jsonb`.
- Added the private, execute-revoked `private.financial_control_report_rows(date,date,date)` helper so summary alert counts and detail alert filters use the same predicates.
- Snapshot panel claim due dates into the immutable panel claim event stream so overdue claims are evaluated as of the requested date instead of from mutable current state.
- Kept `private.financial_control_visit_facts(date,date,date)` as the canonical source. The summary materializes it once for the selected period and once for the comparison period; a detail request materializes it once in its executed grouping branch.
- Implemented the ten exact alert keys and their literal thresholds: RM0.01 reconciliation tolerance, RM50 or 10 percent large discount, two elapsed Monday-Friday dates for unsubmitted claims, five-minute duplicate payments, and excess payments above RM0.01.
- Implemented all nine exact metrics, all seven exact groupings, nullable alert filtering, pages starting at one, page sizes from one through 100, and deterministic amount/date/UUID ordering.
- Added visit, medicine, procedure, package, doctor, payment type, and panel provider JSON rows with bounded pagination and unpaginated filtered totals.
- Added fixed `pg_catalog, public, private` search paths, explicit `postgres` ownership, authenticated-only public RPC grants, private helper revocation, and a migration postflight.

## Incomplete Attribution

- Legacy rows retain their unavailable `NULL` dates and amounts in detail rows; no row-level amount is replaced with zero.
- Summary values are known subtotals and include `attributionComplete`, `costComplete`, `incompleteVisits`, and `missingCostItems` metadata.
- Alerts include `attributionComplete` and `incompleteRows` on every entry.
- Detail totals include `attributionComplete`, `costComplete`, and `incompleteRows`.
- A period with only unattributable legacy cohort rows returns `NULL` for unavailable cohort amounts in both the period and reconciliation objects instead of reporting an exact zero.

## RED Evidence

Initial command:

```powershell
$env:REQUIRE_POSTGRES_TEST='1'
npm.cmd test -- src/test/financial-control-report-migration.test.ts
```

Result: exit code 1; both tests failed. The static contract could not find either public RPC, and disposable PostgreSQL rejected the fixture because the immutable panel event table did not yet snapshot `due_date`.

Self-review regression command:

```powershell
$env:REQUIRE_POSTGRES_TEST='1'
npm.cmd test -- src/test/financial-control-report-migration.test.ts
```

Result: exit code 1; the executable assertion `EMPTY_KNOWN_COHORT_INVENTED_ZERO` found that the period object returned `NULL` while reconciliation returned `0.00` for the same unavailable legacy-only billing cohort. Reconciliation was then aligned with the period contract.

## GREEN Evidence

Focused executable PostgreSQL contract:

```powershell
$env:REQUIRE_POSTGRES_TEST='1'
npm.cmd test -- src/test/financial-control-report-migration.test.ts
```

Result: exit code 0; one test file passed and two tests passed. The disposable PostgreSQL run applied the migration and executed summary, reconciliation, all ten alerts, all metrics, all groupings, deterministic pagination, incomplete attribution, invalid input, unauthorized access, locum-without-Insight behavior, authenticated-role execution, grants, and private function isolation.

Relevant financial regressions:

```powershell
$env:REQUIRE_POSTGRES_TEST='1'
npm.cmd test -- src/test/financial-control-report-migration.test.ts src/test/completed-bill-correction-migration.test.ts src/test/financial-cogs-and-panel-pricing-migration.test.ts src/test/panel-claim-reconciliation-migration.test.ts src/test/finance-boundary-hardening.test.ts src/test/financial-payment-classification.test.ts
```

Result: exit code 0; six test files passed and 33 tests passed.

Additional verification:

```powershell
npx.cmd eslint src/test/financial-control-report-migration.test.ts
# exit code 0

npx.cmd tsc --noEmit
# exit code 0

npm.cmd run build
# exit code 0

git diff --cached --check
# exit code 0 before the implementation commit
```

The build retained existing browser-data, externalized Node module, CommonJS/ESM, large chunk, and ineffective dynamic-import warnings.

## Self-Review

- Confirmed both public functions authorize with `auth.uid()` and `public.can_view_insights(auth.uid())` before validation or cross-RLS reads and raise SQLSTATE `42501` when denied.
- Confirmed the public functions are `SECURITY DEFINER` only for the required reporting boundary, have fixed search paths, are owned by `postgres`, revoke `PUBLIC` and `anon`, and grant only `authenticated` execution.
- Confirmed the private facts and report helper remain inaccessible to `PUBLIC`, `anon`, and `authenticated`.
- Confirmed summary and detail alerts share one predicate source and exact alert keys.
- Confirmed selected and comparison report inputs are separately materialized and date ranges over 366 calendar days fail with SQLSTATE `22023`.
- Confirmed detail filters reject every value outside the exact metric, grouping, and alert sets; page and page-size bounds fail closed.
- Confirmed monetary JSON values are rounded to two decimals and percentages to one decimal.
- Confirmed ordering is amount descending, completed date descending, then queue entry UUID, with unavailable amounts last.
- Confirmed no clinical notes or unrelated patient data enter the financial detail rows.
- Confirmed no Task 3 files or client contracts were changed.

## Concerns

- Supabase CLI `2.109.1` is installed, but local advisors could not run because the Docker daemon/local Supabase stack was unavailable. The executable contract instead used a disposable PostgreSQL 17.10 instance and verified the migration directly.
- Item-level medicine, procedure, and package grouping uses the active consultation item rows beneath the canonical visit boundary because Task 1 exposes visit-level totals rather than immutable line-level financial snapshots. Visit totals, alert predicates, authorization, and incomplete attribution remain canonical; a future immutable item-state boundary would improve historical line grouping after post-completion item edits.
- The successful build retains the repository's existing warnings listed above.
