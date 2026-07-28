# Doctor Clinical Activity Insight — Final Fix Report

Date: 2026-07-28 (Asia/Kuala_Lumpur)

## Status

All required final-review fixes and the strongly preferred minor fixes in `final-fix-brief.md` were implemented in the shared worktree. The focused test set, direct ESLint invocation, production build, and final diff checks completed successfully.

No production migration was applied. No rebase, push, deployment, or production data access was performed.

## Changes

### Complete RPC pagination

- The client fetches `get_doctor_clinical_activity` in deterministic 1,000-row ranges.
- Paging continues until a short page is received.
- Mapping and aggregation happen only after all pages have loaded.
- A 1,001-row regression test verifies both page boundaries, 1,000 procedure rows, one MC row, exact details, and the final aggregate row count.

### Required detail fields and expansion behavior

- Every expanded activity row displays its exact `activityDate`.
- Procedure rows use a dedicated Procedure column.
- Document rows display separate Type and Document Name columns.
- MC, quarantine, and referral types use human-readable labels.
- Tests cover procedure, MC, quarantine, and referral dates and names, including SQL fallback-style document names.
- Documents-only doctors open on the Documents tab.
- Expansion state is keyed synchronously by date range plus doctor, avoiding transient details from a cached prior range.
- Loading and error states now expose `role="status"` and `role="alert"`.

### Nullable, canonical queue labels

- `queueSequence` is `number | null` from the generated RPC result through mapped rows, aggregation, UI, and CSV.
- Null is no longer converted to zero.
- UI and CSV share one `doctorActivityQueueLabel` formatter backed by the clinic’s canonical `formatQueueNo`.
- Null sequence values display/export as `—`.
- Regression coverage proves the same daily sequence on different dates produces distinct date-qualified labels.

### CSV formula-injection protection

- Exported text cells beginning with `=`, `+`, `-`, `@`, tab, carriage return, or line feed are neutralized with a leading apostrophe before normal CSV quote escaping.
- Tests cover every dangerous prefix and combinations containing commas, quotes, and embedded newlines.

### Migration history and SQL hardening

- The deployed base migration was renamed from:
  - `20260728102430_add_doctor_clinical_activity_report.sql`
  - to `20260728113618_add_doctor_clinical_activity_report.sql`
- Its body was not changed. SHA-256 before and after rename:
  - `910058197E2A3C4A8575C094F57333C60BE230F8E64137CE35A494887ED8E4E7`
- All SQL behavior changes are isolated to:
  - `20260728122132_harden_doctor_clinical_activity_report.sql`
- The follow-up replaces the RPC and preserves:
  - `SECURITY DEFINER` with fixed `public, pg_temp` search path
  - `can_view_insights(auth.uid())` authorization
  - no `consultation_documents.created_by` exposure
  - procedure service classification
  - consultation/item soft-delete filters
  - completed-consultation filter
  - MC/quarantine/referral classification
  - Kuala Lumpur half-open date boundaries
  - authenticated-only execution grant with `PUBLIC` and `anon` revoked
- The follow-up adds deterministic ordering by `activity_date`, `activity_kind`, and `activity_id`.
- Doctor labels now resolve as:
  1. null doctor ID → `Unassigned`
  2. trimmed `profiles.full_name`
  3. trimmed `doctors.name`, joined by `doctors.user_id = consultations.doctor_id`
  4. `Unknown doctor`
- Blank document template names fall back to the canonical human-readable name for their document kind.
- The RPC rejects date differences greater than 365, matching the UI cap.
- Migration contract tests cover the exact filename, fallback precedence, join, ordering, 365-day cap, grants, authorization, classification, sensitive-field boundary, deletion filters, and Kuala Lumpur bounds.

### Legacy Scoreboards copy

- The no-data message now states that no legacy scoreboard metrics were found, rather than claiming there were no completed consultations.

## Test-driven evidence

### Baseline

Command:

```text
npm.cmd test -- --run src/test/doctor-clinical-activity.test.ts src/test/use-doctor-clinical-activity.test.tsx src/test/doctor-clinical-activity-component.test.tsx src/test/doctor-clinical-activity-migration.test.ts src/test/scoreboards-doctor-clinical-activity.test.tsx
```

Result before new tests: 5 files passed, 23 tests passed.

### Red phase

The new tests were run before implementation. They produced 22 expected failures across the missing pagination, nullable queue mapping, canonical queue export, formula neutralization, date/type UI, documents-only default, accessibility roles, legacy copy, migration filename, doctor fallback, ordering, and 365-day SQL-cap contracts.

### Green and final focused verification

Command:

```text
npm.cmd test -- --run src/test/doctor-clinical-activity.test.ts src/test/use-doctor-clinical-activity.test.tsx src/test/doctor-clinical-activity-component.test.tsx src/test/doctor-clinical-activity-migration.test.ts src/test/scoreboards-doctor-clinical-activity.test.tsx src/test/scoreboard-procedure-classification.test.ts
```

Result: 6 files passed, 41 tests passed, 0 failed.

## Lint

Direct ESLint was run against every changed TypeScript/TSX feature and test file.

Result: exit code 0, no lint findings.

## Production build

Command:

```text
npm.cmd run build
```

Result: exit code 0; 5,288 modules transformed; production bundle built in 10.72 seconds.

Existing non-blocking build warnings remain:

- stale Browserslist data
- `face-api.js` browser externalization of `fs`
- CommonJS `exports` usage in the dash.js ESM bundle
- large output chunks
- existing ineffective dynamic-import notices

No warning was introduced specifically by this fix wave.

## Self-review

- `git diff --check`: clean.
- Base-migration content hash: unchanged.
- Functional SQL changes: follow-up migration only.
- Pagination ordering keys and SQL order: aligned.
- Nullable queue sequence: preserved at every typed boundary.
- UI/CSV queue format: one shared function.
- CSV neutralization occurs before quote escaping.
- Production migration application: intentionally not performed.
- Unrelated `.superpowers/brainstorm/` files were left untracked and excluded from the scoped commit.

## Concerns and deferred checks

- The follow-up SQL was verified through migration contract tests and review, not applied to production per instruction.
- No local PostgreSQL/Supabase integration database was used in this wave; runtime migration validation remains part of the controller’s controlled release process.
- The production build’s pre-existing dependency and bundle-size warnings remain outside this feature’s scope.

## Commit

This report is included in the scoped final-fix commit. The immutable commit hash is provided in the controller handoff because a commit cannot contain its own final hash.
