# Google tracking Task 7 — browser/network validation

Date: 2026-07-21
Scope: local test IDs and local Vite fixture only. No production identifier, network destination, database, migration, secret, deploy, or publish action was used.

## Browser proof

The local Playwright run used the installed system Chrome executable and a local Vite server. The first run correctly failed closed because the fixture had no Supabase build variables; the rerun used non-production placeholder Supabase values only for the local app bootstrap.

Command (from `stress-tests`):

```text
PLAYWRIGHT_CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
VITE_SUPABASE_URL=https://example.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=test-key
VITE_SUPABASE_PROJECT_ID=example
node node_modules/@playwright/test/cli.js test --config=phase-c/google-tracking.local.config.ts
```

Result: **2 passed**.

- `/` made no request to `googletagmanager.com` or `google-analytics.com` before consent.
- `/appointment?fixture=1` made no Google request; protected/query routes remain excluded.
- No forms were submitted and no external Google request was allowed by the test.

## In-process end-to-end gate

`src/test/google-tracking-end-to-end.test.tsx` verifies with the production loader:

- denied defaults include all Consent Mode v2 keys;
- rejection/no consent produces no script, page view, or conversion;
- acceptance injects exactly one official Google tag and one sanitized public page view;
- duplicate/query/appointment routes are rejected;
- conversion output is limited to `send_to` and the fixed generic event;
- withdrawal sends denied consent and blocks future calls.

Result: **3 passed** (8 Google test files: **62 passed**).

## Full validation

- TypeScript `tsc --noEmit`: passed.
- Production build: passed.
- Development build: passed (expected missing-env warning and existing bundle warnings only).
- Scoped ESLint on all Task 7 files: passed.
- `git diff --check`: passed.
- Static scan found only test IDs (`G-ABC123DEF4`, `AW-123456789`) and no credentials or private environment values.

No production operation was performed. The Task 7 evidence is local-only; production analytics remains disabled until an administrator publishes a reviewed configuration and deployment separately.
