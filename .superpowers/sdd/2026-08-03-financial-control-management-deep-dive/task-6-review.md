# Task 6 Independent Review: Export Parity And Failure Isolation

Reviewed range: `1bd557a23a1d17c364d62b43bc66edf017e3d643..6afd3cc2ae23d08a3f5179d133cf39ee7e8f4eef`

## Findings

### [P2] Negative numeric cells bypass the required formula neutralization

`src/lib/clinic/financialControl.ts:500` and
`src/lib/clinic/financialControl.ts:504`

`csvMoney` and `csvMargin` return formatted values directly instead of applying the
same leading-character neutralization used by `csvString`. Consequently, legitimate
negative financial values such as profit `-85` and margin `-12.5` are exported as
`-85.00` and `-12.5%`, without the required leading single quote. The Task 6 brief
requires cells beginning with `=`, `+`, `-`, or `@` to be prefixed before CSV
escaping; it does not limit that rule to string-backed fields. Apply neutralization
to the final formatted numeric cell value as well as string cells. The focused tests
cover formula-prefixed text but do not exercise negative money or margin cells.

## Spec And Quality Verdict

**Changes requested.** The implementation is well scoped and satisfies the export,
pagination, recovery, and isolation requirements apart from the formula-neutralization
gap above.

- Export requests preserve the current local date keys, metric, grouping, alert,
  and page size. Export columns match the rendered financial detail table and omit
  hidden clinical and claim fields.
- Multi-page RPC requests are awaited sequentially, start at page 1, stop at the
  10,000-row boundary, preserve server order, and show an explicit capped-export
  notice.
- UTF-8 BOM output, RFC-4180 comma/quote/newline escaping, blank null money values,
  and two-decimal money formatting are present. Formula neutralization is complete
  for string cells but incomplete for negative numeric cells.
- The filename uses local `yyyy-MM-dd` date keys and the required metric/grouping
  segments. The export control has an accessible name, fixed height and width, and
  disabled/loading behavior without label-driven layout movement.
- Summary and detail retries call only their own query result's `refetch`. A failed
  section does not hide successful data from the other section; stale cached data is
  retained with an explicit stale/error label, and `Last updated` comes from the
  summary server timestamp.
- The reviewed range changes only the five Task 6 implementation/test files plus the
  required report. It adds no migration, generated database type, Task 7 behavior,
  clinical field export, clinical fetch, or non-financial RPC.

## Tests

Command:

```powershell
npm.cmd test -- src/test/financial-control-lib.test.ts src/test/financial-control-components.test.tsx
```

Result: **PASS**. Two test files passed; 29 tests passed and 0 failed. Vitest reported
20.11 seconds total duration.

Additional review check: `git diff --check` passed for the full reviewed range.
