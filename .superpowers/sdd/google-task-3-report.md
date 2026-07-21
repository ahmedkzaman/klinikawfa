# Google tracking Task 3 report

## Status

PASS — a pure, healthcare-safe Google route and conversion policy is implemented locally. This task adds no Google loader, browser-global access, network behavior, tracking identifier, database behavior, or deployment action.

## TDD evidence

### RED

`src/test/google-route-policy.test.ts` was created before either production module. The valid RED run used the workspace's existing x64 Node 24.18.0 runtime and serial forks:

```text
npx vitest run --pool=forks --maxWorkers=1 src/test/google-route-policy.test.ts
```

The suite failed because `@/features/analytics/googleEvents` did not exist; 1/1 suite failed and no tests were collected. This was the intended missing-feature failure. An initial shell attempt could not find `npx`, and a second attempt selected the PowerShell shim blocked by the local execution policy; neither infrastructure failure is counted as RED evidence. No dependency or environment file was installed or changed.

### GREEN

The same focused command passes:

- 1/1 test file;
- 10/10 tests;
- 0 failures or unhandled errors.

Coverage includes the exact seven-path allowlist; pathname-case and trailing-slash normalization; detail, dynamic, protected, appointment, auth, staff, clinic, editor, payment, callback, and unknown-route denial; non-empty query/fragment denial; exact generic contact-intent events; healthcare, operational, identifier-bearing, non-string, and arbitrary-event denial; and exact sanitized output shapes that do not read or copy referrer, form, identity, query, or fragment data.

## Implementation

- Added the fixed readonly `contact_click`, `phone_click`, and `whatsapp_click` event-name tuple, its narrow union type, and a runtime type guard. There is no generic event-registration or payload API.
- Added the canonical public pathname allowlist: `/`, `/services`, `/doctors`, `/gallery`, `/health-tips`, `/privacy`, and `/terms`.
- `isGooglePageViewAllowed(location)` and `isGoogleConversionAllowed(event, location)` fail closed unless both `search` and `hash` are exactly empty and the pathname becomes one of the seven approved values after lowercasing and trailing-slash removal only.
- Sanitizers return frozen `{ pathname }` or `{ event, pathname }` objects with fixed typed values. Input query, hash, referrer, form data, identifiers, and arbitrary properties are neither read for output nor copied.

## Verification

- Focused Task 3 suite: PASS, 1 file and 10/10 tests.
- Exact CI TypeScript command `npx tsc --noEmit`: PASS, no diagnostics.
- Scoped ESLint over the two production modules and focused test: PASS, 0 errors and 0 warnings.
- Scoped runtime/network scan: PASS; no loader, network, browser-global, storage, database, Google origin, or hard-coded Google identifier behavior appears in production scope.
- Scoped privacy/security scan: PASS; no referrer, form data, healthcare fields, identity fields, credentials, secrets, arbitrary payload/record parameter surface, `any`, or TypeScript suppression appears in production scope.
- Diff whitespace/scope scan: PASS; only the four Task 3 paths listed below are included.

## Files

- `.superpowers/sdd/google-task-3-report.md`
- `src/features/analytics/googleEvents.ts`
- `src/features/analytics/googleRoutePolicy.ts`
- `src/test/google-route-policy.test.ts`

## External-action boundary and concerns

- No production database, Supabase API, migration, Google request, script injection, tracking identifier, secret, environment, dependency, deployment, publication, or user-data action occurred.
- The approved plan includes `/privacy` and `/terms` in the seven-path tracking allowlist, although the current app router does not yet declare those page components. This task intentionally implements the plan's policy only and does not add routes; later controller integration must preserve the approved route contract.
- Vitest emits the repository's existing React-SWC performance recommendation; the focused suite exits successfully.

Commit message: `Add healthcare-safe Google route policy`.
