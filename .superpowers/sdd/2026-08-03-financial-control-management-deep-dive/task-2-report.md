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

## Fix Round 1/5 - 2026-08-03

### Status

DONE

All four open findings from `task-2-review.md` were addressed. The deferred Minor
`visitCount` issue was also corrected as part of the item aggregation change.

### RED Evidence

Command:

```powershell
$env:REQUIRE_POSTGRES_TEST='1'
npm.cmd test -- src/test/financial-control-report-migration.test.ts
```

Result: exit code 1; one of two tests failed. Disposable PostgreSQL rejected the
fixture at `financial_visit_completion_events.item_state` because the immutable
completion event had no item snapshot column. This was the expected missing contract
for the Critical historical item-state finding.

### Implementation

- Added immutable `item_state` JSON snapshots to exact recorded completion events;
  synthetic legacy completions require `NULL` item state and remain incomplete.
- Added execute-revoked private helpers to capture completion lines and resolve one
  canonical bill state as of the requested Malaysia date from completion and
  correction snapshots.
- Preserved completion-time item, service, and package identities and unit cost when
  correction snapshots omit those immutable fields or later catalog deletion clears
  live foreign keys.
- Routed canonical visit COGS, missing-cost counts, zero-price counts, and all item
  detail grouping through the same as-of item state. Item reports no longer read
  mutable active `consultation_items` rows.
- Allocated canonical net billed, lifetime paid, period paid, outstanding, discount,
  tax, and refund amounts across canonical gross charge lines, with a deterministic
  residual line so allocations reconcile within RM0.01.
- Made `cash_collected` item amount use allocated `paid_in_period`, while retaining
  allocated lifetime paid as the row's contextual `paid` value.
- Preserved adjustment fields, correction counts, missing/zero-cost counts, and alert
  keys for item rows. Selected alert drill-downs now use the alert-specific amount for
  item and doctor/payment/panel groupings.
- Added `group_key` after amount, completed date, and queue UUID for deterministic
  tied item pagination. Item `visitCount` now counts distinct queue entries.
- Extended private-function postflight checks to both new historical helpers.

### Executable Fixtures

- Post-period medicine deletion plus name, identity, price, and cost rewrite.
- Post-period procedure correction plus adjustment deletion and service identity
  clearing.
- RM100 gross procedure with RM10 discount and RM5 tax, asserted as canonical RM95.
- Older RM30 receipt plus in-period RM20 receipt, asserting RM6.67 item-period cash
  rather than RM16.67 lifetime cash.
- Every 9 metric x 7 grouping combination and every 10 alert x 7 grouping
  combination, including non-zero adjustment and exact alert payload assertions.
- Two equal RM50 medicine groups from one visit straddling one-row pages, queried
  repeatedly with stable non-overlapping results.
- Medicine, procedure, and package exact allocations asserted to sum to the RM425
  canonical selected cohort within RM0.01.

### GREEN Evidence

Focused executable PostgreSQL contract:

```powershell
$env:REQUIRE_POSTGRES_TEST='1'
npm.cmd test -- src/test/financial-control-report-migration.test.ts
```

Result: exit code 0; one file and two tests passed. The executable test applied the
migration to disposable PostgreSQL 17.10 and exercised the historical mutations,
net allocations, period cash, adjustment and alert payloads, complete accepted
parameter matrices, tied pagination, incompleteness, access controls, and postflight.

Financial regression command:

```powershell
$env:REQUIRE_POSTGRES_TEST='1'
npm.cmd test -- src/test/financial-control-report-migration.test.ts src/test/completed-bill-correction-migration.test.ts src/test/financial-cogs-and-panel-pricing-migration.test.ts src/test/panel-claim-reconciliation-migration.test.ts src/test/finance-boundary-hardening.test.ts src/test/financial-payment-classification.test.ts
```

Result: exit code 0; six files and 33 tests passed.

Additional verification:

```powershell
npx.cmd eslint src/test/financial-control-report-migration.test.ts
# exit code 0

npx.cmd tsc --noEmit
# exit code 0

npm.cmd run build
# exit code 0
```

The build retained the existing browser-data, externalized Node module, CommonJS/ESM,
large chunk, and ineffective dynamic-import warnings.

### Self-Review

- Confirmed exact recorded completions cannot exist without an array item snapshot,
  while synthetic legacy rows cannot claim one.
- Confirmed the as-of resolver selects the latest correction at or before the cutoff,
  otherwise the earliest future correction's before-state, otherwise completion state;
  it never falls back to mutable current billing rows for exact visits.
- Confirmed catalog identities and unit cost are restored only by matching immutable
  completion line UUID, so newly added correction lines do not inherit unrelated data.
- Confirmed residual allocation is deterministic by canonical line UUID and category
  group ordering has the required stable final key.
- Confirmed item and dimension alert filters still originate in shared canonical visit
  predicates, and grouped payloads retain the matched alert keys and exact selected
  alert amount.
- Confirmed no Task 3 client files were modified.

### Concerns

- `supabase db lint --local` could not connect because the local Docker-backed
  Supabase database was unavailable (`LegacyDbConnectError`). The migration was
  executed directly against disposable PostgreSQL 17.10 instead.
- The production build retains the repository's pre-existing warnings listed above.
- The earlier report concern about mutable item grouping is resolved by this round's
  immutable completion/correction snapshot path.

