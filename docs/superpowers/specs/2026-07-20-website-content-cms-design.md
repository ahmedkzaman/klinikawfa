# Klinik Awfa Website Content CMS Design

**Date:** 2026-07-20  
**Status:** Approved design  
**Scope:** Public website content management, Website Editor authorization, structured Home-page editing, draft preview, publishing, navigation, rollback, and consent-gated Meta Pixel analytics

## 1. Objective

Create a professional, structured content-management workspace that lets Administrators and a new `website_editor` role manage Klinik Awfa's public website without gaining access to staff administration or clinic operations.

The system must:

- preserve all current public wording, routes, media, and layouts during migration;
- let authorized users manage Home, general pages, services/landing pages, team/doctor profiles, blog posts, gallery images, reviews, and public navigation;
- support separate Malay and English content fields;
- provide private drafts, a bottom-of-editor Live Preview, explicit publishing, revision history, and rollback;
- provide Administrator-controlled Meta Pixel analytics that remains completely inactive until a visitor explicitly accepts Marketing consent;
- keep the site's professional responsive design locked while exposing approved content, media, visibility, and ordering controls;
- enforce authorization in PostgreSQL RLS and Storage policies, not only in the React interface.

## 2. Confirmed Product Decisions

1. Home uses a **structured editor**, not a free-form drag-and-drop builder.
2. Website Editors and Administrators may **Draft -> Preview -> Publish directly**.
3. The **Live Preview is a separate section at the bottom** of each editor and supports Desktop and Mobile modes.
4. Editors may add new pages to public navigation and control the bilingual menu label, visibility, and order.
5. Editable content has separate Malay and English fields.
6. Existing content is copied exactly into the initial published state; the migration must not rewrite wording.
7. Public functional and protected routes keep their application logic and layout. Content editing must never expose or modify clinic, authentication, finance, payroll, inventory, or patient workflows.
8. Meta Pixel is **off by default**, is configured only by an Administrator, and cannot load or send an event until the visitor explicitly accepts Marketing consent.
9. Website Editors cannot view analytics controls or modify tracking configuration.
10. Meta tracking is limited to allowlisted public-page events and never receives patient, medical, appointment-form, authentication, contact-field, or account data.

## 3. Approaches Considered

### 3.1 Hybrid structured CMS — selected

Preserve the existing specialized tables and editors for services, team members, blog posts, gallery images, and reviews. Add a shared Website Editor workspace, a structured page model for Home and general pages, a private draft layer, navigation management, and revision history.

This approach minimizes data migration, keeps existing public queries stable, and provides a consistent editing experience without converting mature domain tables into untyped JSON documents.

### 3.2 One generic CMS table — rejected

Moving all services, profiles, articles, gallery items, and reviews into one generic content table would make the editor uniform but would require a high-risk migration and extensive public-page rewrites. It is not justified for the requested outcome.

### 3.3 Git-based content editing — rejected

Keeping content in source files would avoid new database structures but would require a branch, review, merge, and deployment for every content change. It does not satisfy the self-service requirement.

## 4. Authorization Model

### 4.1 New application role

Add `website_editor` to `public.app_role` and the generated TypeScript role union.

Define an authorization helper with a fixed search path that returns true only for:

- `admin`
- `special_admin`
- `doctor_admin` (preserves current Administrator behavior)
- `website_editor`

The helper is used consistently by RLS and Storage policies. It must read role data from `public.user_roles`; it must never rely on user-editable JWT `user_metadata`.

### 4.2 Website Editor isolation

`website_editor` must not be included in any existing staff/clinic booleans such as `isStaffOrAdmin`, `isOpsOrAdmin`, `isClinical`, or `canViewInsights`.

After login:

- a Website Editor is redirected to `/editor`;
- an Administrator can open `/editor` from the existing administrative navigation;
- a Website Editor sees no links to `/staff`, `/clinic`, payroll, finance, inventory, patient, secret, or integration screens;
- direct navigation to those routes is rejected by React route guards;
- direct Data API or Storage requests are independently rejected by RLS or Storage policies.

### 4.3 User creation and assignment

Administrators create or invite the user through the existing server-side user-management flow, then assign `website_editor` through the existing guarded role-assignment function. No service-role key is ever exposed to the browser.

## 5. Editor Information Architecture

Create a dedicated `/editor` layout containing only:

