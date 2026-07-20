# CMS Foundation Integration Hardening Report

## Status

PASS — the whole-foundation authorization and evidence defects in the brief are addressed in the committed local tree. No migration or staging harness was executed.

Starting base: `bef14039fd7ca39598f38f80bebe10c8f6f6e50c`

Implementation commit: `d647d58efa620faa51a1852373165932d8627098` (`Harden CMS foundation integration`)

## TDD evidence

### RED

The static contract was added first at `src/test/cms-foundation-integration-hardening.test.ts` and then run with:

```text
vitest run --pool=forks --maxWorkers=1 src/test/cms-foundation-integration-hardening.test.ts
```

The first sandboxed attempt stopped before collecting tests because the loader could not traverse to the local Vitest config. The identical local-only command was rerun with filesystem approval and produced the valid RED result:

- 1 test file failed.
- 10 contracts collected: 9 failed, 1 passed.
- Expected failures: no hardening migration; no `blog` reservation; clinic-review fixture still `pending`; no Website Editor workforce-denial cases; no privileged before/after mutation invariant; no deterministic attendance/daily-report fixtures.
- The one passing contract proved the required original 15-case matrix order and booleans were already preserved before implementation.

### GREEN

Focused migration-only GREEN after the CLI-generated migration and SQL changes:

- 6/6 migration contracts passed; 4 dormant-matrix contracts intentionally skipped by the test filter.

Focused final GREEN after matrix hardening:

- 10/10 contracts passed.

The first stress TypeScript check then correctly failed with nine `TS2739` errors because Supabase mutation builders are awaitable `PromiseLike` values, not native `Promise` instances. The invariant helper type was minimally corrected from `Promise` to `PromiseLike`; the same TypeScript check then passed. A fresh final focused run and TypeScript run both passed after the final actor-argument refactor.

## Preserved self-service role set and repository evidence

Exact preserved set:

```text
admin, special_admin, doctor_admin, ops_staff, operations, staff, locum, resident_doctor
```

Repository evidence is `supabase/migrations/20260531081742_d5d6713b-c27f-495f-bea8-47765a5e31cd.sql`:

- `public.is_staff_or_admin(uuid)` explicitly recognizes `admin`, `special_admin`, `doctor_admin`, `ops_staff`, `operations`, and `staff`.
- Its adjacent comment states that `operations` and `staff` are deliberate legacy aliases retained for unmigrated rows/stale sessions.
- `public.is_clinical(uuid)` explicitly recognizes `locum` and `resident_doctor`.
- `public.is_staff_or_clinical(uuid)` is the union of those two helpers.

The new private helper reproduces this exact eight-role union from `public.user_roles` and `auth.uid()`. It does not use metadata and does not include `website_editor` or `guest`.

## Migration

Created by the installed Supabase CLI v2.109.1 after checking `--version`, `migration --help`, and `migration new --help`:

`supabase/migrations/20260720225347_harden_website_cms_integration.sql`

The migration:

- runs preflight and postflight catalog checks inside an explicit transaction;
- drops `Public can read clinic_reviews active` and revokes `anon` SELECT on `public.clinic_reviews`, while retaining public review submission and the existing operations/admin full-read policy;
- creates `private.is_workforce_self_service_user()` with `SECURITY DEFINER`, fixed `search_path = pg_catalog`, exact eight-role lookup through `public.user_roles`/`auth.uid()`, revoked `PUBLIC`, and `EXECUTE` granted only to `authenticated`;
- replaces two attendance self-service policies, three daily-report self-service policies, and four private daily-report Storage policies with workforce-and-owner checks;
- adds `WITH CHECK` to both update replacements so rows/objects cannot be reassigned outside the caller-owned boundary;
- creates `private.stamp_website_tracking_settings_actor()` using only `private.can_manage_tracking_settings()`, stamps `updated_by = auth.uid()` and `updated_at = now()`, fixes the search path, revokes `PUBLIC`, and grants no browser-role execution;
- creates the `BEFORE UPDATE` tracking-settings actor trigger;
- leaves Website Editor access limited to website content/media and tracking configuration.

