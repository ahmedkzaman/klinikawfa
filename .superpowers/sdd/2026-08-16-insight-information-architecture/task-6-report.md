# Task 6 — Detailed Performance UI and Exports Report

**Status:** Complete and locally verified on 2026-08-17. The Task 5 performance migration remains unapplied; no migration, push, or deployment was performed.

## Delivered

- Replaced the legacy mixed Performance body with a dedicated aggregate-backed workspace using `useInsightPerformance` and the secured `get_insight_performance` RPC contract.
- Added clinic totals for completed visits, unique patients, rostered hours, patients per hour, visit billing, revenue per hour, gross profit, procedures, documents, and self-pay/panel mix.
- Added sortable doctor performance with completed visits as the default descending sort. Doctor detail opens only after an explicit click and provides workload, financial contribution, clinical activity, and quality-guardrail tabs.
- Added sortable service performance with revenue as the default descending sort, explicit unavailable cost/margin values, comparison wording, responsive cards, and an on-demand service detail sheet.
- Added named-doctor and service CSV exports to the shared Insight export menu. Exports include the selected range, generation timestamp, metric-definition version, confidence, missing-attribution/cost counts, stable IDs, and factual metrics. Spreadsheet formula prefixes are neutralized.
- Extended the existing secured doctor-clinical-activity view for a selected doctor. Procedures display saved charged unit and total prices; documents and procedures remain linkable to the permitted queue record; the selected-doctor CSV is registered only while that on-demand detail is mounted.
- Added `?section=performance&doctor=<id>` deep-link support. Closing detail removes only the doctor parameter, leaving the Performance section selected.
- Replaced legacy Performance refresh prefixes with `insight-performance` and `doctor-clinical-activity`; Scoreboards and Leaderboards are no longer mounted by the Insight shell.

## Access and redaction

- The UI refuses to invoke the performance hook when Insight access or viewer identity is unavailable. Locum and guest route access remains denied.
- `special_admin` and `doctor_admin` can see named doctors, service performance, and the lazy secured clinical-activity detail.
- `resident_doctor` sees only their own doctor row plus the anonymous clinic benchmark. A defensive client filter removes unexpected other-doctor rows even if a malformed payload is supplied. Service performance and visit-level clinical records remain hidden.
- `operations` and `ops_staff` see clinic and service performance without doctor rows.
- Plain `admin` sees the anonymous clinic benchmark and service performance without named-doctor detail.
- Client presentation is a second boundary only. The Task 5 RPC continues to derive the authenticated caller, enforce effective `reports.view`, and redact the payload server-side.

## States, confidence, and interaction

- Loading, retryable error, empty, partial, updating, stale, and successful states have distinct messages. Previously loaded results remain visible during a refresh or refresh error.
- Reports generated more than 15 minutes ago are marked stale. Aggregate confidence, missing doctor attribution, missing costs, and excluded voided payments are shown without converting unavailable values to zero.
- Financial language distinguishes saved billed work from collected cash. Quality guardrails are described as workflow/completeness exceptions rather than medical-quality judgments.
- Tables use labelled sort controls, detail controls have accessible names and minimum touch targets, wide content scrolls safely, and service rows become cards on narrow screens.

## TDD record

- Performance component/permission tests first failed because the new workspace did not exist and selected-doctor detail was unsupported, then passed after the minimal components and lazy detail boundary were added.
- A stale-report regression first failed because an old generation timestamp was shown as current, then passed after the stale state was implemented.
- The section refresh contract first failed against the legacy query prefixes, then passed after refresh was limited to the secured performance and clinical-activity queries.
- A malicious spreadsheet-prefix export test first failed because a doctor name beginning with `=HYPERLINK` was emitted directly, then passed after export neutralization was added.

## Verification