- Dashboard
- Home
- Pages
- Services
- Team / Doctors
- Blog
- Gallery
- Reviews
- Navigation
- Editor profile / sign out

Existing content-management screens may be reused internally, but they must be mounted behind the Website Editor guard and updated to use the shared draft, preview, validation, and publish patterns.

Administrators additionally see **Analytics & Consent**. This item is omitted for `website_editor`, and its route is protected by both an Administrator-only route guard and database authorization.

## 6. Structured Page Model

### 6.1 Published pages and private page drafts

Add `website_pages` as the public source for Home, safe system-page copy, and newly created general pages. Each row contains:

- stable UUID;
- page kind: `home`, `system_content`, or `content`;
- unique slug, with Home represented by a fixed reserved record;
- public `published_content` JSONB;
- integer revision number for optimistic concurrency;
- publication status and timestamps;
- `published_by` and audit timestamps.

Add `website_page_drafts` as a separate private table with one row per managed page. It contains the page ID, private `draft_content` JSONB, expected base revision, `updated_by`, and timestamps.

Anonymous and ordinary authenticated clients receive column-level `SELECT` only for the safe published page fields. They receive no privilege or policy on `website_page_drafts`. Administrators and Website Editors access drafts through explicit RLS policies. Separating the tables prevents a signed-in non-editor from selecting private draft columns through Supabase's shared `authenticated` database role.

### 6.2 Home-page content schema

The Home payload is schema-validated and covers the existing sections:

- Hero carousel: bilingual slide titles/subtitles, background image, background opacity, autoplay interval, and call-to-action labels/links.
- Why Klinik Awfa: bilingual heading, introduction, and structured highlight cards.
- Clinic video: section heading/introduction plus the existing public video and poster settings.
- Services preview: bilingual heading/introduction, visibility, and item limit; service data remains sourced from published services.
- Gallery strip: bilingual heading/introduction, visibility, and item limit; images remain sourced from published gallery items.
- Testimonials: bilingual heading/introduction and visibility; reviews remain sourced from active published reviews.
- Map/location: bilingual heading/introduction and safe display fields; operational clinic configuration remains outside this CMS.
- Section order and visibility: an allowlisted array containing only existing Home section identifiers.

Background opacity is clamped to a low-transparency range of 5% through 25%, with the current 13% appearance used as the initial value.

### 6.3 General pages

A new general page contains:

- Malay and English title;
- hero image and alt text;
- Malay and English sanitized rich-text body;
- optional structured image/video sections;
- Malay and English call-to-action label;
- validated internal or HTTPS call-to-action URL;
- Malay and English SEO title and description;
- immutable published slug after first publication unless an Administrator performs an explicit redirect-aware change.

New general pages render at `/pages/:slug`. Reserved or ambiguous slugs, including `auth`, `staff`, `clinic`, `appointment`, `services`, `doctors`, `gallery`, `blog`, `editor`, and API-related paths, are rejected.

## 7. Existing Website Resources

The CMS keeps these existing published tables as their source of truth:

- `clinic_services`
- `team_members`
- `blog_posts`
- `gallery_images`

`clinic_reviews` remains the operational source for review submissions and patient linkage, but it is never granted to `website_editor`. Add `website_review_presentations` as the isolated public-content source for testimonials. It contains only the approved display name/text in Malay and optional English, rating, public source label, publication status/order, timestamps, and a non-public source reference where applicable. It contains no `patient_id`, Google review identifier, WhatsApp state, or other clinic workflow field. Seed the currently active public reviews into this table without changing their displayed wording.

Where an existing public resource lacks bilingual fields, add only the required presentation columns: Malay/English title, body, or alt text as applicable. Preserve the exact existing value as the initial Malay value, leave optional English empty, and use the documented Malay fallback. Team members and blog posts continue using their existing bilingual columns. Review quotes are never machine-translated during migration.

A private `website_content_drafts` table stores validated draft payloads for existing resources without changing their public rows. The key is `(resource_type, resource_id)`. Supported resource types are fixed in a database enum or check constraint; clients cannot invent a table or column name.

Publishing uses allowlisted, fixed SQL branches per resource type. It must not use client-controlled dynamic SQL. The caller must pass the expected base revision so a stale draft cannot overwrite a newer publication.

## 8. Navigation

Add `website_navigation_items` with:

