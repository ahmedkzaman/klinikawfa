# Yezza final review repair report

Date: 2026-08-06

## Outcome

The Critical and Important final-review findings were repaired without a
production database change, deployment, approval call, or apply request.
Production import remains blocked by the runtime gate in
`docs/YEZZA_IMPORT_RUNBOOK.md`.

## Repairs

1. **Duplicate source IC/passport quarantine**
   - Dry-run pre-indexes normalized source identifiers before matching.
   - Every source row sharing a non-blank identifier is forced to `review`,
     including rows with distinct source IDs and names.
   - Preparation independently repeats this guard and requires
     `confirmedDuplicateIdentifier: true` for every affected locator.

2. **Deterministic bounded preparation and execution**
   - Added `npm run yezza:prepare` and `npm run yezza:batch`.
   - The preparation path consumes all four CSVs plus a private explicit
     patient/doctor resolution file.
   - CSV input is streamed, consultation data is not loaded wholesale, and
     retained patient/transaction indexes plus the active output batch are
     bounded.
   - Prepared batch arrays are capped at 2,000 and request bodies at 8 MiB.
   - Output includes byte-stable batch JSON, source file hashes, resolution
     hash, manifest hash, artifact hash, strict financial reconciliation, and
     per-batch payload hashes/counts.
   - The coordinator revalidates each dry-run before approve/apply, persists
     approval IDs locally, and retries the same byte-identical payload and
     import batch ID.
   - The approved 67,442-bill/RM5,684,929.22/RM1,099,076.00 baseline is
     mandatory in the CLI; the non-production reconciliation override exists
     only on the programmatic test interface.

3. **Reviewable artifacts without PHI leakage**
   - Sanitized reports now use deterministic locators such as
     `patients.csv:2`, `consultations.csv:3`, and transaction row locators.
   - Raw patient, doctor, visit, and target-patient mappings are written to a
     separate private `review_mapping.csv`, outside the sanitized report tree.
   - Private review/prepared directories and the four source filenames are
     ignored by Git.

4. **Fail-closed roster loading**
   - Missing roster credentials now stop dry-run before classification.
   - Patient or doctor query failures already throw and continue to stop the
     run; an empty fallback roster is no longer returned.

5. **Derived review evidence and approval binding**
   - Edge preparation derives patient review count from stable review
     locators, unresolved doctor count from unique doctor-review keys, and
     orphan count from financial-only visit shapes.
   - Caller-supplied aggregate review counts are overwritten by the derived
     values.
   - Dry-run and approval expose/check payload, resolution, and manifest hashes;
     the payload hash stored by the approval RPC therefore binds the two new
     evidence hashes and the derived counts.

6. **Immutable patient source mappings**
   - The apply RPC now rejects a supplied `existingPatientId` that conflicts
     with an existing `patient_external_ids` binding.
   - The rollback-only SQL integration test verifies failure and confirms the
     original mapping is unchanged.

7. **Runtime gate and minor conflict cleanup**
   - The runbook documents the strict local workflow, private artifacts,
     batch ordering, retry behavior, and the isolated non-production SQL gate.
   - It explicitly states that repository checks are not runtime database
     verification.
   - Blank optional values on both source and target no longer produce false
     phone, DOB, or address conflicts.

## Focused regression coverage

- Duplicate normalized source identifiers with different source IDs/names.
- Stable sanitized locators plus separate private PHI mapping.
- Missing roster credentials fail before reports/classification.
- Blank optional conflict suppression.
- Byte-identical preparation across two runs.
- 2,001 source patients split into bounded arrays.
- Prepared payload hashes match the Edge normalizer hashes.
- Duplicate-identifier confirmation gate.
- Strict dry-run before approval and byte-identical apply/retry bodies.
- Review counts derived despite forged aggregate input.
- Manifest/resolution mismatch rejection at approval.
- Existing source-patient remap rejection in TypeScript behavior and SQL.

## Verification evidence

- `npx tsc --noEmit`: passed.
- Direct ESLint over all changed TypeScript/test/Edge files: passed.
- Focused Yezza Vitest suite: 5 files, 43 tests passed.
- Preparation boundary rerun: 3 tests passed, including payload hash agreement.
- `git diff --check`: passed (line-ending conversion notices only).
- `npm run lint:changed`: could not calculate a diff because this worktree's
  branch has no merge base with the fetched `origin/main`; direct ESLint was
  used instead and passed.
- Deno is not installed in this workspace, so `deno test` was not run.
- No database connection or local Supabase runtime was used. The rollback-only
  SQL tests were extended but **runtime database verification was not
  performed**.

## Safety statement

No supplied source CSV, generated PHI payload, access token, service-role key,
production data, backup operation, RPC approval, RPC apply, migration deploy,
or application deploy is included in or performed by this repair.
