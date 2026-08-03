# Task 1 Report: Canonical Financial Visit Facts

## Status

DONE

## Commits

- `36b9e53` - `feat: add canonical financial control facts`
- `33791df` - `fix: preserve financial event history`

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

## Initial-Round Concerns

- The initial implementation's mutable panel timestamp concern was confirmed by
  independent review and is resolved in Fix Round 1 below.
- The successful production build emits pre-existing browser-data, externalized
  Node module, large chunk, and dynamic-import warnings unrelated to Task 1.

## Fix Round 1

### Status

DONE

### Commit

- `33791df` - `fix: preserve financial event history`

### Findings Addressed

- Replaced mutable `panel_claims.received_amount`/`updated_at` period attribution
  with immutable panel claim state and receipt-delta events. Multiple receipts are
  additive, status-only edits move no cash, post-as-of events are excluded, and
  payment events plus panel receipts are summed rather than compared with
  `GREATEST`.
- Replaced queue registration date with an immutable visit-completion event written
  only after both the consultation and queue are completed.
- Replaced current payment amount at original `created_at` with immutable receipt,
  correction, void, and restoration deltas. A later payment reduction preserves the
  original collection period and reports the negative movement/refund in the later
  period.
- Excluded zero-priced package child lines from COGS, missing-cost, and zero-price
  exceptions when an active charged package parent contains the child in
  `package_items`.
- Added `synthetic_backfill` provenance with `attribution_complete = false` for
  pre-boundary completed visits, payments, and panel claims. Completion and panel
  receipt dates are not fabricated; affected fact dates and financial values return
  `NULL` until exact attribution exists.

### RED Evidence

Command:

```powershell
$env:REQUIRE_POSTGRES_TEST='1'
npm.cmd test -- src/test/financial-control-report-migration.test.ts
```

Result: exit code 1; 1 test file failed, 2 tests failed. The static contract failed
because `private.financial_visit_completion_events` was absent. The disposable
PostgreSQL fixture failed because trigger
`capture_financial_visit_completion_from_queue` did not exist. These failures
confirmed the review scenarios required a new durable event boundary.

### GREEN Evidence

Focused command:

```powershell
$env:REQUIRE_POSTGRES_TEST='1'
npm.cmd test -- src/test/financial-control-report-migration.test.ts
```

Result: exit code 0; 1 test file passed, 2 tests passed. The executable fixture now
covers two panel receipts, additive self-pay plus panel cash, a non-receipt claim
edit, a receipt and claim-state mutation after the requested as-of date, queue
registration before midnight with bill completion after midnight, a later
cross-period payment correction/refund, a charged package with a zero-priced child,
synthetic legacy provenance/unavailable values, event immutability, and live capture
trigger behavior.

Relevant regression command:

```powershell
$env:REQUIRE_POSTGRES_TEST='1'
npm.cmd test -- src/test/financial-control-report-migration.test.ts src/test/completed-bill-correction-migration.test.ts src/test/financial-cogs-and-panel-pricing-migration.test.ts src/test/panel-claim-reconciliation-migration.test.ts src/test/finance-boundary-hardening.test.ts src/test/financial-payment-classification.test.ts
```

Result: exit code 0; 6 test files passed, 33 tests passed.

Additional commands and results:

```powershell
npx.cmd eslint src/test/financial-control-report-migration.test.ts
# exit code 0, no findings

npm.cmd run build
# exit code 0, production build completed

git diff --cached --check
# exit code 0, no whitespace errors before the fix commit
```

The build emitted only the repository's existing browser-data, externalized Node
module, CommonJS/ESM, large chunk, and ineffective dynamic-import warnings.

### Self-Review

- Confirmed no cash-period calculation reads mutable `panel_claims.updated_at`,
  current `payments.amount`, or queue registration time.
- Confirmed immutable owner-only event tables reject update/delete and revoke table,
  sequence, and capture-function privileges from `PUBLIC`, `anon`, and
  `authenticated`.
- Confirmed completion capture handles either transition order: the event is written
  only once both queue and consultation are completed.
- Confirmed payment insert uses the source receipt `created_at`; later mutations use
  the actual statement timestamp and record only the delta.
- Confirmed panel events snapshot amount/status/received state at each mutation and
  carry a separate receipt delta, so non-receipt edits cannot move cash.
- Confirmed as-of claim state selects only events available by the requested local
  day and completed-bill totals use the latest audit `after_state` or the earliest
  future audit `before_state` through the existing correction-state boundary.
- Confirmed panel cash adds valid payment deltas and panel receipt deltas; no
  deduplication heuristic discards legitimate value.
- Confirmed pre-boundary records use explicit incomplete provenance and return
  unavailable `NULL` values instead of synthetic accounting dates.
- Confirmed package child detection requires an active charged package line and a
  matching `package_items` target, so standalone zero-price lines still alert.
- Confirmed Task 2 public report RPCs remain absent.

### Remaining Concerns

- Pre-boundary bill-completion and panel-receipt timing is inherently unavailable in
  the source schema. The fix exposes that limitation with synthetic provenance and
  `NULL` fact values; it does not attempt to reconstruct or invent those dates.
- The successful build retains unrelated existing warnings noted above.