- stable UUID;
- optional reference to a managed page;
- allowlisted existing public route or validated external HTTPS URL;
- Malay and English labels;
- visibility flag;
- integer display order;
- optional parent identifier for one level of submenu only;
- revision and audit columns.

Navigation validation rejects protected routes, unsafe URL schemes, duplicate visible positions, cycles, and more than one submenu level. Only published visible items are anonymously readable.

## 9. Draft, Preview, Publish, and Rollback

### 9.1 Draft lifecycle

- Form changes remain local until **Save Draft**.
- Save Draft writes only to private draft storage.
- Drafts are visible only to Administrators and Website Editors.
- Upload failure leaves the current draft unchanged.
- Leaving with unsaved changes triggers a warning.

### 9.2 Live Preview

Every editor ends with a visually separated **Live Preview** section.

- It renders the current local form state, including unsaved changes.
- It reuses the same public rendering components and sanitization utilities to prevent preview/live drift.
- Desktop and Mobile tabs use fixed representative widths.
- Preview does not create a public URL and cannot be indexed.
- Links and form submissions inside preview are disabled or intercepted.

### 9.3 Publishing

Publish performs, in one database transaction:

1. authorization check;
2. revision/concurrency check;
3. payload and route validation;
4. snapshot of the previous published value;
5. copy of validated draft fields to the published source;
6. revision increment and audit-field update.

A validation or concurrency failure rolls back the entire transaction and leaves the live site unchanged.

### 9.4 Version history

`website_content_versions` stores immutable publication snapshots with resource type, resource ID, revision, payload, publisher, and publication timestamp. Retain at least the most recent 20 published versions per resource.

Restoring a version creates a new draft. It never silently overwrites the live page.

## 10. Storage and Media Safety

Website uploads use public website-media folders only. Existing URLs remain valid.

- Approved images: JPEG, PNG, WebP.
- Approved videos: MP4 and WebM; existing QuickTime handling may remain for Administrator-managed legacy video only.
- Enforce client validation and Storage/database validation where supported.
- Use unique immutable filenames to avoid stale CDN replacements.
- Store alt text with each public image.
- Website Editor write policies are limited to explicit website media buckets/folders.
- Website Editor receives no access to private patient, staff, claim, report, document, or attachment buckets.
- Service-role keys remain server-only.

## 11. HTML, URLs, and Content Validation

- All rich HTML passes through the existing `sanitizeRichHtml` output-boundary sanitizer.
- Preview uses the same sanitizer.
- `javascript:`, `data:`, protocol-relative, backslash-obfuscated, and protected internal URLs are rejected.
- Only known structured fields are accepted; unknown JSON keys are removed or rejected.
- Malay content is required for public pages; English content is separately editable and validated.
- Public fallback behavior is explicit: if an optional English field is empty, the matching Malay field is shown.
- Slugs are lowercase, normalized, unique, and checked against reserved routes before publication.

## 12. Consent-Gated Meta Pixel

### 12.1 Selected integration approach

Use a first-party consent manager and a dynamic Meta Pixel loader. Do not include Meta's base script or a `noscript` tracking image in static HTML. The application loads `https://connect.facebook.net/en_US/fbevents.js` only after all of these conditions are true:

1. the visitor is on an allowlisted public route;
2. Meta Pixel is enabled in the public tracking configuration;
3. the configured Pixel ID passes validation; and
4. the visitor has explicitly accepted the current version of Marketing consent.

A paid third-party consent platform is not required for the initial release. Meta Conversions API is out of scope because it would introduce server-side identifiers, secrets, deduplication, and a materially broader privacy review.

### 12.2 Tracking configuration and authorization

Add a single-row `website_tracking_settings` table containing:

- provider, fixed to `meta_pixel`;
- `enabled`, defaulting to `false`;
- `pixel_id`, nullable and validated as 5 through 32 ASCII digits;
- positive integer `consent_version`;
- `updated_by` and `updated_at` audit fields.

The Administrator roles `admin`, `special_admin`, and `doctor_admin` may update the configuration. `website_editor` may not update it and receives no analytics settings route. Browser clients can read only `provider`, `enabled`, `pixel_id`, and `consent_version`; the audit fields are not exposed through the Data API.

