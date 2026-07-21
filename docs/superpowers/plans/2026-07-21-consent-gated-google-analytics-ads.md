# Consent-Gated Google Analytics and Google Ads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the planned Meta Pixel integration with a disabled-by-default, consent-gated Google Analytics 4 and Google Ads conversion integration.

**Architecture:** A public-safe Google tracking configuration is stored in the existing website tracking row and exposed only through the existing CMS permission boundary. A first-party consent store controls Google Consent Mode v2 defaults and updates. A single idempotent Google tag loader sends only allowlisted public page views and generic contact-intent conversions; previews, protected routes, query-string URLs, and healthcare actions fail closed.

**Tech Stack:** React 18, TypeScript, React Router, Supabase Postgres/RLS, Zod, Vitest, Testing Library, DOM/browser network checks.

## Global Constraints

- Google tracking is disabled by default and no Google script or network request occurs before explicit consent.
- Consent Mode v2 uses `analytics_storage`, `ad_storage`, `ad_user_data`, and `ad_personalization` with denied defaults.
- Only `admin`, `special_admin`, `doctor_admin`, and `website_editor` may update the tracking configuration.
- Browser clients receive only public Google identifiers and tracking flags; no secret or service-role value is used.
- Page views are limited to `/`, `/services`, `/doctors`, `/gallery`, `/health-tips`, `/privacy`, and `/terms` with an empty query string and no fragment data.
- Conversion events are limited to generic `contact_click`, `phone_click`, and `whatsapp_click`; no appointment, patient, symptom, service-selection, payment, authentication, clinic, staff, or editor event is sent.
- Preview renders never initialize analytics, send events, navigate, submit, or perform external media work.
- Rich CMS wording, routes, and public layout remain unchanged.
- No production migration, tracking identifier entry, analytics enablement, deployment, or live publication occurs in this plan.

---

### Task 1: Evolve tracking configuration for Google identifiers

**Files:**
- Create: `supabase/migrations/*_switch_tracking_to_google.sql`
- Modify: `src/features/analytics/config.ts` (or the existing tracking config module)
- Modify: `src/pages/editor/AnalyticsSettings.tsx`
- Create/modify: `src/test/google-analytics-settings.test.tsx`
- Create/modify: `src/test/google-tracking-migration.test.ts`

**Interfaces:**
- Produce `GoogleTrackingConfig = { provider: "google_tag"; enabled: boolean; measurementId: string | null; adsConversionId: string | null; adsConversionLabels: Record<string,string>; consentVersion: number }`.
- Keep the existing four-role tracking-settings capability and existing route guard.
- The public read selects only `provider,enabled,measurement_id,ads_conversion_id,ads_conversion_labels,consent_version`.

- [ ] **Step 1: Write failing config and migration tests**

Test valid `G-...` and `AW-...` identifiers, reject malformed identifiers/unknown event keys, require labels only for the fixed three conversion keys, reserve `provider = 'google_tag'`, and assert the migration removes the old Meta provider constraint without exposing audit columns.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npx vitest run --pool=forks --maxWorkers=1 src/test/google-analytics-settings.test.tsx src/test/google-tracking-migration.test.ts`

Expected: failures because the Google configuration contract and migration do not yet exist.

- [ ] **Step 3: Implement the review-only schema/API/editor change**

Add forward-only columns and constraints for the Google measurement ID, Ads conversion ID, and the fixed contact-intent label map. Update the existing row to `google_tag`, keep tracking disabled, revoke broad direct writes, and reuse `private.can_manage_tracking_settings()` for RLS/trigger authorization. Do not remove the legacy column until a separately approved production cleanup. The editor must never offer arbitrary event names or healthcare conversion fields.

- [ ] **Step 4: Verify GREEN and commit**

Run the focused tests, exact CI `tsc --noEmit`, and scoped lint/security checks. Commit: `Add Google tracking configuration boundary`.

---

### Task 2: Implement versioned consent state for Google

**Files:**
- Create/modify: `src/features/consent/consentStore.ts`
- Create/modify: `src/features/consent/types.ts`
- Create/modify: `src/components/consent/ConsentBanner.tsx`
- Create/modify: `src/test/google-consent-store.test.ts`

**Interfaces:**
- Produce `readMarketingConsent(version)`, `writeMarketingConsent(choice)`, `withdrawMarketingConsent()`, and a typed `MarketingConsent` state.
- Preserve necessary-only behavior when storage is unavailable.

- [ ] **Step 1: Write failing consent tests**

Cover missing/malformed/stale consent, accept, reject, version bump, withdrawal, storage failure, and BM/English labels with equally clear accept/reject/settings actions.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npx vitest run --pool=forks --maxWorkers=1 src/test/google-consent-store.test.ts`