- Exact Task 6 suite: `npm test -- src/test/insight-performance-tab.test.tsx src/test/insight-performance-permissions.test.tsx src/test/doctor-clinical-activity-component.test.tsx src/test/doctor-clinical-activity.test.ts src/test/scoreboards-doctor-clinical-activity.test.tsx --reporter=dot` — PASS, 5 files / 41 tests.
- Expanded affected suite: `npm test -- src/test/insight-performance-tab.test.tsx src/test/insight-performance-permissions.test.tsx src/test/doctor-clinical-activity-component.test.tsx src/test/doctor-clinical-activity.test.ts src/test/scoreboards-doctor-clinical-activity.test.tsx src/test/insight-query-enablement.test.tsx src/test/insight-shell.test.tsx src/test/insight-performance-state.test.tsx src/test/insight-panel-billed-card.test.tsx src/test/use-insight-performance.test.tsx src/test/insight-performance-domain.test.ts src/test/auth-insight-performance-cache.test.tsx --reporter=dot` — PASS, 12 files / 70 tests.
- Focused ESLint across every changed Task 6 TypeScript and test file — PASS with zero errors and zero warnings.
- `npm run build` — PASS. Existing Vite configuration, browser-externalized `fs`, large-chunk, CommonJS, and ineffective dynamic-import warnings remain.
- `npx tsc --noEmit -p tsconfig.app.json` — repository baseline remains FAIL in unrelated existing files, including editor/home/permissions code and the pre-existing doctor-domain fixture/lib-target diagnostics. A fresh diagnostic filter reports no Task 6 changed-file TypeScript errors.
- `git diff --check` — PASS; Git reports only expected LF-to-CRLF notices.
- Source scan of the Performance components, page integration, and export module found no raw Supabase table query or direct fetch path; data access remains through the existing query hooks/RPCs.

## Release safety and retained compatibility

- The Task 5 migration is still pending and was not applied locally or remotely. No Supabase push, schema mutation, deployment, or production action was performed.
- The legacy `ScoreboardsTab` source is retained for compatibility and its regression test remains green, but the Insight Performance shell no longer imports or mounts it.
- Resident doctor detail intentionally stops at secured aggregate summaries because the legacy visit-level clinical-activity RPC does not authorize resident access. No broader data access was manufactured in the client.

## Review remediation — 2026-08-17

The `CHANGES_REQUIRED` review was addressed additively. Task 5 and the new Task 6 completion migration remain unapplied; no local or remote migration apply, push, deployment, or production action occurred.

### Authoritative access boundary

- Added `get_insight_viewer_scope()` as the single server-derived effective `reports.view` boundary. It uses the Task 2/5 account-specific permission helper, returns the active resident doctor identity, versions the effective permission inputs, uses a fixed `search_path`, and is executable only by `authenticated`.
- `AuthProvider`, the outer clinic route, and `InsightRoute` now wait for and enforce that effective scope. An explicit per-user `false` fails closed even for an otherwise-supported role, unresolved access mounts no Insight source, and malformed allowed payloads are redacted rather than trusted.
- Performance query keys retain account identity and permission version, and an explicitly denied scope cannot schedule an RPC. Resident identity is never inferred from the first doctor row.

### Secured report and detail contracts

- Added the uniquely named `get_insight_performance_filtered(date,date,uuid,text,text,boolean)` RPC. Doctor, self-pay/panel, consultation/procedure/document, and comparison inputs are validated server-side. Resident doctor filters are bound to the authenticated resident identity; named filters remain restricted to named-doctor roles. Clinic, doctor, and service results are recalculated for the selected filters, including equivalent-period service trends.
- Added the lazy `get_insight_performance_detail(date,date,text,text)` RPC. Doctor detail includes actual visit date/shift distribution, measured called-to-completion duration, payer mix, saved revenue/COGS/profit/margin and revenue rates, procedure economics, diagnoses, medicines, and doctor-specific workflow-quality counters. Service detail includes daily demand/revenue, visit-level quantity/charged/cost/profit rows, payer mix, current catalog economics, historical price/cost/margin, and named doctor contribution only for permitted roles. Residents cannot query service drill-downs; admin/operations payloads do not contain doctor identities.
- Replaced the authoritative doctor-clinical-activity function additively. Document rows now join active `consultation_items.source_document_id` and return the saved unit price, quantity, and total. The UI and existing CSV path render/export those fields for procedures and documents.
- All new/replaced RPCs use fixed search paths, derive `auth.uid()` themselves, enforce effective Insight access, validate bounded dates and enum-like filters, and revoke `PUBLIC`/`anon` execution before granting `authenticated`.

### Performance interaction and accessibility

