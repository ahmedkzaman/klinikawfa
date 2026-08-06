# Task 3 Report

Status: complete

Commit: cb4cb74b6ed4c19733fdc4edfbc59bfe2d4f7b65 (`feat: add patient explorer query hook`)

Tests:

- RED: `npm.cmd test -- src/test/patient-explorer-hook.test.tsx --run` failed because `src/hooks/clinic/usePatientExplorer.ts` did not exist; 0 tests ran.
- GREEN: `npm.cmd test -- src/test/patient-explorer-hook.test.tsx --run` passed: 1 file, 6 tests.
- Focused lint: `npx.cmd eslint src/hooks/clinic/usePatientExplorer.ts src/test/patient-explorer-hook.test.tsx` passed.

Concerns:

- Repository-wide `npm.cmd run lint` and `npx.cmd tsc --noEmit -p tsconfig.app.json` remain blocked by pre-existing errors in unrelated files.
- The page must pass `undefined` or `null` before Apply and pass the applied filters afterward; draft filter state should remain outside this hook.

## Fix Round 1

Status: complete

Changes:

- Persisted the applied-filter page reset while the parent continues to provide the pre-Apply page. A different page from the parent resumes normal pagination.
- Extended the reset test with an unchanged-filter rerender, asserting that it makes no page-3 RPC request and continues to expose page 1.
- Reworked the test wrapper so each test creates one stable `QueryClient`, preserving the cache across rerenders and exercising the changed query key.
- Preserved the RPC payload, disabled-until-Apply behavior, and loading/error behavior.

Verification:

- RED: `npm.cmd test -- src/test/patient-explorer-hook.test.tsx --run` failed as expected: the unchanged-filter rerender made a third RPC call using the stale page.
- GREEN: `npm.cmd test -- src/test/patient-explorer-hook.test.tsx --run` passed: 1 file, 6 tests.
- Focused lint: `npx.cmd eslint src/hooks/clinic/usePatientExplorer.ts src/test/patient-explorer-hook.test.tsx` passed.
