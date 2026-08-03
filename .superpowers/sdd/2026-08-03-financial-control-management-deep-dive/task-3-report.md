# Task 3 Report: Typed Client Contract

## RED Evidence

Command:

```powershell
npm.cmd test -- src/test/financial-control-lib.test.ts src/test/use-financial-control.test.tsx
```

Observed result: exit code 1. Vitest reported 2 failed test suites and no tests
collected because `@/lib/clinic/financialControl` and
`@/hooks/clinic/useFinancialControl` did not exist. The run completed in 20.47s.

## Implementation Summary

- Added explicit metric, grouping, alert, summary, reconciliation, detail-row,
  pagination, and totals types matching the Task 2 JSON keys.
- Added structural guards for both RPC responses. Malformed data throws exactly
  `Invalid financial control response`, while RPC errors are rethrown unchanged.
- Added Malaysia-local date keys, an equal preceding comparison period, one-year
  range validation, enum and pagination validation, and complete stable query keys.
- Added independent typed React Query hooks for summary and detail RPCs without a
  loose Supabase client cast.
- Added RFC 4180 CSV serialization with CRLF rows, quote/comma/newline escaping,
  two-decimal monetary values, and blank output for nullable accounting values.
- Added generated-style Supabase declarations for both Task 2 RPC signatures.

## GREEN Verification

```powershell
npm.cmd test -- src/test/financial-control-lib.test.ts src/test/use-financial-control.test.tsx
```

Exit code 0. 2 test files passed; 50 tests passed; 0 failed. Vitest duration:
31.79s.

```powershell
npx.cmd eslint src/lib/clinic/financialControl.ts src/hooks/clinic/useFinancialControl.ts src/test/financial-control-lib.test.ts src/test/use-financial-control.test.tsx
```

Exit code 0. No lint errors or warnings.

```powershell
npx.cmd tsc --noEmit
```

Exit code 0. No TypeScript errors.

```powershell
npm.cmd run build
```

Exit code 0. Vite transformed 5,297 modules and completed the production build in
31.98s. Existing dependency/chunk warnings were emitted for `face-api.js`, stale
Browserslist data, CommonJS use in `dashjs`, large chunks, and ineffective dynamic
imports.

## Changed Files

- `src/lib/clinic/financialControl.ts`
- `src/hooks/clinic/useFinancialControl.ts`
- `src/integrations/supabase/types.ts`
- `src/test/financial-control-lib.test.ts`
- `src/test/use-financial-control.test.tsx`
- `.superpowers/sdd/2026-08-03-financial-control-management-deep-dive/task-3-report.md`

## Self-Review

- Compared every summary, reconciliation, alert, detail-row, and totals property
  against `20260803100000_add_financial_control_reports.sql`.
- Confirmed query keys include all RPC date, comparison, filter, alert, and page
  state and keep summary/detail caches independent.
- Confirmed invalid enum and pagination values fail before `supabase.rpc` executes.
- Confirmed nullable accounting values remain null through parsing and blank in CSV,
  rather than becoming zero.
- Confirmed only the Task 3 file set and this report changed; no UI or Insight files
  were modified.
- `git diff --cached --check` passed before the implementation commit.

## Concerns

- The production build succeeds but retains the repository's existing dependency
  and bundle-size warnings listed above.
- UTF-8 BOM output, spreadsheet-formula neutralization, and bounded multi-page export
  remain intentionally deferred to Task 6 as specified by the plan.
- The requested focused tests, lint, typecheck, and build were run. The full test
  suite was not requested or run; the ledger records that it exceeds the controller's
  300-second window.

## Commit SHA

Implementation commit: `cafe25ae2881b8977580e17a9a8e63fe92c2a284`