- [ ] **Step 3: Implement the minimal consent store/banner**

Persist only `{ version, marketing, updatedAt }` under the existing Klinik Awfa consent key. Do not store identity, form values, route data, or Supabase records. Keep consent updates synchronous with the banner interaction so the Google tag receives the update before navigation.

- [ ] **Step 4: Verify GREEN and commit**

Run focused consent tests, TypeScript, and lint. Commit: `Add versioned Google marketing consent`.

---

### Task 3: Add strict Google route and event policy

**Files:**
- Create: `src/features/analytics/googleRoutePolicy.ts`
- Create: `src/features/analytics/googleEvents.ts`
- Create: `src/test/google-route-policy.test.ts`

**Interfaces:**
- Produce `isGooglePageViewAllowed(location)`, `isGoogleConversionAllowed(event, location)`, and fixed typed event names `contact_click`, `phone_click`, `whatsapp_click`.

- [ ] **Step 1: Write failing policy tests**

Allow only the seven exact public paths with empty search/hash; reject detail pages, `/pages/:slug`, appointment/auth/staff/clinic/editor/payment/callback routes, unknown routes, query strings, fragments, and every healthcare or arbitrary event.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npx vitest run --pool=forks --maxWorkers=1 src/test/google-route-policy.test.ts`

- [ ] **Step 3: Implement the pure route/event allowlist**

Normalize only pathname casing and trailing slashes; never forward the original URL, query, hash, referrer, form data, or identifiers as event parameters. Return a boolean or a fixed sanitized pathname/event object.

- [ ] **Step 4: Verify GREEN and commit**

Run focused policy tests, TypeScript, and security scans. Commit: `Add healthcare-safe Google route policy`.

---

### Task 4: Build the idempotent Google tag and Ads conversion loader

**Files:**
- Create: `src/features/analytics/googleTag.ts`
- Create: `src/features/analytics/googleTag-globals.d.ts`
- Create: `src/test/google-tag.test.ts`

**Interfaces:**
- Produce `initializeGoogleTag(config)`, `trackGooglePageView(pathname)`, `trackGoogleConversion(event, pathname)`, `updateGoogleConsent(consent)`, and `disableGoogleTracking()`.

- [ ] **Step 1: Write failing loader tests**

Assert denied defaults are queued locally, no script/network work occurs before acceptance, invalid IDs fail closed, one script is injected at most once, config/page views are deduplicated, Ads conversion dispatch contains only `send_to` and the fixed event name, and disable prevents future calls.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npx vitest run --pool=forks --maxWorkers=1 src/test/google-tag.test.ts`

- [ ] **Step 3: Implement the narrow Google loader**

Use the official Google tag URL with the GA4 measurement ID, set Consent Mode v2 defaults before any config/event calls, and update consent state only through the typed adapter. Use explicit Google origins for script/CSP review. Never expose a generic `gtag` or arbitrary event-payload API to application components.

- [ ] **Step 4: Verify GREEN and commit**

Run focused tests, TypeScript, and static network/security scans. Commit: `Add consent-aware Google tag loader`.