The not-yet-applied foundation migration now reserves `blog` in the content-page slug constraint.

## Dormant staging matrix changes

- The required 15-case `cases` array remains byte-for-byte ordered with the same expected booleans.
- The clinic review fixture is now `active`, so the Website Editor denial proves that removal of the former public active-review policy is effective.
- Twelve explicit supplemental Website Editor denials cover SELECT/INSERT/UPDATE/DELETE across attendance records, staff daily reports, and the private `daily-reports` Storage bucket.
- Deterministic attendance and daily-report rows were added to seed and cleanup SQL; unexpected insert IDs are also cleanup-owned.
- A legitimate `staff` actor seeds and cleans the deterministic daily-report Storage object at runtime.
- `attemptAndVerifyDeniedMutation` takes a privileged exact before snapshot, performs the untrusted mutation, takes a privileged after snapshot, restores any unexpected change, verifies restoration, and returns `true` so the expected-denial case still fails visibly if a mutation occurred.
- The invariant now protects the existing staff draft, patient update, and staff tracking-update denials, plus every new denied write. It does not rely on the mutating caller's filtered `.select()` result.
- Endpoint, credential, identity, runner, seed, cleanup, and immutable production-ref guards remain intact; example environment values remain blank.

## Verification

- Focused hardening contracts: 10/10 passed.
- Stress TypeScript: `tsc --noEmit -p stress-tests/tsconfig.json` passed.
- Full serial Vitest: 18/18 files and 122/122 tests passed with `vitest run --pool=forks --maxWorkers=1` (baseline supplied in the brief was 112/112).
- Changed-shell syntax: not applicable; no shell file changed.
- Production build: not applicable; no frontend source changed.
- Credential/private-file scan: no changed private credential files, JWTs, connection strings, browser/service secrets, or populated credentials. The only broad scan hit was the existing blank `STAGING_ANON_KEY` variable name/type wiring.
- `git diff --cached --check`: passed with no whitespace errors.
- Staged-file review: exactly six implementation files, no unrelated changes.

The suite still emits pre-existing Vite React-plugin guidance and React Router future-flag warnings; there were no test failures.

## Self-review

- Confirmed `website_editor` is absent from the workforce helper and every staff self-service policy.
- Confirmed the tracking trigger calls the exact tracking helper, not the broader website helper, and browser roles receive no direct execute grant.
- Confirmed public testimonial reads can only use `website_review_presentations`; `clinic_reviews` retains only non-read public submission plus operations/admin full reads.
- Confirmed all update policies have both `USING` and `WITH CHECK`.
- Confirmed all denied writes use privileged before/after evidence or an operation result that directly proves the write (for existing Storage upload cases), and unexpected mutations are restored/cleaned.
- Confirmed the original 15-case order/booleans and production guards are unchanged.
- Confirmed no frontend build or generated Supabase type update is required for these SQL/static-harness changes.

No unresolved code defect was found in self-review.

## External-action confirmation

Zero external actions were taken. Specifically, no migration, guard, runner, seed, cleanup, fixture, psql command, database connection/query, Supabase HTTP/Storage request, account/role action, secret change, deployment, publication, or network action was executed. Supabase CLI use was limited to local version/help and local migration-file generation. The staging harness was not executed.

## Concerns

- Deno is unavailable, as stated in the brief; no Deno check was attempted.
- Binding safety constraints prohibited applying/parsing the migration against a live or local database and prohibited running the staging harness. SQL/runtime behavior therefore has static-contract, TypeScript, and review evidence only until a separately authorized guarded staging run.
- Supabase documentation/changelog lookup was not performed because the task expressly prohibited network operations; the installed CLI's local help was used instead.
