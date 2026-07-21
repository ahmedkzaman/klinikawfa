# Google tracking Task 1 report

## Status

PASS — the Google-only tracking configuration boundary is implemented locally and remains disabled by default. The migration is review-only and was not applied.

## TDD evidence

### RED

The two focused test files were created before production code and run with the required serial fork arguments using the workspace's existing x64 Node runtime:

```text
npx vitest run --pool=forks --maxWorkers=1 src/test/google-analytics-settings.test.tsx src/test/google-tracking-migration.test.ts
```

The valid RED run produced:

- 2 failed test files;
- the config/editor suite failed to resolve the absent `src/features/analytics/config.ts` module;
- 6/6 migration tests failed because no `_switch_tracking_to_google.sql` migration existed.

The shell initially exposed no `npx`, and the Codex CUA runtime was ARM64 while this worktree's installed Rollup binary was x64. RED and all later Node checks therefore used the pre-existing workspace x64 Node 24.18.0 runtime without installing or changing dependencies.

### GREEN

The same focused command passed after the minimal implementation:

- 2/2 test files passed;
- 19/19 tests passed;
- 0 failures or unhandled errors.

The tests cover the public-safe column selection, `provider: "google_tag"`, valid and malformed `G-...`/`AW-...` identifiers, fail-closed response parsing, safe update payloads, unknown conversion-key rejection, required fixed labels before enabling, the editor enablement boundary, fixed-field rendering, forward-only columns and constraints, legacy constraint removal, disabled migration state, exact role-helper reuse, RLS policies, audit trigger reuse, and safe read/update grants.

Self-review found that the existing authorization-aware audit trigger would reject the migration-owned provider-row rewrite because a migration runner has no `auth.uid()`. A new migration-order test was added first and failed 1/1 because no trigger suspension/restoration surrounded the update. The migration now drops that trigger inside the transaction immediately before the privileged rewrite and recreates it with the same `private.stamp_website_tracking_settings_actor()` function immediately afterward; the targeted test then passed 1/1.

## Implementation

- Added the `GoogleTrackingConfig` contract and safe Supabase read/update functions. Browser reads select exactly `provider,enabled,measurement_id,ads_conversion_id,ads_conversion_labels,consent_version`.
- Reserved the provider to `google_tag`; identifiers and conversion labels are validated before any update request. Enabled configuration requires a valid GA4 ID, Ads conversion ID, and all three fixed labels.
- Added the protected Analytics & Consent editor. It exposes only `contact_click`, `phone_click`, and `whatsapp_click` label fields, has no arbitrary event-name input, and cannot enable tracking while required identifiers or labels are invalid.
- Replaced the existing analytics placeholder route while retaining `EditorProtectedRoute requireTrackingSettings` and the foundation capability for exactly `admin`, `special_admin`, `doctor_admin`, and `website_editor`.
- Created the migration through the installed Supabase CLI's local `migration new` command. It adds Google columns and constraints, migrates the single row to `google_tag` while forcing `enabled = false`, removes obsolete Meta-dependent checks, and leaves `pixel_id` in place for separately approved cleanup.
- The migration preflights the exact four-role helper body, existing audit trigger/helper, and RLS state; it reuses `private.can_manage_tracking_settings()` in both update-policy predicates and retains database-owned actor/timestamp stamping.
- The existing audit trigger is removed only around the transaction-owned provider rewrite and restored before constraints, grants, policies, and postflight checks complete, preventing the migration runner from being mistaken for a browser actor without weakening the committed authorization boundary.
- The migration revokes former browser privileges before granting reads on only the six public-safe columns and authenticated updates on only the five editable Google fields. Provider, legacy pixel, and audit columns receive no direct browser update grant.

## Verification

- Focused Google suites: PASS, 2 files and 19/19 tests.
- Exact CI TypeScript command `tsc --noEmit`: PASS, no diagnostics.
- Scoped ESLint over `src/App.tsx`, config, editor, and both focused tests: PASS, 0 errors and 0 warnings.
- Scoped security scans: PASS, no private credential files, service-role/connection/JWT/private-key patterns, external network primitives, Meta behavior, hard-coded Google IDs, TypeScript suppressions, arbitrary healthcare event keys, or browser tracking origins in production scope.
- Staged diff whitespace and scope scans: PASS; exactly the seven Task 1 paths listed below are staged.
- Existing editor route-guard coverage continues to prove the exact four allowed roles and redirects all other roles.

## Files

- `.superpowers/sdd/google-task-1-report.md`
- `src/App.tsx`
- `src/features/analytics/config.ts`
- `src/pages/editor/AnalyticsSettings.tsx`
- `src/test/google-analytics-settings.test.tsx`
- `src/test/google-tracking-migration.test.ts`
- `supabase/migrations/20260721100403_switch_tracking_to_google.sql`

## External-action boundary and concerns

- No database, migration apply, Supabase API, tracking endpoint, secret, environment, deployment, publication, or other network action occurred. The Supabase CLI was used only for local migration-file generation.
- The migration has static contract and manual review evidence only because database execution was expressly prohibited. It must receive a separately authorized guarded database review before application.
- Supabase changelog/documentation lookup was not performed because the task prohibited network access; the existing foundation contract and installed local CLI were used.
- Vitest emits the repository's existing Vite React-SWC recommendation; the focused suite still exits successfully.

Commit message: `Add Google tracking configuration boundary`.
