# Task 7 Report: Final Financial Database Fixes

## Scope

Task 7 addresses the final-review database findings in:

- `supabase/migrations/20260803100000_add_financial_control_reports.sql`
- `src/test/financial-control-report-migration.test.ts`

No new client behavior was added as part of the Task 7 database follow-up.

## Root Causes

1. `cash_collected` selected and sorted by `paid_in_period`, but public detail rows
   and totals serialized `paid_to_date`. The displayed and CSV-facing Paid column
   therefore disagreed with the selected metric.
2. Report eligibility joined immutable completion records to mutable current queue
   and consultation status/deletion fields. Later reopen, cancellation, or soft
   deletion could remove a visit from an earlier as-of report.
3. Payment reassignment wrote a zero delta only against the new association. Panel
   reassignment wrote a new snapshot without clearing the old queue snapshot. Both
   paths could leave immutable financial state on the wrong visit.

## TDD Evidence

### Lifecycle RED

The focused PostgreSQL contract was extended with post-as-of reopen, cancellation,
and soft-deletion mutations. Before the lifecycle fix, the later report still
returned all three visits:

```text
CURRENT_VOIDED_COMPLETION_REMAINS_ELIGIBLE: 3
Test Files 1 failed
Tests 1 failed, 1 passed
```

### Reassignment RED

The contract then required explicit old-association removal and new-association
addition events for payment and panel transfers before and after completion. Before
the event fix, it failed at:

```text
PAYMENT_PRE_COMPLETION_REASSIGNMENT_EVENTS_MISSING
Test Files 1 failed
Tests 1 failed, 1 passed
```

The cash fixture uses an older-debt visit with RM50 lifetime paid and RM20 paid in
the selected period. A concurrent workspace change landed the metric-aware SQL
before the first isolated cash RED run completed, so no separate cash failure was
captured. The executable contract now asserts visible Paid, hidden amount, detail
totals, and displayed-row sums across every grouping.

## Implementation

- Public detail Paid values and totals use `paid_in_period` only when the selected
  metric is `cash_collected`; other metrics retain lifetime `paid_to_date` behavior.
- Completion records now form an append-only `completion`/`void` lifecycle. Status
  and `deleted_at` transitions append lifecycle events, and facts choose the latest
  eligible event at `_as_of_date`.
- Completion bill snapshots and report enrichment choose the latest eligible
  completion event, preventing duplicate rows after void/recompletion cycles.
- Payment and panel reassignment append named `reassignment_out` and
  `reassignment_in` events with balancing values. Removal legs do not count as cash
  refunds.
- Regression fixtures cover transfer before completion, transfer after completion,
  old/new visit reconciliation, event-pair cardinality, historical facts, public
  summary/details, and live void/recompletion capture.

## Verification

Focused disposable PostgreSQL contract:

```powershell
$env:REQUIRE_POSTGRES_TEST='1'; npx.cmd vitest run --pool=threads --fileParallelism=false --maxWorkers=1 src/test/financial-control-report-migration.test.ts
```

Result: exit code 0; 1 file passed, 2 tests passed.

Six-file financial regression:

```powershell
$env:REQUIRE_POSTGRES_TEST='1'; npx.cmd vitest run --pool=threads --fileParallelism=false --maxWorkers=1 src/test/financial-control-report-migration.test.ts src/test/completed-bill-correction-migration.test.ts src/test/financial-cogs-and-panel-pricing-migration.test.ts src/test/panel-claim-reconciliation-migration.test.ts src/test/finance-boundary-hardening.test.ts src/test/financial-payment-classification.test.ts
```

Result: exit code 0; 6 files passed, 33 tests passed.

Static verification:

```text
npx.cmd eslint src/test/financial-control-report-migration.test.ts: PASS
npm.cmd run lint:changed: PASS (16 changed JS/TS files)
npx.cmd tsc --noEmit: PASS
git diff --check: PASS
```

## Commit Note

The implementation was committed concurrently as
`1aef5cda6f3ce19a58dc7103fce80da17835ef0d` (`fix: harden financial control
reporting`). That commit also contains the separately requested final-review UI
error-message fix. This Task 7 follow-up does not modify those client files; it adds
only the strengthened migration contract and this report.