---

### Task 5: Connect configuration, consent, routing, and SPA navigation

**Files:**
- Create/modify: `src/features/analytics/GoogleAnalyticsController.tsx`
- Create/modify: `src/App.tsx`
- Modify: public contact/phone/WhatsApp link components only where needed
- Create: `src/test/google-analytics-controller.test.tsx`

**Interfaces:**
- Controller consumes the public config, consent state, route policy, and Google loader; it exposes no tracking API to previews or protected application areas.

- [ ] **Step 1: Write failing integration tests**

Cover missing/disabled config, unknown/rejected/stale consent, allowed and denied route transitions, query-string denial, one page view per route, consent withdrawal, and safe contact-intent conversions. Assert previews and editor routes never initialize the loader.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npx vitest run --pool=forks --maxWorkers=1 src/test/google-analytics-controller.test.tsx`

- [ ] **Step 3: Implement the controller**

Mount it once at the public app boundary, deduplicate SPA page views by sanitized pathname, update consent before route tracking, and treat configuration/network failures as analytics-disabled without interrupting navigation, appointments, contact links, or rendering.

- [ ] **Step 4: Verify GREEN and commit**

Run focused integration tests, Home/general-page preview tests, TypeScript, and lint. Commit: `Connect consent-gated Google measurement`.

---

### Task 6: Update CSP and privacy disclosure without enabling tracking

**Files:**
- Modify: `public/_headers` (documentation/host configuration only)
- Modify: `index.html` only if a meta policy is semantically valid
- Modify: existing privacy/consent copy component
- Create: `src/test/google-tracking-csp.test.ts`

**Interfaces:**
- Keep tracking disabled and identifiers unset in source and test fixtures.
- CSP origins are explicit Google origins only; no blanket `https:` or wildcard source.

- [ ] **Step 1: Write failing static CSP/privacy tests**

Reject Meta origins, blanket HTTPS, wildcard script/connect sources, hard-coded IDs, and claims that consent recalls previously transmitted data. Require BM/English disclosure of Google Analytics/Ads and consent controls.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npx vitest run --pool=forks --maxWorkers=1 src/test/google-tracking-csp.test.ts`

- [ ] **Step 3: Implement explicit policies and copy**

Document the Google tag/collection origins required by the loader and state that legal review of the final notice remains required. Do not turn enforcement on for a hosting layer that does not consume `_headers`.

- [ ] **Step 4: Verify GREEN and commit**

Run focused static tests and private-content scans. Commit: `Document Google tracking consent boundary`.

---

### Task 7: Browser/network verification and final analytics gate

**Files:**
- Create: `stress-tests/phase-c/google-tracking.local.config.ts`
- Create: `stress-tests/phase-c/tests/google-tracking.spec.ts`
- Create/modify: `src/test/google-tracking-end-to-end.test.tsx`

**Interfaces:**
- Browser proof uses the real production controller and loader with test configuration only; it never uses production identifiers or submits forms.

- [ ] **Step 1: Write failing browser assertions**

Verify no Google request before consent/rejection/withdrawal, exactly one script after acceptance, correct Consent Mode v2 state, page-view route filtering, and only the three generic conversion names after a public contact click.

- [ ] **Step 2: Run the browser proof and verify RED**

Run the existing system-Chrome harness with the bundled runtime and a local fixture; expected failures occur until the controller/CSP integration is complete.

- [ ] **Step 3: Run the full validation gate**

Run:

```powershell
npx vitest run --pool=forks --maxWorkers=1
npx tsc --noEmit
npm run build
npm run build:dev
npm run lint:changed
```

Also run the scoped private-file, dependency/static security, diff, and real-browser checks. No production migration, tracking identifier, consent enablement, publish, deploy, or external database operation is allowed.

- [ ] **Step 4: Commit the reviewed feature**

Commit: `Add consent-gated Google Analytics and Ads tracking`.

