# Task 3 Rereview, Round 1: Nullable Incomplete-Row Counts

Reviewed range: `1deed64565040da1e138e5da953518be8557d72c..e0e689c98c8962edb2df9bbe0404147cff334df8`

## Scoped Verdict

**Addressed.** No fix-introduced regressions found within the requested scope.

`FinancialControlDetailRow` now declares `corrections`, `missingCostCount`, and
`zeroPriceCount` as `number | null`. `parseDetailRow` accepts each field only when
it is either `null` or a non-negative integer, retaining rejection of negative and
fractional values. The two new hook fixtures confirm both attribution-incomplete
visit rows and grouped rows are accepted and retain the three `null` values.

CSV export passes these fields through `csvValue`: `null` becomes an empty cell,
whereas numeric `0` follows the non-null branch and serializes as `0`. The updated
CSV expectation verifies three blank count cells for an incomplete row; this remains
distinct from zero.

No changed consumer assumes the three fields are always numbers. Reconciliation
`corrections` remains independently required and non-null.

## Verification

- `npm.cmd test -- src/test/financial-control-lib.test.ts src/test/use-financial-control.test.tsx`
  - Exit 0: 2 files passed, 52 tests passed.
- `npx.cmd eslint src/lib/clinic/financialControl.ts src/test/financial-control-lib.test.ts src/test/use-financial-control.test.tsx`
  - Exit 0: no findings.
- `npx.cmd tsc --noEmit`
  - Exit 0: no TypeScript errors.
- `git diff --check 1deed64565040da1e138e5da953518be8557d72c e0e689c98c8962edb2df9bbe0404147cff334df8`
  - Exit 0.

## Reviewed Commits

- Base: `1deed64565040da1e138e5da953518be8557d72c`
- Head: `e0e689c98c8962edb2df9bbe0404147cff334df8`