- Wired the shared comparison switch plus doctor, payment, and activity filters into the secured RPC and export audit metadata.
- Invalid or unauthorized doctor deep links now canonicalize with `history.replaceState`; user-driven open/close still uses normal history entries.
- Partial confidence deterministically takes precedence over staleness, while a reliable old report is labelled stale. Existing results remain visible for updating and refresh-error states.
- Doctor records now have a stacked narrow-screen presentation, and sortable doctor/service table headers expose `aria-sort`.
- Doctor and service drawers fetch their richer payload only after the user opens the corresponding detail. Loading, retryable error, empty, redacted, partial, stale, and success states remain distinct.
- Shared export-menu registration remains intact; no raw table query or `fetch` bypass was introduced.

### Remediation TDD and verification

- Access RED/GREEN: `src/test/auth-insight-performance-cache.test.tsx` and `src/test/insight-route-access.test.tsx` first exposed role-derived allow, eager source mounting, missing resident identity, and missing permission version; both passed after the authoritative boundary was wired.
- Migration RED/GREEN: `src/test/insight-performance-details-migration.test.ts` first failed against an empty additive migration. It now verifies scope, document-price provenance, unique secured filter/detail signatures, approved drill-down dimensions, and function privileges.
- Executable PostgreSQL 17 coverage applies Task 5 plus the new migration to a disposable cluster and rolls back the acceptance fixture. It verifies exact base metrics/redaction plus viewer scope, saved document fee attribution, filtered results, and doctor details.
- Domain/UI RED/GREEN added malformed-detail rejection, no resident first-row fallback, filter wiring, replace canonicalization, charged-document rendering/CSV, detail economics, and responsive/accessibility contracts.
- Exact five-file Task 6 suite: PASS — 5 files / 45 tests.
- Expanded affected suite: PASS — 16 files / 98 tests (includes the disposable PostgreSQL 17 migration test).
- Production build: PASS. Existing Vite native-config, browser `fs`, CommonJS, chunk-size, and ineffective dynamic-import warnings remain.
- Focused ESLint across changed Task 6 production/test files: PASS with zero errors and zero warnings; `AuthContext.tsx --quiet` also reports zero errors (its pre-existing Fast Refresh warning remains outside `--quiet`).
- Repository TypeScript still has unrelated baseline diagnostics; a fresh diagnostic filter reports no changed Task 6 source-file errors.
- `git diff --check`: PASS with only Git's expected LF-to-CRLF notices.

## Round 2 review remediation — 2026-08-17

The second `CHANGES_REQUIRED` review is addressed in the additive
`20260817130000_complete_insight_workspace_security_filters.sql` migration and
its client boundary. Task 5, Task 6 completion, and this migration remain
unapplied; no local/remote database apply, push, deploy, or production action
was performed.

### Atomic identity and workspace authorization

- Authenticated-account transitions now synchronously clear role, effective
  Insight permission, resident doctor identity, and management access before
  publishing the next identity. Every Insight query family used by Command,
  Finance, Planning, and Performance is cancelled and removed, and late async
  access responses are ignored unless they still match the current user.
- Added the no-argument, auth-bound `can_view_insight_workspace()` authority.
  It combines the supported role boundary with the effective Task 2
  `reports.view` permission and uses a fixed `search_path`.
- The role-era `can_view_insights(uuid)` now delegates to that authority and
  rejects cross-account arguments. Clinic health, financial control summary
  and details, and attendance heatmap now have secured Insight wrapper RPCs;
  direct authenticated execution of their legacy names is revoked. Base
  performance, filtered performance, doctor activity, panel receipt summary,
  and the new detail RPC all enforce the same effective boundary.

### Filter and detail correctness

- Doctor, payment, and activity filters are applied server-side to clinic,
  doctor, and service results. Clinic and doctor visit counts, patient counts,
  billing, collection, roster denominators, patients/hour, revenue/hour,
  procedure/document counts, and service trends are recomputed rather than
  inherited from the unfiltered report.
- Added one private-execution procedure classifier used by filtered aggregates,
  service drill-down, doctor procedure economics, and doctor clinical activity.
  It covers linked procedure services/packages, procedure inventory,
  name-matched legacy services, and the historical excision aliases.
- The new uniquely named
  `get_insight_performance_detail_filtered(date,date,text,text,uuid,text,text)`
  receives the active global filters. Matched legacy procedure names resolve to
  their stable service UUID; medicine/non-procedure UUIDs fail closed.
