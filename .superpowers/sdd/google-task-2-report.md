# Google tracking Task 2 report

## Status

PASS — versioned first-party Google marketing consent is implemented locally. Consent is not sent to Supabase, and this task does not load or initialize analytics.

## TDD evidence

### RED

`src/test/google-consent-store.test.ts` was created before production code. The required focused command was run with the workspace's pre-existing x64 Node 24.18.0 runtime and serial forks:

```text
npx vitest run --pool=forks --maxWorkers=1 src/test/google-consent-store.test.ts
```

The valid RED run failed with one failed suite and no collected tests because `@/components/consent/ConsentBanner` did not exist. An earlier shell attempt could not find `npx`; it was not counted as feature RED evidence. No dependency was installed or changed.

During self-review, a withdrawal edge case was converted into a second RED cycle. The focused test `stays withdrawn for the session when removal fails` failed because an accepted record could be read again after `localStorage.removeItem` threw. A session-local withdrawal tombstone was then added, and the targeted test passed before the full focused suite was rerun.

### GREEN

The required focused command passes:

- 1/1 test file;
- 10/10 tests;
- 0 failures or unhandled errors.

Coverage includes missing, malformed, identity-bearing, and stale records; accept and reject; exact persisted fields; version bumps; normal withdrawal; unavailable read/write/remove storage; same-session withdrawal when removal fails; BM/English button-level accept/reject/settings actions; synchronous storage-before-notification ordering; and the fail-closed banner message after a failed write.

## Implementation

- Added a discriminated `MarketingConsent` state with typed accepted/rejected choices.
- Added `readMarketingConsent(version)`, `writeMarketingConsent(choice)`, and `withdrawMarketingConsent()` using the existing Klinik Awfa first-party key, `klinikawfa.consent`.
- Reads accept only an exact `{ version, marketing, updatedAt }` record with a positive integer version, allowed choice, valid ISO timestamp, and the currently required version. Missing, malformed, extra-field, stale, SSR, and storage-error cases return `unknown`.
- Writes synchronously persist only `{ version, marketing, updatedAt }`. A failed write returns `unknown`, so attempted acceptance cannot enable marketing when storage is unavailable.
- Withdrawal removes the first-party record and immediately returns `unknown`. A same-session tombstone preserves withdrawal if browser removal throws; a later explicit successful choice clears that tombstone.
- Added a bilingual BM/English banner and settings dialog using the existing button/dialog components. Accept, reject, and settings are all explicit buttons; Google Analytics/Ads remain descriptive copy only.
- The optional `onConsentChange` notification runs only after the synchronous storage attempt, allowing later integration code to update consent before navigation without this task initializing Google.

## Verification

- Focused Task 2 suite: PASS, 1 file and 10/10 tests.
- Exact CI TypeScript command `tsc --noEmit`: PASS, no diagnostics.
- Scoped ESLint over the four Task 2 source/test files: PASS, 0 errors and 0 warnings.
- Scoped privacy/security scans: no Supabase/client/network/tracking-loader calls, Google origins or identifiers, Meta behavior, secrets, credentials, cookies, route data, healthcare fields, or TypeScript suppressions in production scope. The test-only email value proves identity-bearing consent records are rejected.
- Diff whitespace/scope scan: PASS; only the five Task 2 paths listed below are included.

## Files

- `.superpowers/sdd/google-task-2-report.md`
- `src/components/consent/ConsentBanner.tsx`
- `src/features/consent/consentStore.ts`
- `src/features/consent/types.ts`
- `src/test/google-consent-store.test.ts`

## External-action boundary and concerns

- No production database, Supabase API, migration, network, analytics, secret, environment, dependency, deployment, publication, or user-data action occurred.
- This task deliberately does not mount the banner or initialize Google. Later plan tasks own route policy, the Google loader, controller integration, and public-app mounting.
- If browser storage removal fails, withdrawal is fail-closed for the current page session. No client-side code can guarantee mutation of an unavailable storage subsystem across a full browser reload.
- Vitest emits the repository's existing React-SWC performance recommendation; the focused suite exits successfully.

Commit message: `Add versioned Google marketing consent`.

## Review-fix addendum

### Findings and root cause

- **P1 failed rejection:** `writeMarketingConsent()` previously raised the session tombstone only through withdrawal. If an accepted record already existed and persisting a later explicit rejection threw, restoring storage allowed `readMarketingConsent()` to return the old acceptance. The rejection path now marks the session fail-closed before `setItem`; the tombstone is cleared only after that explicit choice persists successfully.
- **P2 shared test state:** the focused test statically imported the store singleton, so `withdrawnForSession` could leak between cases and let the unavailable-read test return early without touching mocked storage. Every test now resets the module registry and dynamically imports a fresh store and banner instance. The unavailable-read test also asserts that `localStorage.getItem` was called once.

### TDD evidence

The new regression preloads a valid accepted record, forces an explicit rejected write to fail, restores storage, and requires reads to remain `unknown` until a later explicit rejection persists.

- RED: the focused suite collected 11 tests; 10 passed and only the new regression failed because the old accepted record was returned.
- GREEN: the same required focused command passed 1/1 file and 11/11 tests after the one-line production fix.

```text
npx vitest run --pool=forks --maxWorkers=1 src/test/google-consent-store.test.ts
```

### Review-fix verification and scope

- Exact CI TypeScript command `tsc --noEmit`: PASS, no diagnostics.
- Scoped ESLint over the modified store and focused test: PASS, 0 errors and 0 warnings.
- Scoped privacy/security and diff whitespace scans: PASS; no analytics, network, database, secret, deployment, identifier, Meta, or healthcare-data behavior was added.
- The review fix changes only this report, `src/features/consent/consentStore.ts`, and `src/test/google-consent-store.test.ts`.
- No dependency, production database, Supabase API, network, analytics, secret, deployment, publication, or user-data action occurred.

Review-fix commit message: `Harden rejected consent storage fallback`.
