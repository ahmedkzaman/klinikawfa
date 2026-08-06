# Task 2 Report: Protected Patient Explorer RPC

## Status

Completed and applied to development project `nhjbqdiyptjqherdfbqk`.

## Commit

`30e0f07ec44de8209b547e3935f3736b44011eee` (`feat: add protected patient explorer RPC`)

## Tests and Database Verification

- TDD red run: `npm.cmd test -- src/test/patient-explorer-migration.test.ts --run` failed because the migration did not yet exist.
- TDD green run: the same command passed with 6 tests covering the RPC contract, authorization, input validation, inclusive Kuala Lumpur dates, patient-level aggregation, and public-exposure protections.
- Applied `20260806100000_add_patient_explorer_rpc.sql` to development project `nhjbqdiyptjqherdfbqk` successfully.
- Read-only catalog verification confirmed `search_patient_explorer(jsonb,integer,integer)` returns `jsonb`, is `SECURITY INVOKER`, has `search_path=pg_catalog, public`, denies `anon` execution, and grants execution to `authenticated`.
- Read-only authenticated-context RPC verification confirmed the response contract, preserved pagination values, and page-size enforcement without returning patient data.
- Security and performance advisors were run. Neither reported a finding referencing `search_patient_explorer`; existing project-wide findings remain outside this task's scope.

## Concerns

- The current `patients` table has no dedicated postcode column. The RPC derives a displayed five-digit postcode from the current address and applies postcode search to that address.
- Existing source-table indexes already cover the demonstrated visit, consultation, and active-item join paths, so no new index was added.

## Fix Round 1

### Status

Completed and applied `20260806110000_fix_patient_explorer_postcode_and_validation.sql` to development project `nhjbqdiyptjqherdfbqk`.

### Verification

- TDD red run confirmed the strengthened contract rejected the previous catalog-text repair migration; the final focused run passed 9/9 tests.
- The follow-up migration asserts the deployed RPC signature, adds nullable `public.patients.postcode text` idempotently, and explicitly recreates the RPC with PostgreSQL-safe date and age regexes, explicit `dateMode` validation, and the stored postcode output/filter.
- Read-only development RPC verification under an eligible internal-user context accepted valid `all_time` and `custom` requests with age bounds `0` and `150`, rejected a missing `dateMode` with `22023` and `date mode must be all_time or custom`, and confirmed every returned row exposes a `postcode` key without returning patient data.
- Catalog verification confirmed `patients.postcode` is nullable `text`, `anon` cannot execute the RPC, and `authenticated` can execute it.
- Security advisor: 167 existing project findings; performance advisor: 510 existing project findings. Neither references `search_patient_explorer`.

### Remaining Concern

- Existing patient addresses were intentionally not parsed or backfilled into the new postcode column; postcode values must be recorded in the dedicated field going forward.

## Fix Round 2

### Status

Completed executable PostgreSQL integration coverage for the Patient Explorer RPC.

### Verification

- Added `stress-tests/phase-d/patient-explorer.contract.sql`, which loads both Task 2 migrations when run through `psql`, creates deterministic fixture data inside a rollback-only transaction, and invokes the RPC directly.
- Added the contract to the guarded Phase-D runner after its fixture seed, and retained the focused Vitest checks as supplemental coverage.
- Focused static suite passed: `npm.cmd test -- src/test/patient-explorer-migration.test.ts --run` (10/10).
- Executed the contract body against development project `nhjbqdiyptjqherdfbqk`; it verified valid `all_time`, custom-date, age, postcode field/filter, one-row-per-patient, missing-`dateMode`, invalid-range, and anonymous-denial behavior. A post-run query confirmed the fixture patient was rolled back.

### Remaining Concern

- The full guarded Phase-D staging runner could not be executed in this workspace because its intentionally uncommitted `.env.staging` credentials and Bash runtime are unavailable. The exact contract body was nevertheless executed successfully against the available development database.

## Fix Round 3

### Status

Completed Phase-D cleanup, local-date, and deterministic-fixture hardening.

### Verification

- Added focused regression coverage for cleanup-trap ordering, Asia/Kuala_Lumpur request-date derivation, and fixture-only patient-name filters. `npm.cmd test -- src/test/patient-explorer-migration.test.ts --run` passed 12/12.
- Executed the rollback-only Patient Explorer contract body against linked development project `nhjbqdiyptjqherdfbqk` through `supabase db query --linked`; it completed successfully.
- Queried the reserved fixture patient ID after the contract run and confirmed `fixture_count = 0`.
- `git diff --check` completed without whitespace errors.

### Remaining Concern

- The full guarded Phase-D staging runner and Bash syntax check could not run because this Windows workspace has no Bash runtime or staging credentials. The focused runner-order regression test and linked-project contract run cover the changed paths available here.
