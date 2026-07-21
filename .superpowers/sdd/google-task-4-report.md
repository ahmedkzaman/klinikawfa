# Google tracking Task 4 report

## Status

PASS — the consent-aware, idempotent Google tag loader is implemented locally and remains unmounted. This task does not connect the loader to the application, call Google, access a database, change a secret, or perform a deployment.

## TDD evidence

### RED

`src/test/google-tag.test.ts` was created before either production loader file. The required focused command was run with the workspace's verified x64 Node 24.18.0 runtime and serial forks:

```text
npx vitest run --pool=forks --maxWorkers=1 src/test/google-tag.test.ts
```

The valid RED run exited 1 because `@/features/analytics/googleTag` did not exist; 1/1 suite failed and no tests were collected. This was the intended missing-feature failure.

The default shell initially could not find `npx`. A temporary older x64 runtime produced a Vitest worker-path error, and the bundled ARM64 runtime lacked the repository's x64 Rollup optional package. Those infrastructure attempts are not counted as RED evidence. No package, dependency, or environment file was installed or changed.

### GREEN

The same focused command passes:

- 1/1 test file;
- 13/13 tests;
- 0 failures or unhandled errors.

Coverage includes exact local denied defaults for all four Consent Mode v2 signals; no script/config/event work before grant; disabled, wrong-provider, malformed-ID, missing-label, extra-label, and malformed-label fail-closed cases; one official script; deduplicated configuration and consecutive page views; public-path-only pathname payloads; fixed Ads conversions with only `send_to`; denied withdrawal; permanent session disable; and exactly five exported runtime operations.

## Implementation

- Added `initializeGoogleTag(config)`, `trackGooglePageView(pathname)`, `trackGoogleConversion(event, pathname)`, `updateGoogleConsent(consent)`, and `disableGoogleTracking()` with no generic `gtag` or arbitrary event-payload export.
- Initialization queues `analytics_storage`, `ad_storage`, `ad_user_data`, and `ad_personalization` as `denied` before any configuration or event command. It creates no script until the typed consent adapter receives `granted`.
- Runtime validation requires the existing Google provider/enabled boundary, `G-` plus 10 uppercase letters/digits, `AW-` plus 9–12 digits, and exactly the fixed `contact_click`, `phone_click`, and `whatsapp_click` labels using the approved label character set.
- After grant, the loader queues one GA4 config with automatic page views disabled, one Ads config, and injects at most one asynchronous `https://www.googletagmanager.com/gtag/js?id=...` script with `no-referrer` policy. Script creation is local in tests; jsdom does not fetch or execute Google.
- Page views accept only the existing typed public route policy, emit only canonical `page_path` plus the fixed GA destination, and deduplicate consecutive identical paths. Query strings, fragments, protected/dynamic paths, and arbitrary paths fail closed.
- Ads conversions accept only the three existing generic contact-intent events on approved public paths. The command contains the fixed event argument and an exact `{ send_to: "AW-.../label" }` object; pathname, referrer, query, fragment, form, identity, and healthcare data are absent.
- Disable queues a denied consent update, clears dispatch state, and permanently ignores later initialization, consent, page-view, and conversion calls for the module session.
- Added only the `window.dataLayer` entry declaration needed by the private adapter. No `window.gtag` global is declared or assigned.

## Verification

- Focused Task 4 suite: PASS, 1 file and 13/13 tests.
- Exact CI TypeScript command `tsc --noEmit`: PASS, no diagnostics.
- Scoped ESLint over the loader, global declaration, and focused test: PASS, 0 errors and 0 warnings.
- Scoped network scan: PASS; production contains one explicit `https://www.googletagmanager.com` origin and no `fetch`, XHR, beacon, image, or WebSocket API.
- Scoped privacy/security scan: PASS; no referrer/location/query/form parameter, healthcare/identity field, storage access, Meta/Facebook surface, generic `window.gtag`, TypeScript suppression, or `any` escape exists in production scope.
- Export/scope scan: PASS; exactly the five requested operations are exported, no existing application file imports or mounts the new loader, and no unrelated path is changed.
- Diff whitespace/scope scan: PASS; only the four Task 4 paths listed below are included.

## Files

- `.superpowers/sdd/google-task-4-report.md`
- `src/features/analytics/googleTag-globals.d.ts`
- `src/features/analytics/googleTag.ts`
- `src/test/google-tag.test.ts`

## External-action boundary and concerns

- No real Google request, production identifier, database or Supabase call, secret/environment/dependency change, deployment, publication, Meta behavior, or user-data action occurred.
- The loader is intentionally unmounted. Task 5 owns the controller, consent/configuration wiring, SPA route transitions, contact-link integration, and public-app mounting.
- Script load failure is session-local and fail-closed for later dispatch; the loader never retries in a loop.
- Vitest emits the repository's existing React-SWC performance recommendation; the focused suite exits successfully.

Commit message: `Add consent-aware Google tag loader`.
