# Google Analytics 4 + Google Ads Consent-Gated Tracking Design

## Goal

Add privacy-first Google Analytics 4 and Google Ads conversion measurement to the public Klinik Awfa website, replacing the planned Meta Pixel integration.

## Scope

The integration uses the Google tag (`gtag.js`) with Google Consent Mode v2. Tracking is disabled by default and is loaded only after the visitor grants the relevant consent category. The same consent state controls both Analytics and Ads behavior.

## Architecture

1. A small client-side tracking loader owns the data layer, Consent Mode v2 defaults, script injection, configuration, route filtering, and event dispatch.
2. Configuration is read from the existing website CMS tracking configuration and exposes only public identifiers: GA4 measurement ID, Google Ads conversion ID, conversion labels, enabled state, and approved event mappings. No credentials or service keys are stored in the browser.
3. The loader is mounted once at the public application boundary. It does nothing in editor previews, protected application areas, or before consent.
4. Consent updates are persisted through the existing consent mechanism. Revocation updates Google consent state and prevents subsequent tracking calls.

## Consent behavior

Before consent, the implementation queues only local `gtag` commands and sets:

```text
analytics_storage: denied
ad_storage: denied
ad_user_data: denied
ad_personalization: denied
```

No Google script or network request is made before consent. After the visitor grants analytics and/or advertising consent, the Google tag is injected once and the corresponding consent state is updated. Revocation sends a denied update and disables future event dispatch.

## Route and event allowlist

Page views are limited to public marketing routes and use the pathname only. Query strings and fragments are excluded. Protected, authenticated, staff, clinic, finance, appointment-processing, editor, and preview routes never emit page views or conversion events.

The initial Ads conversion allowlist contains only generic contact-intent actions:

- `contact_click`
- `phone_click`
- `whatsapp_click`

No appointment submissions, patient identifiers, medical services selected, symptoms, form contents, payment details, login activity, or healthcare outcomes are sent to Google. Event parameters contain only a fixed event name and a public route pathname from the allowlist.

## CMS permissions and validation

The existing exact CMS roles remain the only roles allowed to update tracking configuration: `admin`, `special_admin`, `doctor_admin`, and `website_editor`. Configuration validation requires Google identifier formats (`G-...`, `AW-...`) and an explicit event allowlist. Tracking remains disabled unless the configuration is enabled and consent is granted.

## Failure handling

- Missing or invalid identifiers disable tracking without affecting page rendering.
- Script load failure is reported locally and never retried in a loop.
- Duplicate mounting or route transitions do not duplicate the Google script or page views.
- Preview and editor rendering remain network-free and analytics-free.

## Verification

Tests will cover:

- default-denied consent state;
- zero Google network/script activity before consent;
- one-time loading and consent updates after acceptance;
- revocation behavior;
- public-route-only page views;
- exclusion of query strings, protected routes, previews, and healthcare events;
- exact role/configuration validation;
- Google Ads conversion dispatch only for the fixed contact-intent allowlist.

No production migration, deployment, secret modification, or live tracking activation occurs in this implementation pass. Identifiers remain unset until the site owner supplies them through the CMS configuration.
