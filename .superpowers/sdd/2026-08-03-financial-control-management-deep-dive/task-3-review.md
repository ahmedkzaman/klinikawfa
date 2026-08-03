# Task 3 Review: Typed Client Contract

Reviewed range: `e6310ddb0b1952490e9102f74c870c742d1fc9b8..74804c6eba8207bce8a26e2fc443b8b4d5b3f365`

## Findings

### Critical

None.

### Important

1. **Valid attribution-incomplete detail rows are rejected as malformed.**
   `FinancialControlDetailRow` declares `corrections`, `missingCostCount`, and
   `zeroPriceCount` as non-null numbers, and `parseDetailRow` requires all three to
   be integers (`src/lib/clinic/financialControl.ts:123` and
   `src/lib/clinic/financialControl.ts:346`). The server emits the underlying counts
   as `NULL` when visit attribution is incomplete
   (`supabase/migrations/20260803100000_add_financial_control_reports.sql:1725`),
   forwards those values into visit detail JSON
   (`supabase/migrations/20260803100000_add_financial_control_reports.sql:420`), and
   can also produce null grouped sums
   (`supabase/migrations/20260803100000_add_financial_control_reports.sql:544`). A
   valid page containing such a row therefore throws `Invalid financial control
   response` instead of preserving unavailable values for display and CSV export.
   Make these three fields nullable in the client contract, validate nullable
   integers, preserve them as blank CSV cells, and add visit/grouped incomplete-row
   fixtures.

### Minor

None.

## Spec Verdict

**Changes requested.** Task 3 is not fully spec-compliant because its detail guard
does not accept the server's valid nullable shape for attribution-incomplete rows.
The remaining reviewed requirements comply: exact enums and RPC argument names,
inclusive one-year validation, equal preceding comparison dates, complete and
separate query keys, pre-RPC validation, null alert forwarding, nested response
guards, RPC error preservation, generated Supabase declarations, RFC-4180 escaping,
two-decimal money, null-versus-zero CSV behavior, and no Task 4 UI changes.

## Quality Verdict

**Generally solid, but not approval-ready until the Important finding is fixed.**
The code is clearly organized, uses the generated Supabase client without a loose
cast, and keeps summary and detail failures isolated. The focused client fixtures do
not include the server's attribution-incomplete row shape, allowing the mismatch to
pass.

## Tests

- `npm.cmd test -- src/test/financial-control-lib.test.ts src/test/use-financial-control.test.tsx`
  - Exit 0: 2 files passed, 50 tests passed.
- `npx.cmd eslint src/lib/clinic/financialControl.ts src/hooks/clinic/useFinancialControl.ts src/test/financial-control-lib.test.ts src/test/use-financial-control.test.tsx`
  - Exit 0: no findings.
- `npx.cmd tsc --noEmit`
  - Exit 0: no TypeScript errors.
- DST probe with `TZ=America/New_York` across the March 2026 clock change
  - Seven selected days produced the exact preceding seven date keys:
    `2026-02-28..2026-03-06` before `2026-03-07..2026-03-13`.
- `git diff --check e6310ddb0b1952490e9102f74c870c742d1fc9b8..74804c6eba8207bce8a26e2fc443b8b4d5b3f365`
  - Exit 0.

## Reviewed Commits

- Base: `e6310ddb0b1952490e9102f74c870c742d1fc9b8`
- Head: `74804c6eba8207bce8a26e2fc443b8b4d5b3f365`