- Service details render their daily trend and preserve charged visit rows.
  Doctor/service item COGS uses bounded `dispensed_qty`; a positive dispensed
  inventory quantity with missing cost returns null COGS/profit/margin instead
  of false zero precision. Zero-cost non-inventory services remain valid.
- Detail parsing now accepts only real ISO calendar dates, `S1`/`S2`/`S3`, and
  `self_pay`/`panel`. Presentation formats both payment values explicitly and
  never maps malformed input to Panel.

### Round 2 TDD and verification

- Identity RED/GREEN first reproduced stale account A sources under account B;
  the final test verifies a synchronous zero-source boundary plus cancel/remove
  calls for all ten Insight query roots.
- Parser/UI RED/GREEN reproduced malformed shift/date/payment acceptance,
  nullable procedure-cost rejection, and missing trend presentation.
- The PostgreSQL 17 rollback fixture applies Task 5, Task 6 completion, and the
  Round 2 migration to a disposable cluster. It verifies denied legacy RPC
  execution, secured wrapper denial for an explicit override, filter/detail
  revenue agreement, stable matched-legacy service detail, medicine UUID
  rejection, bounded missing-cost nulls, and schema/privilege validity.
- Final affected suite: PASS — 20 files / 168 tests.
- Disposable PostgreSQL 17 fixture: PASS, migration compile plus acceptance
  transaction ending in `ROLLBACK`.
- `npm run build`: PASS with the existing Vite configuration, browser `fs`,
  CommonJS, chunk-size, and ineffective dynamic-import warnings.
- `npx tsc --noEmit -p tsconfig.app.json`: PASS.
- Focused ESLint: PASS with zero errors; the existing `AuthContext.tsx` Fast
  Refresh export warning remains.
- `git diff --check`: PASS with only expected LF-to-CRLF notices.
- Supabase CLI local migration history and `db push --dry-run --local` were
  attempted but could not connect because the local Supabase stack was not
  running on `127.0.0.1:54322`. The disposable PostgreSQL fixture provides the
  migration compile/dry-run evidence; no migration was applied.

## Round 3 review remediation — 2026-08-17

Round 3 is addressed by the additive
`20260817140000_harden_insight_refresh_and_filtered_semantics.sql` migration
and the account-refresh/attendance client changes. No migration was applied or
deployed.

### Monotonic live authorization

- Every access refresh now owns a generation. Role, management-access, and
  Insight-scope responses publish only when both their account and generation
  remain current, so an older same-user allow cannot overwrite a newer denial.
- Permission/role events and visible-window refreshes synchronously clear the
  presentation role, fail Insight and management access closed, cancel/remove
  all ten Insight query families, and then refresh. The authoritative Insight
  scope publishes the effective role back into `AuthContext`.
- `permission_version` now incorporates the effective role value, the
  `user_roles` row creation version, the role permission update, and the user
  override update. Denied scopes still publish the authoritative presentation
  role without granting report access.
- Authenticated execution of the historic
  `can_view_insight_workspace(uuid)` overload is revoked, eliminating the
  direct permission-oracle surface while owner-executed legacy report bodies
  remain compatible.

### Attendance permission domains

- `useAttendanceHeatmap` now has an explicit permission domain in its query
  identity. Management uses the original management-authorized RPC; Clinic
  Insight uses the report-authorized RPC.
- The Insight attendance RPC contains the aggregate implementation behind the
  effective `reports.view` guard instead of delegating into the management
  guard. The legacy attendance RPC is re-exposed only for its original
  management-permission contract.
- PostgreSQL fixtures cover a reports-only operations user and a
  management-only admin: each succeeds only in its own attendance domain.

### Filtered metric semantics

- Payment classification is centralized and treats either queue payment
  method, payment type, or payment method as the Panel marker across base,
  filtered, doctor-detail, and service-detail paths.
- Procedure precedence is centralized: package/service/inventory links are
  authoritative; an explicitly linked non-procedure inventory item cannot
  fall through to a same-name procedure service. Only fully unlinked legacy
  items use name matching and the historical excision aliases.
- Filtered clinic and doctor roster hours are read directly from current
  `saved_rosters` JSON, including object/array assignments, legacy shift keys,
  cancellations, and fixed shift durations. Operations retain clinic roster
  totals with no named rows; residents retain their own row plus a zero-safe
  anonymous filtered benchmark.
