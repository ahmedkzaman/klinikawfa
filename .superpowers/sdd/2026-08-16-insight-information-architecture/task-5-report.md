# Task 5 — Role-Safe Performance Aggregate Report

**Status:** Complete and locally verified on 2026-08-17. No migration was applied to any linked or production database.

## Delivered

- Added migration `20260816120000_add_insight_performance_report.sql` with the bounded JSONB RPC `public.get_insight_performance(date, date)`.
- Added a rollback-only SQL fixture covering the exact metric values and role visibility for doctor admin, resident doctor, operations, plain admin, denied operations override, locum, and guest.
- Added strict TypeScript payload normalization, generated RPC typing, and the React Query hook keyed by date range and viewer scope.
- Added focused migration, disposable PostgreSQL 17, domain-normalization, and hook tests.

## Security and visibility

- The RPC is `SECURITY DEFINER` with fixed `search_path = public, pg_temp`, derives the caller from `auth.uid()`, and resolves role and doctor identity through `user_roles`, `profiles`, and `doctors`.
- Access is limited to the current supported roles: `special_admin`, `admin`, `doctor_admin`, `resident_doctor`, `ops_staff`, and `operations`. Effective `reports.view` access honors per-user overrides through `has_clinic_permission`.
- Locum and guest remain denied even if an override grants `reports.view`; a supported account with an explicit false override is also denied.
- Named doctor rows are returned only for `special_admin` and `doctor_admin`. Residents receive only their bound doctor row plus an anonymous `Clinic benchmark`; plain admin receives only the benchmark; operations roles receive `doctors: []`. The fixture asserts that restricted payload text contains neither the other doctor's name nor UUID.
- Function execution is revoked from `PUBLIC` and `anon` and granted explicitly to `authenticated`.

## Metric contract

- Visits are completed, non-deleted, non-cancelled clinical visits grouped by Malaysia-local visit date, with payment-only visits excluded.
- Billing uses saved `price * quantity`; active items only are included. Inventory COGS uses bounded dispensed quantity, while non-inventory services and documents use billed quantity.
- Patient collections exclude panel allocation markers and deleted/voided payments. Panel classification uses the queue method or an active panel payment marker, covering co-payment visits.
- Missing item costs keep COGS, gross profit, and margin JSON values nullable. A completed visit with no active item does not create a phantom missing-cost count.
- Saved doctor roster shifts use S1 = 5 hours, S2 = 5 hours, and S3 = 4 hours.
- The current fixture asserts two visits, two patients, 10 rostered hours, 0.2 patients/hour, 263 billing, 60 patient-collected, 26.3 revenue/hour, six procedures, three documents, one self-pay visit, one panel visit, one unattributed issued document, and one excluded voided payment. Service and doctor rows are also checked field-by-field.

## TDD record

- Migration contract test: RED when the migration was absent, then GREEN after the secured RPC was added.
- Domain test: RED when the normalizer module was absent, then GREEN after strict normalization was implemented.
- Hook test: RED when the hook was absent, then GREEN after the query implementation was added.
- Panel co-payment fixture: RED when an active payment-side panel marker was not classified, then GREEN after classification was aligned.
- Empty-item missing-cost guard: RED against `count(*)` over the left join, then GREEN after counting real `item_id` values only.

## EXPLAIN and indexes

The executable PostgreSQL fixture runs `EXPLAIN (ANALYZE, BUFFERS)` against the representative internal aggregate SQL, not the PL/pgSQL wrapper. It loads a 5,000-row historical completed-workload sample on top of the historical production indexes. The existing queue-date, active-consultation, and active-item indexes already support their branches, so Task 5 adds no replacements for them. The issue-date document branch remains a sequential scan without a document issue-date index; the retained incremental document index changes that branch to an index scan and reduces the fixture's estimated aggregate total cost from 275.67 to 65.59.

## Verification

