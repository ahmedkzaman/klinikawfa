# Task 1 Report: Canonical Financial Visit Facts

## Status

DONE_WITH_CONCERNS

## Commits

- `36b9e53` - `feat: add canonical financial control facts`

## Files Changed

- `supabase/migrations/20260803100000_add_financial_control_reports.sql`
- `src/test/financial-control-report-migration.test.ts`
- `.superpowers/sdd/2026-08-03-financial-control-management-deep-dive/task-1-report.md`

## RED Evidence

### Initial Contract RED

Command:

```powershell
$env:REQUIRE_POSTGRES_TEST='1'
npm.cmd test -- src/test/financial-control-report-migration.test.ts
```

Result: exit code 1; 1 test file failed, 2 tests failed. The static contract reported
that the migration did not exist, and disposable PostgreSQL reported that
`20260803100000_add_financial_control_reports.sql` was missing.

### Self-Review Edge-Case RED

Command:

```powershell
$env:REQUIRE_POSTGRES_TEST='1'
npm.cmd test -- src/test/financial-control-report-migration.test.ts
```

Result: exit code 1; 1 test passed and 1 failed. The seeded conflicting
queue/consultation payment was incorrectly allocated, producing
`paid_to_date: 837.00` for the fully paid visit. The same fixture also assigned
non-zero configured costs to discount and tax rows to ensure they could not enter
COGS.

## GREEN Evidence

### Focused PostgreSQL Contract

Command:

```powershell
$env:REQUIRE_POSTGRES_TEST='1'
npm.cmd test -- src/test/financial-control-report-migration.test.ts
```

Result: exit code 0; 1 test file passed, 2 tests passed. The disposable PostgreSQL
test applied the migration and reconciled five visit facts covering Malaysia local
dates, fully and partially paid self-pay, older debt, partial panel receipt,
discount, tax, refund/correction, zero-cost and zero-price medicine, partial
dispensing, package COGS, soft deletes, conflicting payment links, validation,
authorization, and private execute privileges.

### Relevant Financial Regressions

Command:

```powershell
$env:REQUIRE_POSTGRES_TEST='1'
npm.cmd test -- src/test/financial-control-report-migration.test.ts src/test/completed-bill-correction-migration.test.ts src/test/financial-cogs-and-panel-pricing-migration.test.ts src/test/panel-claim-reconciliation-migration.test.ts src/test/finance-boundary-hardening.test.ts src/test/financial-payment-classification.test.ts
```

Result: exit code 0; 6 test files passed, 33 tests passed.

### Lint And Build

Commands and results:

```powershell
npx.cmd eslint src/test/financial-control-report-migration.test.ts
# exit code 0, no findings

npm.cmd run build
# exit code 0, production build completed

git diff --cached --check
# exit code 0, no whitespace errors before the implementation commit
```

The build retained existing dependency/chunk-size warnings; it introduced no build
failure.

## Self-Review

- Confirmed Task 1 only: no `public.get_financial_control_*` RPC was added.
- Confirmed the exact return contract and one row per active completed visit up to
  `_as_of_date`.
- Confirmed null, reversed, early as-of, and over-366-calendar-day ranges raise
  SQLSTATE `22023`.
- Confirmed Insight authorization uses `public.can_view_insights(auth.uid())` and
  unauthorized access raises SQLSTATE `42501`.
- Confirmed owner `postgres`, `SECURITY INVOKER`, fixed search path
  `pg_catalog, public, private`, and execute revocation from `PUBLIC`, `anon`, and
  `authenticated`.
- Confirmed current completed-bill totals come through
  `public.completed_bill_correction_state`; immutable audit rows provide in-period
  refund movement and correction count.
- Confirmed active payment allocation accepts a consistent queue link or a
  consultation-only link and rejects conflicting dual links.
- Confirmed medication COGS clamps dispensed quantity to zero through ordered
  quantity; non-medication cost snapshots use ordered quantity; discount and tax
  adjustments cannot contribute COGS.
- Confirmed active panel claims exclude rejected/cancelled claims and bound panel
  outstanding at zero.
- Reviewed existing indexes and added none: production already has active
  consultation/item/payment indexes, queue status/date indexes, the functional
  Malaysia-date queue index, the unique panel-claim queue lookup, and correction
  audit queue/consultation indexes. No equivalent index was duplicated.
- Confirmed unrelated worktree state was clean before edits and only Task 1 files
  were included in the implementation commit.

## Concerns

- `panel_claims` has a cumulative `received_amount` and mutable `updated_at`, but no
  immutable panel-receipt ledger or receipt timestamp. `paid_to_date` is exact for
  the latest active claim state, while `paid_in_period` attributes that cumulative
  receipt to the claim's latest update date. Multiple historical receipts cannot be
  reconstructed exactly until a receipt ledger exists.
- The successful production build emits pre-existing browser-data, externalized
  Node module, large chunk, and dynamic-import warnings unrelated to Task 1.