- Filtered quality and confidence are recomputed from the filtered cohort.
  Document counts and missing attribution use document issue date, retaining
  older-visit and unattributed issued documents. Missing costs use bounded
  dispensed quantities; excluded voided payments use the selected cohort.
- The base report is replaced additively to use the same procedure and payment
  authorities, preventing collisions through the unfiltered entry point too.

### Round 3 TDD and verification

- Client RED/GREEN reproduced same-user out-of-order allow-after-deny, live
  role downgrade, and incorrect attendance RPC selection. Final focused
  client result: 2 files / 16 tests passed.
- Migration RED/GREEN compiled each additive revision in disposable PostgreSQL
  17. The rollback fixture now covers live role/version change, revoked UUID
  oracle execution, both attendance user classes, payment-method-only Panel,
  authoritative operations/resident roster output, issued-date filtered
  quality, legacy procedure identity, and typed-medicine name collision.
- Expanded affected suite: PASS — 18 files / 111 tests.
- Attendance/Command adjacency suite: PASS — 4 files / 22 tests.
- Disposable PostgreSQL 17 migration compile and rollback acceptance: PASS.
- `npm run build`: PASS with the existing Vite/browser-fs/CommonJS/chunk and
  ineffective dynamic-import warnings.
- Focused ESLint: PASS with zero errors. `git diff --check`: PASS with only
  expected LF-to-CRLF notices.
- Repository-wide `tsc` currently reports unrelated baseline diagnostics in
  editor/home/permissions and older test files; no diagnostic names a changed
  Round 3 source file.
- Supabase local history and `db push --dry-run --local` were attempted and
  could not connect because the local stack is not running on
  `127.0.0.1:54322`. No apply/push/deployment occurred; disposable PG17 is the
  migration compile/dry-run evidence.

## Round 4 review remediation — 2026-08-17

Round 4 is addressed by the additive
`20260817150000_enforce_insight_doctor_visibility_and_cohorts.sql` migration.
No migration was applied or deployed.

### Server-side doctor visibility ceiling

- Filtered aggregate, doctor/service detail, and Insight attendance now apply
  the same scope before executing the prior report implementation.
  `special_admin` and `doctor_admin` may request an active doctor; residents
  are bound to their own active doctor; operations, ops staff, and plain admin
  must use the clinic-wide null filter.
- Unauthorized doctor filters fail with `42501` before report rows are read.
  Invalid active-doctor requests from named-doctor roles fail validation.
- Insight attendance keeps the full doctor directory only for named-doctor
  roles, returns only the resident's own directory row for residents, and
  returns an empty directory to operations/plain-admin scopes. The heatmap
  remains aggregate-only for redacted roles.
- The renamed Round 3 implementations are private owner-executed helpers;
  `PUBLIC`, `anon`, and `authenticated` execution is revoked. Only the new
  guarded public entry points retain authenticated execution.

### Cohort and financial reconciliation

- Clinic, named-doctor, resident-own, resident anonymous-benchmark, and doctor
  detail document counts now use document issue date. Older visits therefore
  contribute documents to the issue period and retain their consultation
  doctor attribution without requiring an in-period visit.
- Filtered missing attribution combines distinct selected null-doctor
  consultations with in-range issued null-doctor documents. The two source
  populations retain their authoritative row granularity while duplicate
  consultation joins are removed.
- Base and filtered patient collection exclude an active payment when either
  its `payment_type` or `payment_method` marks Panel. Active physical payments
  with a null method remain legitimate non-Panel collection rather than being
  lost to SQL null comparison.
- Roster hours validate the UUID text before casting, require a mapped doctor,
  exclude cancelled assignments, and deduplicate doctor/date/shift before
  applying the 5/5/4-hour durations. Base and filtered clinic rates use this
  same authority, including under operations redaction.

### Round 4 TDD and verification

- PostgreSQL RED first failed on duplicate/malformed/unmapped roster rows.
  Subsequent fixture cases exercised direct unauthorized aggregate/detail/
  attendance doctor calls, resident attendance isolation, issue-date doctor
  and benchmark documents, distinct consultation/document attribution gaps,
  Panel markers in both payment fields, and a valid null-method collection.
