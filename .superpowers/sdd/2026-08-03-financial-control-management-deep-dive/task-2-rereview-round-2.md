# Task 2 Re-Review Round 2

## Scope

Reviewed `653df8f9fb2f762bd4b789ab9d61e6f97c977047..a1631ebdd7cf701ceec5c8950ebd042743b4c24f` against the two open findings from round 1 only, with focused regression checks for period cash, deterministic pagination, and item `visitCount`.

## Verdict

**Spec: PASS. Quality: PASS.**

### 1. Immutable Generic `other_charge` Representation And Reconciliation: ADDRESSED

- Completion snapshots now capture `charge_type_id`; the as-of bill-state resolver restores it from the immutable completion line when a correction snapshot omits it.
- Each canonical charge line is assigned exactly one accepted category: package, medicine, or procedure. Generic `other_charge` lines without an item, service, or package identity fall into procedure and use an immutable `charge_type:<uuid>` key, with the immutable line ID as fallback.
- All financial allocations retain their deterministic visit-wide residual, so the medicine, procedure, and package billed totals reconcile with canonical completed-visit billed totals within RM0.01.
- The executable fixture mutates the generic line name, price, and charge type, then deletes the current row after the reporting date; the procedure result still exposes the completion-time identity, label, and RM40 allocation.

### 2. Negative Margin And Correction-Count Reconciliation: ADDRESSED

- `negative_margin` now allocates the canonical visit-level `GREATEST(cogs - billed, 0)` amount rather than summing independently negative item margins. The mixed-margin fixture returns RM10 across item categories, matching the visit-level alert.
- `refund_void_correction` keeps its canonical alert key and nonzero correction count for every accepted category represented by a corrected visit. Counts are assigned once per category, preventing multiplication among groups in the same category.
- The executable mixed-category correction fixture confirms both medicine and procedure results expose `refund_void_correction` with `corrections = 1`.

## Protected Regression Checks

- **Period cash:** still derives item `cash_collected` amounts from allocated `paid_in_period`, not lifetime paid.
- **Pagination:** item ordering still ends with `group_key`; the existing one-row tied-group fixture remains stable and non-overlapping.
- **`visitCount`:** item aggregates still use `COUNT(DISTINCT queue_entry_id)`.

## New Regressions

None found in the fix scope.

## Verification

```powershell
$env:REQUIRE_POSTGRES_TEST='1'
npx.cmd vitest run --pool=threads --fileParallelism=false --maxWorkers=1 src/test/financial-control-report-migration.test.ts
```

Result: PASS, 1 file and 2 tests. The disposable PostgreSQL contract covered the two repaired findings and the protected behaviors.

```powershell
$env:REQUIRE_POSTGRES_TEST='1'
npx.cmd vitest run --pool=threads --fileParallelism=false --maxWorkers=1 src/test/financial-control-report-migration.test.ts src/test/completed-bill-correction-migration.test.ts src/test/financial-cogs-and-panel-pricing-migration.test.ts src/test/panel-claim-reconciliation-migration.test.ts src/test/finance-boundary-hardening.test.ts src/test/financial-payment-classification.test.ts
```

Result: PASS, 6 files and 33 tests.

```powershell
npx.cmd eslint src/test/financial-control-report-migration.test.ts
git diff --check 653df8f9fb2f762bd4b789ab9d61e6f97c977047 a1631ebdd7cf701ceec5c8950ebd042743b4c24f
```

Result: PASS; no lint errors or whitespace errors.