The migration must explicitly grant only the required Data API privileges and enable RLS. The `anon` and `authenticated` database roles receive `SELECT` only on the four public-safe columns. The `authenticated` database role receives `UPDATE` only on `enabled`, `pixel_id`, and `consent_version`; RLS then restricts that update to the three Administrator application roles with both `USING` and `WITH CHECK` predicates. Database-side logic owns `updated_by` and `updated_at`; browser clients cannot assign them. No service-role key is used in the browser, no Pixel ID is hard-coded in source, and an empty or invalid Pixel ID behaves as disabled.

Although a Meta Pixel ID is public once the Pixel runs, configuration changes remain Administrator-only so a Website Editor or ordinary authenticated user cannot redirect production analytics to another account.

### 12.3 Consent experience

Show a bilingual BM/English consent banner with equally clear actions:

- **Necessary only**: store the rejection and do not load Meta code;
- **Accept marketing**: store acceptance and permit the loader on allowlisted public routes; and
- **Manage cookies**: explain the Marketing category and permit a later change.

The choice is stored in `localStorage` under a Klinik Awfa-owned key as `{ version, marketing, updatedAt }`, where `marketing` is only `accepted` or `rejected`. It contains no identity or form data and is never sent to Supabase. If `consent_version` increases, the previous choice is no longer sufficient and the visitor is asked again. Necessary site functionality must work when Marketing consent is rejected or browser storage is unavailable.

A persistent footer link reopens the consent settings. Withdrawal immediately prevents future Pixel initialization and event calls. The application removes first-party Meta cookie values on the Klinik Awfa domain where technically possible and reloads into a tracking-disabled state; it does not claim that events already transmitted to Meta can be recalled.

The privacy notice identifies Meta as the Marketing analytics provider, explains that consented events may include the public page path, referrer, browser/device information, and Meta cookies, describes the event categories, links to the consent controls, and is available in BM and English. This specification defines the technical control and does not substitute for legal review of the final notice.

### 12.4 Event and route allowlist

Automatic advanced matching, automatic event detection, and arbitrary custom payloads are disabled. A typed tracking adapter exposes only these calls:

- `PageView`: initial load and client-side navigation on allowlisted public content routes after consent;
- `Contact`: click on a public telephone or WhatsApp call-to-action after consent;
- `Schedule`: click that opens the public appointment route after consent.

The adapter accepts no name, email, phone number, account identifier, medical field, form value, search term, free text, custom user property, or URL query string. Event code must not read appointment or authentication form state.

The centralized route classifier allowlists `/`, `/services`, `/services/:slug`, `/doctors`, `/doctor-on-duty`, `/gallery`, `/health-tips`, `/health-tips/:slug`, `/pages/:slug`, `/privacy`, and `/terms`; every unrecognized route defaults to tracking denied. Pixel initialization and all events are prohibited on `/auth`, `/staff`, `/clinic`, `/editor`, payment routes, appointment-form routes, password/reset routes, callback routes, and any future route marked protected. Tracking is also denied whenever the current URL has a query string, preventing Meta from receiving query parameters through the page URL. The appointment call-to-action may emit `Schedule` before navigation, but the appointment page and its form emit no PageView or submission event. Live Preview never initializes the Pixel or emits events.

### 12.5 Runtime isolation, failure behavior, and CSP

Keep consent state, Meta script loading, and event dispatch in separate modules with narrow interfaces. The rest of the UI calls the typed event adapter and cannot invoke `fbq` directly. The loader is idempotent, deduplicates SPA PageViews, and treats script failure, blocked requests, missing configuration, or a configuration fetch failure as analytics disabled. Tracking failure never interrupts navigation, contact links, appointments, or page rendering.

The production Content Security Policy may add only the specific Meta script and collection origins required by the approved browser integration. It must not broaden directives to blanket `https:` or wildcard sources. GitHub Pages hosting behavior and the effective production CSP must be verified before enforcement.

The initial deployment leaves `enabled = false`. Entering a Pixel ID, enabling the setting, deploying code, and publishing content are separate controlled actions.

## 13. RLS and Storage Policy Requirements

The migration must inventory existing policies before replacement and verify the final policy matrix afterward.

Required outcomes:

- anonymous: read safe published page columns, visible navigation, published/active website entities, isolated published review presentations, public-safe tracking columns, and public website media only;
- Website Editor: read/write website drafts, published website entities, navigation, versions, and approved website-media folders only;
- Administrator: retain current website-management access plus the new editor workspace;
- all other authenticated roles: retain only their existing least-privilege access and gain no Website Editor permissions;
- Website Editor: explicitly denied `clinic_reviews`, clinic, patient, appointment administration, finance, payroll, inventory, staff administration, secrets, private storage, and role assignment.

