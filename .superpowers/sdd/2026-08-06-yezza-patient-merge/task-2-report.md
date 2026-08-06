# Task 2 report — deterministic Yezza matching dry run

## Delivered

- Added deterministic patient matching and identifier, phone, and name normalization helpers.
- Matching order is exact IC/passport, exact normalized phone + name + DOB, name + DOB review, then new patient. Name-only candidates are never auto-merged.
- Exact matches report demographic conflicts as field names only; no Klinik Awfa record is changed.
- Added `npm run yezza:dry-run -- --input-dir <local-csv-directory> [--output-dir <sanitized-report-directory>]`.
- The dry run requires the four local source filenames: `patients.csv`, `consultations.csv`, `transactions_1.csv`, and `transactions_2.csv`. It deduplicates transactions by the approved six-field key and performs no database writes.
- When both read-only Supabase credentials are locally configured (`YEZZA_SUPABASE_URL`/`YEZZA_SUPABASE_SERVICE_ROLE_KEY`, or their non-Yezza equivalents), it reads current patients and doctors. Without them it still runs, with all patient matches treated as new and doctor names reported as unresolved.

## Sanitized artifacts

The dry run writes only:

- `patient_matches.csv`
- `patient_review.csv`
- `unresolved_doctors.csv`
- `orphan_financial_visits.csv`
- `summary.json`

All source and current-record references in the CSV reports are run-scoped HMAC-SHA-256-derived references. The secret key is generated in memory for the run and is never written to a report. The reports contain no patient names, IDs, phone numbers, addresses, raw doctor names, or source visit/bill identifiers. Summary totals are aggregated only.

## Verification

- Focused Vitest run: 9/9 tests passed in `src/test/yezza-patient-matching.test.ts`.
- Runtime smoke test used temporary synthetic CSV input (removed afterwards): generated all five report files, removed one duplicate transaction, found one orphan financial visit, and reported zero database writes.
- TypeScript node config check: passed.
- `git diff --check`: passed.

## Operational note

The supplied source CSVs are deliberately not stored in this repository and were not committed. To produce the live dry-run reports, execute the command above from a controlled local directory containing those four files, then review `patient_review.csv`, unresolved doctors, orphan visits, and summary totals before any later import task.

## Review-fix round

- Duplicate-ID and duplicate phone/name/DOB conflicts now report only the number of candidates. They never carry raw Klinik Awfa patient IDs into report-bound output.
- Added an end-to-end temporary-fixture test that parses all four CSVs, verifies the approved six-field transaction deduplication, finds an orphan financial visit, creates all five reports, and asserts that raw source values and current patient UUIDs are absent.
- The test configures a mocked read-only Supabase roster and verifies that no `insert`, `update`, or `upsert` call occurs. It leaves no fixture or report files behind.
- Focused verification after the repair: 10/10 tests passed across matching and dry-run report suites; `git diff --check` passed.