## Fix Round 2/5 - 2026-08-03

### Status

DONE

Both NOT ADDRESSED findings from `task-2-rereview-round-1.md` were corrected without
changing the already-passing period-cash, deterministic-pagination, or distinct
`visitCount` behavior. No Task 3 files were touched.

### RED Evidence

The generic-charge, mixed-margin, and mixed-category correction fixtures were added
before the reporting SQL was changed.

Command:

```powershell
$env:REQUIRE_POSTGRES_TEST='1'
npm.cmd test -- src/test/financial-control-report-migration.test.ts
```

Result: exit code 1; one of two tests failed in executable PostgreSQL with:

```text
GENERIC_ITEM_RECONCILIATION_MISMATCH: visit 300.00, items 260.00
```

This demonstrated that the valid RM40 completed-bill `other_charge` with no item,
service, or package ID was absent from every accepted item grouping. The same RED
fixture also contained a mixed profitable/loss visit whose old per-line margin logic
would report RM90 instead of the canonical RM10, and a correction whose first line
was procedure while its medicine result needed to retain the correction alert.

### Implementation

- Added immutable `charge_type_id` to completion snapshots and preserved it while
  merging as-of correction snapshots by immutable line UUID.
- Classified every canonical charge line exactly once: package first, then medicine,
  with service and generic `other_charge` lines represented as procedure. Generic
  lines use stable `charge_type:<uuid>` group keys, with immutable line UUID as the
  final fallback.
- Continued allocating canonical visit billed, payment, outstanding, discount, tax,
  and refund values over the complete canonical charge set, so the combined accepted
  item categories reconcile to visit amounts within RM0.01.
- Allocated the canonical visit-level `GREATEST(cogs - billed, 0)` alert amount over
  canonical lines with the same deterministic residual-line method used by the other
  financial allocations. Mixed line profitability can no longer inflate the visit
  alert amount.
- Assigned each visit's correction count once per accepted category using a stable
  category line order. A corrected visit therefore retains the alert and a non-zero
  correction count in every category it contributes to, without duplicating the
  count across multiple groups inside that category.

### Executable Fixtures

- A valid RM40 generic completed-bill `other_charge` keyed by
  `clinic_charge_type_id`, followed after the report date by name, amount, and charge
  type mutation plus deletion. The procedure drill-down must retain the completion
  identity, label, and amount.
- Combined medicine, procedure, and package billed totals asserted equal the RM300
  exact-attribution visit total within RM0.01.
- A mixed-margin visit with an RM80 profitable medicine and RM90 loss procedure,
  whose canonical visit loss is RM10; combined item alert amounts must equal RM10.
- A corrected mixed-category visit whose lexically first line is a procedure and
  second line is a medicine; both category results must expose
  `refund_void_correction` with correction count 1.

### GREEN Evidence

Focused executable PostgreSQL contract, using a single thread to avoid Vitest's
60-second fork-worker RPC heartbeat during the disposable database run:

```powershell
$env:REQUIRE_POSTGRES_TEST='1'
npx.cmd vitest run --pool=threads --fileParallelism=false --maxWorkers=1 src/test/financial-control-report-migration.test.ts
```

Result: exit code 0; one test file passed and two tests passed. The executable test
applied the migration to disposable PostgreSQL and passed all original and round-2
assertions.

Financial regression command:

```powershell
$env:REQUIRE_POSTGRES_TEST='1'
npx.cmd vitest run --pool=threads --fileParallelism=false --maxWorkers=1 src/test/financial-control-report-migration.test.ts src/test/completed-bill-correction-migration.test.ts src/test/financial-cogs-and-panel-pricing-migration.test.ts src/test/panel-claim-reconciliation-migration.test.ts src/test/finance-boundary-hardening.test.ts src/test/financial-payment-classification.test.ts
```

Result: exit code 0; six files and 33 tests passed.

Additional verification:

```powershell
npx.cmd eslint src/test/financial-control-report-migration.test.ts
# exit code 0

npx.cmd tsc --noEmit
# exit code 0

npm.cmd run build
# exit code 0
```

The build retained the repository's existing browser-data, externalized Node module,
CommonJS/ESM, large chunk, and ineffective dynamic-import warnings.

### Self-Review

- Confirmed generic charges are sourced only from immutable completion/correction
  state for exact visits and remain stable after current-row mutation or deletion.
- Confirmed category precedence makes each canonical charge line representable once,
  avoiding both omissions and cross-category duplication.
- Confirmed each deterministic residual allocation sums exactly to its canonical
  visit value, including the RM10 mixed-margin alert.
- Confirmed correction allocation is partitioned by visit and accepted category, so
  filtering another category cannot remove the count and repeated groups within one
  category cannot multiply it.
- Confirmed all changes are limited to the Task 2 migration, executable migration
  test, and this appended report.

### Concerns

- The repository's default forked Vitest command twice completed both PostgreSQL
  assertions successfully but exited 1 after the test exceeded its 60-second worker
  RPC heartbeat (`Timeout calling "onTaskUpdate"`). The equivalent single-thread
  focused and six-file commands above both exited 0; this is a test-runner timing
  issue rather than a database assertion failure.
- The production build retains the repository's pre-existing warnings listed above.