Frontend guards are usability controls only. RLS and Storage policies are the authoritative boundary.

## 14. Migration and Content Preservation

The rollout is forward-only and staged:

1. add the enum value, helper, new CMS tables including the disabled tracking-settings row, explicit Data API grants, constraints, RLS, and Storage policies;
2. seed Home and safe system-content records from the exact existing source content;
3. seed navigation from the current constants without changing labels, routes, or order;
4. deploy read-compatible frontend code that falls back to the existing source defaults if CMS rows are unavailable;
5. enable the editor routes after the role matrix passes;
6. create and assign the first Website Editor only after production authorization checks pass.

The migration must compare seeded values against an approved snapshot. A mismatch aborts rather than publishing altered wording.

## 15. Error Handling and Concurrency

- Queries show a clear retry state without replacing live content with blanks.
- Upload errors keep the selected draft and explain format/size failures.
- Publish errors identify validation, authorization, or stale-revision conflicts without exposing database details.
- Optimistic concurrency compares the editor's base revision with the current revision.
- A stale editor must reload or deliberately merge; silent last-write-wins publishing is forbidden.
- If dynamic CMS data is temporarily unavailable, public pages render the current bundled content fallback rather than fail closed to a blank homepage.

## 16. Verification Requirements

### 16.1 Automated frontend tests

- role routing and guard behavior for Administrator, Website Editor, ordinary staff, locum, guest, and anonymous states;
- Home schema validation, opacity clamping, safe URL checks, reserved slugs, and bilingual fallback;
- draft forms, unsaved-change warnings, bottom Live Preview, Desktop/Mobile modes, and disabled preview interactions;
- sanitizer regressions for both preview and public rendering;
- navigation visibility/order and protected-route rejection;
- public fallback rendering when CMS data is unavailable.
- consent banner acceptance, rejection, persistence, version changes, reopening, and withdrawal;
- Meta script absent before consent and present at most once after valid consent;
- `PageView`, `Contact`, and `Schedule` allowlisting, SPA deduplication, and zero arbitrary event payloads;
- no initialization or events on protected, appointment-form, authentication, payment, callback, or Live Preview routes;
- configuration failure and script blocking leave the website fully functional;
- analytics settings route and controls are available to Administrators and rejected for Website Editors and other roles.

### 16.2 Database and Storage tests

- deterministic RLS matrix for anonymous, Website Editor, Administrator, ordinary staff, clinical roles, and finance roles;
- Website Editor CRUD succeeds only for approved website tables and folders;
- Website Editor reads/writes fail for clinic, patient, finance, payroll, inventory, secrets, private documents, and user-role assignment;
- anonymous draft/version reads fail;
- ordinary authenticated draft reads fail even while their session uses the shared `authenticated` database role;
- Website Editor reads of `clinic_reviews` fail while safe `website_review_presentations` management succeeds;
- stale-revision publish fails without partial writes;
- publish writes a version and increments revision atomically;
- migration preflight/postflight policy inventory and content-preservation guards pass.
- anonymous reads return only the public-safe tracking columns;
- Administrator tracking updates succeed, while Website Editor and other authenticated updates fail;
- invalid Pixel IDs, unknown providers, non-positive consent versions, and attempts to modify audit ownership fail.

### 16.3 Release gates

- TypeScript check;
- frontend unit/integration tests;
- Deno regression tests;
- production and development Vite builds;
- dependency audit with no high or critical production findings;
- committed-private-file scan;
- desktop/mobile browser verification of all public website routes;
- authenticated browser verification for Administrator and Website Editor without production content modification;
- security scan contains no new error-level finding.
- browser network inspection confirms no request to Meta before consent, after rejection, after withdrawal, or on a prohibited route;
- consented public-route inspection confirms only the allowlisted Meta script/collection origins and event names;
- production CSP verification confirms no blanket source expansion.

## 17. Deployment Boundary

Code, migrations, role assignment, tracking configuration, consent-version changes, analytics enablement, and production publication are separate approval and verification points. The implementation may be prepared and reviewed without applying a production migration, creating a user, assigning a role, entering a Pixel ID, enabling tracking, publishing content, changing secrets, or modifying existing production content.
