# Task 6 Report: Export Parity And Failure Isolation

## RED Evidence

The unchanged Task 3-5 baseline passed before Task 6 tests were added:

```powershell
npm.cmd test -- src/test/financial-control-lib.test.ts src/test/financial-control-components.test.tsx
```

Exit code 0. Two files passed; 20 tests passed and 0 failed. Vitest duration:
15.55s.

After adding only the Task 6 tests, the same command exited 1. Vitest ran 29 tests:
18 existing tests passed and all 11 new tests failed for the intended missing
behavior. The failures covered absent export helpers and controls, no BOM or formula
neutralization, the old hidden-column CSV shape, no bounded page collector, no
truncation notice, and no summary/detail retry or stale-data presentation.

The first implementation run reached 28/29 tests. The remaining browser test used
`FileReader.readAsText`, which strips a UTF-8 BOM while decoding. The assertion was
corrected to verify the Blob's three-byte BOM delta; the library test continues to
assert the leading `U+FEFF` directly.

## Implementation Summary

- Replaced the broad Task 3 CSV shape with the exact visible Task 5 table columns,
  including the visit/group entity, completed date, doctor, payment, five financial
  amounts, margin, and visible links only.
- Added UTF-8 BOM output, RFC 4180 quote/comma/newline escaping, spreadsheet-formula
  neutralization for string cells beginning with `=`, `+`, `-`, or `@`, two-decimal
  monetary formatting without currency symbols, and blank null cells.
- Added the required local-date filename and a sequential page collector that keeps
  the active dates, metric, grouping, alert, and page size, starts at page 1, and
  stops at 10,000 rows.
- Added a fixed-size, accessible CSV export control with disabled/loading state,
  direct filtered RPC page requests, download error feedback, and a clear 10,000-row
  truncation notice.
- Added summary- and detail-scoped retry actions. Stale cached sections remain
  visible with explicit stale labels, detail remains mounted if the summary fails,
  and the server `generated_at` value remains the source for `Last updated`.

## GREEN Verification

```powershell
npm.cmd test -- src/test/financial-control-lib.test.ts src/test/financial-control-components.test.tsx
```

Exit code 0. Two files passed; 29 tests passed and 0 failed. Vitest duration: 19.03s.

```powershell
npx.cmd eslint src/lib/clinic/financialControl.ts src/components/clinic/insight/management src/test/financial-control-lib.test.ts src/test/financial-control-components.test.tsx
```

Exit code 0 in 9.0s. No lint errors or warnings.

```powershell
npx.cmd tsc --noEmit
```

Exit code 0 in 4.5s. No TypeScript errors.

```powershell
npm.cmd run build
```

Exit code 0. Vite transformed 5,306 modules and completed the production build in
16.36s. The existing browser-externalization, stale Browserslist, CommonJS,
large-chunk, and ineffective dynamic-import warnings remain.

```powershell
git diff --check
git diff --cached --check
```

Both exited 0 before the implementation commit. No whitespace errors.

## Changed Files

- `src/components/clinic/insight/management/FinancialDetailSheet.tsx`
- `src/components/clinic/insight/management/FinancialControlTab.tsx`
- `src/lib/clinic/financialControl.ts`
- `src/test/financial-control-lib.test.ts`
- `src/test/financial-control-components.test.tsx`
- `.superpowers/sdd/2026-08-03-financial-control-management-deep-dive/task-6-report.md`

## Self-Review

- Confirmed export page requests use the exact existing detail RPC and preserve the
  current local date keys, metric, grouping, alert, and page size on every page.
- Confirmed the collector is sequential and bounded: supported page sizes produce at
  most 400 requests, no page beyond the 10,000-row ceiling is requested, and the
  downloaded rows preserve server order.
- Compared CSV headers with the rendered financial-detail table. Clinical notes,
  diagnoses, attachments, claim internals, consultation IDs, and other hidden fields
  are not serialized.
- Confirmed formula neutralization happens before RFC 4180 escaping, numeric money is
  not converted to currency text, nulls remain blank, and the BOM is present once.
- Confirmed retries call only the corresponding React Query result's `refetch` and do
  not invalidate or hide the other section.
- Confirmed export and retry controls have button semantics, accessible names,
  visible focus styling, stable heights, and a fixed export width that does not shift
  between idle and loading labels.
- Confirmed no migration, Supabase generated type, hook, Insight shell, Task 7, or
  unrelated file was modified.

## Concerns

- The production build retains the pre-existing warnings listed above.
- At the smallest supported page size, a capped export can make up to 400 sequential
  RPC requests. This is deliberate to preserve the current page-size filter and the
  hard row ceiling from the approved brief.
- Rendered tests cover accessibility and responsive-safe class behavior. No
  authenticated live browser fixture was available for a screenshot pass.
- The Task 7 PostgreSQL/full integration suite was intentionally not run or modified.

## Commit SHA

Implementation and tests commit:
`c37803efe5916c4a2b3bbd33a9a6b2ffee478aaf`