- `npm test -- src/test/insight-performance-migration.test.ts src/test/insight-performance-domain.test.ts src/test/use-insight-performance.test.tsx` — PASS, 3 files / 17 tests.
- Disposable native PostgreSQL 17 migration + rollback fixture — PASS, including exact metrics, role redaction, permission overrides, function privileges, date bounds, and EXPLAIN execution.
- Focused ESLint for all Task 5 TypeScript/test files — PASS.
- `git diff --check` — PASS (Git reports only the repository's expected LF-to-CRLF warning for the generated Supabase types file).
- `npx supabase migration list --linked` — PASS; remote history ends at `20260816015642` and `20260816120000` has no local or remote collision.
- `npx supabase db push --dry-run --linked` — PASS; it lists Task 5 followed by the three already-pending Task 4 migrations in timestamp order. No push occurred.
- `npx tsc --noEmit -p tsconfig.app.json` — repository baseline remains FAIL in unrelated existing files; a diagnostic filter found no Task 5 file errors.
- `npm test` — attempted as an additional repository-wide gate, then stopped after two unrelated cutover failures: one nested PowerShell environment did not expose `Get-FileHash`, and one test hard-codes PostgreSQL under `C:\Users\ahmed\...`. The Task 5 PostgreSQL test passed again during that run.

## Limitations and release safety

- The local Supabase Docker database was unavailable, so validation used an isolated native PostgreSQL 17 cluster reconstructed from the required schema.
- `supabase db test --linked` was not run because no linked project was explicitly approved as non-production. The linked connection was used only for migration history and dry-run inspection.
- No production migration apply, deployment, push, or schema mutation was performed.

## Review remediation addendum — 2026-08-17

This addendum supersedes the original EXPLAIN/index decision and records the seven `CHANGES_REQUIRED` fixes.

1. Resident payloads now return `services: []` in the security-definer RPC, matching `InsightAccess.canSeeServicePerformance = false`. Operations and approved administrator scopes retain service rows.
2. The React Query cache key now contains the authenticated user ID and the effective `reports.view` allowed state/version; it no longer relies on caller role. A denied account still calls the RPC so the server returns `42501`. Auth account changes cancel and remove all prior performance queries, while `clinic-permissions-changed` invalidates them.
3. Issued-document metrics are bounded by Malaysia-local `consultation_documents.created_at`. A document issued in-range for an older completed visit is included, while an out-of-range document attached to an in-range visit is excluded.
4. Billing continues to use saved billed `quantity`. Inventory COGS uses the Financial Control bound `greatest(least(coalesce(dispensed_qty, quantity), greatest(quantity, 0)), 0)`; non-inventory COGS uses billed quantity. Missing cost is raised only for dispensed inventory with non-positive unit cost. The fixture proves partial dispensing, zero-dispensed zero-cost inventory, a legitimate zero-cost service, and a zero-cost documentation fee.
5. Legacy procedure recovery now matches active item names to configured procedure services and recognizes `Excision Biopsy` / `Excision Biopsy (Procedure)` exactly as the current doctor activity contract. These rows participate in procedures, service volume, revenue, COGS/profit, and previous-period trends.
6. Current and comparison cohorts now require both `queue_entries.clinic_status = 'completed'` and `consultations.status = 'completed'`. A completed consultation on an incomplete queue is excluded by the executable fixture.
7. The fixture now loads 5,000 historical completed queue, consultation, item, and issued-document rows and runs the representative internal visit/item/document aggregate before and after the one retained incremental index. The baseline includes the production queue-date, active-consultation, active-item, and consultation-linked document indexes. Those historical indexes already support the visit/item path; the only evidenced gap is the independent document issue-date path, which changes from a sequential scan to an index scan after the retained Task 5 document index. The plan invokes the actual internal joins and predicates; it does not EXPLAIN the opaque PL/pgSQL wrapper.

### Remediation TDD and verification

- Each of the seven corrections was first represented by a failing contract, PostgreSQL behavior, hook, or AuthProvider cache test before implementation.
- `npm test -- src/test/insight-performance-migration.test.ts src/test/insight-performance-domain.test.ts src/test/use-insight-performance.test.tsx src/test/auth-insight-performance-cache.test.tsx` — PASS, 4 files / 21 tests.
- Native disposable PostgreSQL 17 migration and rollback fixture — PASS, including exact role visibility, metrics, legacy recovery, issue dates, quantity/COGS rules, cohort status, function privileges, and before/after plan nodes.
- Focused ESLint — 0 errors; one pre-existing `react-refresh/only-export-components` warning remains in `AuthContext.tsx`.
- Repository TypeScript baseline remains red outside Task 5; filtered output contains no diagnostic for a Task 5 remediation file.
- `git diff --check` — PASS apart from Git's line-ending notices.
- `npx supabase migration list --linked` — Task 5 remains pending without a history collision.
- `npx supabase db push --dry-run --linked` — PASS; Task 5 remains first, followed by the three already-pending Task 4 migrations. No push or apply occurred.
- Current Supabase guidance was rechecked: no relevant breaking change was found; security-definer search-path and explicit function privilege controls remain required.

## Review remediation addendum — round 2, 2026-08-17

This round-2 addendum supersedes both earlier index conclusions: the original claim that no index was justified and the round-1 claim that four new indexes were justified are no longer current.

- An in-range document issued for an older completed consultation with no doctor is included in the clinic document total and increments `quality.missing_attribution` / `confidence.missing_attribution`; confidence becomes `partial`. The report intentionally does not manufacture an `Unassigned` named-doctor row. The fixture proves that named-doctor document totals plus the unattributed document count reconcile to the clinic document total, with no silent loss.
- The disposable PG17 bootstrap now includes the relevant historical production indexes before the Task 5 migration is applied. A catalog assertion rejects duplicate active consultation-item indexes.
- The exact duplicate Task 5 consultation-item index was removed. The proposed queue and consultation indexes were also removed because the historical queue-date and active-consultation indexes already serve the representative aggregate.
- Only the document issue-date index remains. With 5,000 historical completed records, the internal aggregate's estimated total cost drops from 275.67 to 65.59 and the issue-date branch changes from a sequential scan to an index scan. Tests assert the access-path change and lower cost without depending on the retained index's name.

### Round-2 verification

- Focused Vitest suite — PASS, 4 files / 21 tests, including the disposable PostgreSQL 17 migration and rollback fixture.
- Focused ESLint — 0 errors; the existing `AuthContext.tsx` Fast Refresh warning remains unchanged.
- Repository TypeScript baseline remains red outside Task 5; filtered output contains no Task 5 diagnostic.
- `git diff --check` — PASS apart from Git's line-ending notices.
- `npx supabase migration list --linked` — PASS; remote history still ends at `20260816015642` and Task 5 remains pending without a timestamp/name collision.
- `npx supabase db push --dry-run --linked` — PASS; it would apply Task 5 followed by the same three already-pending Task 4 migrations. No migration was pushed or applied.
