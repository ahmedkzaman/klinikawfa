# Task 2 Re-review Round 1

## Verdict

- **Spec compliance: NO**
- **Task quality: Not approved**
- **Open findings: 2 addressed, 2 not addressed**
- **New regressions introduced by the fix: None found**

## Per-finding Status

### 1. Immutable/canonical historical item grouping, including reconciliation: NOT ADDRESSED

The immutable/as-of portion is addressed: recorded completion events now snapshot item
state, the as-of resolver selects completion/correction state without falling back to
mutable live rows for exact visits, and item allocation uses canonical visit amounts
(`supabase/migrations/20260803100000_add_financial_control_reports.sql:117-239`,
`:653-740`). The added historical mutation fixtures exercise this path.

Full reconciliation is still not guaranteed. Valid generic and completed-bill
`other_charge` lines have no `item_id`, `service_id`, or `package_id`; the existing
correction boundary creates exactly that shape
(`supabase/migrations/20260728150000_add_completed_bill_corrections.sql:1369-1386`).
The fix includes these lines in `gross_total` and allocates part of canonical billed,
paid, outstanding, discount, tax, and refund to them, but then filters them out of all
three item grouping branches because none of the three identifiers is present
(`supabase/migrations/20260803100000_add_financial_control_reports.sql:653-740`,
`:788-790`). The completion snapshot also does not retain `clinic_charge_type_id`
(`:117-141`). Consequently, the combined medicine/procedure/package result can still
fall short of canonical visit totals. The new RM425 fixture only contains lines that
have one of the three accepted identifiers and does not cover this valid charge path.

### 2. Item `cash_collected` uses `paid_in_period`: ADDRESSED

The item allocator separately carries `paid_to_date` and `paid_in_period`, and the
`cash_collected` amount uses allocated `paid_in_period`
(`supabase/migrations/20260803100000_add_financial_control_reports.sql:695-720`,
`:806`). The focused fixture verifies RM6.67 of in-period item cash rather than the
lifetime amount.

### 3. Item adjustment/alert combinations return contract values and alert keys: NOT ADDRESSED

The fix now returns allocated discount, tax, refund, correction/count fields and
aggregated alert keys, and most alert-specific amounts linearly reconcile. However,
the `negative_margin` item amount is computed independently per line as
`GREATEST(item.cogs - item.billed, 0)` (`:818`), while the canonical summary and visit
detail contract compute it once per visit as `GREATEST(report.cogs - report.billed,
0)` (`:327`, `:2140`). A mixed-margin visit can therefore return an item alert amount
larger than the canonical visit alert amount: profitable lines cannot offset losing
lines after the per-line `GREATEST`. The new fixture covers only a single-line
negative-margin visit, so it does not exercise this divergence.

There is also a residual correction-payload gap: a visit's correction count is placed
only on `line_number = 1` before category filtering (`:767`, `:788-790`). In a mixed
medicine/procedure/package visit, an item grouping that does not contain that first
line can return the `refund_void_correction` alert key while reporting zero
corrections. Because not every accepted item alert/grouping combination returns the
canonical contract values, this finding is only partially fixed.

### 4. Deterministic item pagination under tied groups: ADDRESSED

Item groups now use `group_key` as the final ordering key after amount, completed date,
and queue-entry UUID (`:861-867`). The added one-row page fixture repeats tied queries
and verifies stable, non-overlapping keys.

## Deferred Minor

The deferred `visitCount` issue is addressed: item aggregation now uses
`COUNT(DISTINCT queue_entry_id)` (`:838`).

## New Regressions

No separate regression introduced by `9f78481..b5382c6` was found. The two failing
verdicts above are incomplete resolution of the scoped open findings, not unrelated
pre-existing issues reopened by this review.

## Verification

```powershell
$env:REQUIRE_POSTGRES_TEST='1'
npm.cmd test -- src/test/financial-control-report-migration.test.ts
```

Result: PASS, 1 file and 2 tests.

```powershell
$env:REQUIRE_POSTGRES_TEST='1'
npm.cmd test -- src/test/financial-control-report-migration.test.ts src/test/completed-bill-correction-migration.test.ts src/test/financial-cogs-and-panel-pricing-migration.test.ts src/test/panel-claim-reconciliation-migration.test.ts src/test/finance-boundary-hardening.test.ts src/test/financial-payment-classification.test.ts
```

Result: PASS, 6 files and 33 tests.
