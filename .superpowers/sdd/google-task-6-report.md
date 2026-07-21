# Google Tracking Consent Boundary — Task 6

## Scope

Documented the Google Analytics 4 / Google Ads consent boundary without enabling
tracking, adding identifiers, changing routes, or performing any network,
database, migration, secret, publish, or deployment operation.

## Changes

- `public/_headers`: replaced the documentation-only CSP example's blanket
  `https:`/`wss:` sources with explicit runtime origins, including only the
  Google tag and collection endpoints used by the loader. No wildcard Google
  source, Meta origin, or hard-coded tracking ID is present.
- `src/components/consent/ConsentBanner.tsx`: retained BM/English Google
  Analytics and Google Ads disclosure and consent controls, and clarified that
  withdrawal stops future measurement but does not erase data already sent to
  Google.
- `src/test/google-tracking-csp.test.ts`: static regression tests for explicit
  origins, absence of Meta/wildcard/blanket sources and IDs in host documents,
  bilingual disclosure, consent controls, and accurate withdrawal wording.
- `index.html`: unchanged; no semantically valid meta CSP was added because
  this host policy is documented for the hosting layer and meta CSP cannot
  represent all required directives safely.

## Validation

- Focused RED captured before implementation: `google-tracking-csp.test.ts`
  failed because the previous `_headers` example had no Google origins and
  contained blanket `https:`/`wss:` sources.
- Focused GREEN: `npx vitest run --pool=forks --maxWorkers=1 src/test/google-tracking-csp.test.ts`
  — 3/3 passed.
- TypeScript: `npx tsc --noEmit` — passed.
- Private/policy scan: no Meta origins, `fbq`, wildcard `script-src`/
  `connect-src`, or blanket source remained in the modified policy/consent
  files; `git diff --check` passed.

Tracking remains disabled by default and identifiers remain unset.
