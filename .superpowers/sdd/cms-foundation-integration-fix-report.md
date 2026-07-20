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

## Follow-up: privileged Storage lifecycle actor

### Status

PASS - the remaining staging-only Storage lifecycle defect is fixed in a separate local commit. The Website Editor denial probes no longer depend on Website Editor, staff, or administrator Storage visibility to prove or restore exact object state.

Implementation commit: `6a79f5563f90d08e9748a1025a6e287b4b644d41` (`Harden staging Storage lifecycle cleanup`)

### TDD evidence

The permanent source contract was extended first. The RED run collected 12 tests: 10 passed and 2 failed for exactly the missing behavior:

- the runner did not require `STAGING_SERVICE_ROLE_KEY`;
- the fixture had no exact-target privileged client, lifecycle helpers, or privileged post-delete evidence.

After implementation, the same focused serial suite passed 12/12 tests.

### Implementation

- Reused the existing blank `STAGING_SERVICE_ROLE_KEY=` staging example variable; no value was added anywhere.
- Added the variable name to the guarded runner's required-variable list. The production/endpoint guard is still sourced first, and the runner reports only an empty variable's name, never its value.
- Creates the service-role Supabase client only inside the dormant fixture's `beforeAll`; there is no module-level service key and no frontend use.
- Restricts privileged helpers by TypeScript union to exactly four reserved test targets: the Website Editor website-media object, private panel-claim document object, seeded staff daily-report object, and denied Website Editor daily-report object.
- Uses that client only for exact preflight reset/absence, before-and-after snapshots, unexpected restoration, post-cleanup verification, allowed website-media post-delete verification, and `afterAll` cleanup.
- All cleanup, restoration, and verification errors throw. Consequently the fixture fails and the runner returns nonzero rather than silently leaving an unexpected object behind.
- Preserves the original 15-case matrix order and booleans, all supplemental cases, actor/identity checks, immutable production guard, and prior policy fixes.

### Verification

- Focused hardening contracts: 12/12 passed.
- Stress fixture TypeScript: `tsc --noEmit -p stress-tests/tsconfig.json` passed.
- Changed runner syntax: `bash -n stress-tests/scripts/run-rls-matrix.sh` passed.
- Full serial Vitest: 18/18 files and 124/124 tests passed with the serial fork pool.
- Changed-file credential scan: zero JWT, connection-string, secret-token, or populated service-role credential hits.
- Diff whitespace check: passed.
- Staged review before the implementation commit contained exactly the source contract, dormant fixture, and guarded runner.

The first GREEN invocation attempt exposed two local runtime issues before test collection: the default Bun executable was incompatible with the machine CPU, and baseline Bun is incompatible with Vitest workers on Windows. Verification then used the existing portable Node runtime already present in the workspace; no package was installed or downloaded.

### External-action confirmation

Zero staging or external actions were taken. The guard, runner, fixture, seed, cleanup, Storage API, database, Supabase network, migrations, accounts, deployment, and publication were not executed. All checks were local source, type, syntax, test, scan, and diff checks only.

## Final follow-up: closed privileged Storage target API

### Status

PASS - the privileged Storage helper boundary is now closed over four literal target keys. No helper accepts or exports a structural bucket/path target.

Implementation commit: `4c450c297d7a95f65beb518165cf3b6044287452` (`Close privileged Storage target API`)

### Root cause and TDD evidence

The former tuple-derived object union was structurally typed. Because the reserved paths are computed strings, an object with a recognized bucket and an arbitrary string path could be type-compatible with the helper parameter.

The permanent static contract was changed first. Its RED run collected 12 tests: 11 passed and the single Storage lifecycle contract failed at the old array/object API. After the fixture change, the same focused serial suite passed 12/12.

### Implementation

- Replaced object parameters with `PrivilegedStorageTargetKey`, the `keyof` union of one private mapping.
- The only accepted keys are `websiteMedia`, `privatePanelClaim`, `seededDailyReport`, and `deniedDailyReport`.
- Every privileged helper resolves bucket/path internally; call sites pass literal keys only.
- Added non-executed `@ts-expect-error` calls for an arbitrary key and an arbitrary structural bucket/path object. A clean stress TypeScript run proves both negative assertions are active and consumed.
- Runtime target resolutions, preflight reset, denial snapshots/restoration, post-delete verification, afterAll cleanup, endpoint guards, credential handling, and the original matrix behavior are unchanged.

### Verification

- Focused hardening contracts: 12/12 passed.
- Stress fixture TypeScript: `tsc --noEmit -p stress-tests/tsconfig.json` passed, including both negative compile-time contracts.
- Full serial Vitest: 18/18 files and 124/124 tests passed.
- Changed-file credential scan: zero JWT, connection-string, secret-token, or populated service-role credential hits.
- Diff and staged whitespace checks: passed.
- Implementation staged review contained exactly the fixture and its permanent source contract.

The suite emitted only the existing Vite plugin guidance and React Router future-flag warnings. No new warning or failure was introduced.

### External-action confirmation and concerns

Zero external actions were taken. The guard, runner, fixture, Storage API, database, Supabase network, migrations, accounts, deployment, and publication were not executed. Runtime staging behavior remains intentionally unexecuted until a separately authorized guarded run.