- Migration contract suite: PASS — 5 files / 22 tests.
- Expanded affected client/database suite: PASS — 19 files / 115 tests.
- Disposable PostgreSQL 17 migration compile and rollback acceptance: PASS.
- `npm run build`: PASS with the existing Vite/browser-fs/CommonJS/chunk and
  ineffective dynamic-import warnings. Focused ESLint and `git diff --check`:
  PASS.
- Repository-wide `tsc` continues to report unrelated baseline diagnostics in
  editor/home/permissions and older test files; no changed Round 4 file is in
  the diagnostic set.
- Supabase local history and `db push --dry-run --local` were attempted and
  could not connect because the local stack is not running on
  `127.0.0.1:54322`. No apply, push, or deployment occurred.

## Round 5 final reconciliation — 2026-08-17

Round 5 is addressed by the additive
`20260817160000_complete_insight_document_rows_and_attendance_roster.sql`
migration. No migration was applied or deployed.

### Issued-document doctor rows and cohort exclusions

- The filtered report now materializes active doctors whose only selected
  activity is an in-range issued document attached to an older consultation.
  Named-doctor scopes receive the attributable zero-visit row, residents
  retain their own zero-visit row plus the anonymous benchmark, operations
  retain no doctor rows, and plain admin receives only the clinic benchmark.
- Document-only doctor rows explicitly retain zero completed visits, unique
  patients, visit billing, and procedures. Roster/rate fields continue to use
  the authoritative roster-hours helper and remain null when a rate is not
  meaningful.
- All reconstructed aggregate and doctor-detail issued-document cohorts now
  require the authoritative queue visit to be non-`payment_only`. This applies
  to clinic totals, named doctors, resident/anonymous benchmarks, missing
  attribution, and lazy doctor detail without reintroducing a visit-date
  prerequisite.

### Attendance roster identity authority

- The reviewed attendance calculation now admits a roster assignment only
  when `staffId` is UUID-shaped and maps to an active `doctors.id`. Malformed
  strings and otherwise valid but unmapped UUIDs cannot create operating
  occurrences, coverage, observations, or selectable doctor-directory rows.
- The prior implementation remains a private owner-only helper; its execute
  privilege stays revoked from `PUBLIC`, `anon`, and `authenticated`, while
  the public wrapper continues to enforce the Round 4 doctor-visibility
  ceiling.

### Round 5 TDD and verification

- RED acceptance fixture reproduced both report defects: the payment-only
  document was counted and the document-only doctor row was absent.
- Disposable PostgreSQL 17 migration compile and rollback acceptance: PASS —
  7 tests, including document-only named/resident/redacted rows, payment-only
  aggregate/detail exclusion, and invalid/unmapped S3 roster isolation.
- Round 5 static plus PostgreSQL contract: PASS — 2 files / 10 tests.
- Expanded affected client/database suite: PASS — 23 files / 123 tests.
- `npm run build`: PASS with existing Vite native-config, browser-fs,
  CommonJS, ineffective dynamic-import, and chunk-size warnings.
- Focused ESLint and `git diff --check`: PASS. No apply, push, linked test, or
  deployment was performed.

## Standalone payment-only activity remediation — 2026-08-17

The additive `20260817170000_exclude_payment_only_doctor_activity.sql`
migration aligns the `get_doctor_clinical_activity` detail/CSV rowset with the
aggregate and lazy-detail document cohorts. The public RPC now filters its
authoritative queue entry to `visit_type <> 'payment_only'`; the preceding
implementation is retained as an owner-only helper with execute revoked from
`PUBLIC`, `anon`, and `authenticated`. The replacement preserves the bounded
RPC contract, `SECURITY DEFINER`, fixed `pg_catalog, public` search path, and
authenticated-only public grant.

TDD evidence:

- RED disposable PostgreSQL fixture failed with
  `PAYMENT_ONLY_DOCUMENT_ENTERED_DOCTOR_ACTIVITY: 3` for the Aug 7 cohort.
- GREEN disposable PostgreSQL migration/rollback fixture: PASS — 1 file / 7
  tests; the CSV/detail source returns the two legitimate issued documents and
  excludes payment-only document `...0810`.
- Focused activity/CSV/security suite: PASS — 7 files / 50 tests.
- Expanded Insight and doctor-activity suite: PASS — 30 files / 170 tests.
- `npm run build`, focused ESLint, and staged `git diff --check`: PASS, with
  only the existing build warnings. No migration apply, push, or deployment
  was performed.
