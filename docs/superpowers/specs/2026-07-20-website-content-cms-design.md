# Klinik Awfa Website Content CMS Design

**Date:** 2026-07-20  
**Status:** Approved design  
**Scope:** Public website content management, Website Editor authorization, structured Home-page editing, draft preview, publishing, navigation, and rollback

## 1. Objective

Create a professional, structured content-management workspace that lets Administrators and a new `website_editor` role manage Klinik Awfa's public website without gaining access to staff administration or clinic operations.

The system must:

- preserve all current public wording, routes, media, and layouts during migration;
- let authorized users manage Home, general pages, services/landing pages, team/doctor profiles, blog posts, gallery images, reviews, and public navigation;
- support separate Malay and English content fields;
- provide private drafts, a bottom-of-editor Live Preview, explicit publishing, revision history, and rollback;
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

## 6. Structured Page Model

### 6.1 `website_pages`

Add a public-content table for Home, safe system-page copy, and newly created general pages. Each row contains:

- stable UUID;
- page kind: `home`, `system_content`, or `content`;
- unique slug, with Home represented by a fixed reserved record;
- private `draft_content` JSONB;
- public `published_content` JSONB;
- integer revision number for optimistic concurrency;
- publication status and timestamps;
- `updated_by` and `published_by` user IDs;
- created and updated timestamps.

Only `published_content` may be returned to anonymous users. Draft fields and editor identifiers are never exposed through an anonymous policy or public view.

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
- `clinic_reviews`

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

## 12. RLS and Storage Policy Requirements

The migration must inventory existing policies before replacement and verify the final policy matrix afterward.

Required outcomes:

- anonymous: read published pages, visible navigation, published/active website entities, and public website media only;
- Website Editor: read/write website drafts, published website entities, navigation, versions, and approved website-media folders only;
- Administrator: retain current website-management access plus the new editor workspace;
- all other authenticated roles: retain only their existing least-privilege access and gain no Website Editor permissions;
- Website Editor: explicitly denied clinic, patient, appointment administration, finance, payroll, inventory, staff administration, secrets, private storage, and role assignment.

Frontend guards are usability controls only. RLS and Storage policies are the authoritative boundary.

## 13. Migration and Content Preservation

The rollout is forward-only and staged:

1. add the enum value, helper, new CMS tables, constraints, RLS, and Storage policies;
2. seed Home and safe system-content records from the exact existing source content;
3. seed navigation from the current constants without changing labels, routes, or order;
4. deploy read-compatible frontend code that falls back to the existing source defaults if CMS rows are unavailable;
5. enable the editor routes after the role matrix passes;
6. create and assign the first Website Editor only after production authorization checks pass.

The migration must compare seeded values against an approved snapshot. A mismatch aborts rather than publishing altered wording.

## 14. Error Handling and Concurrency

- Queries show a clear retry state without replacing live content with blanks.
- Upload errors keep the selected draft and explain format/size failures.
- Publish errors identify validation, authorization, or stale-revision conflicts without exposing database details.
- Optimistic concurrency compares the editor's base revision with the current revision.
- A stale editor must reload or deliberately merge; silent last-write-wins publishing is forbidden.
- If dynamic CMS data is temporarily unavailable, public pages render the current bundled content fallback rather than fail closed to a blank homepage.

## 15. Verification Requirements

### 15.1 Automated frontend tests

- role routing and guard behavior for Administrator, Website Editor, ordinary staff, locum, guest, and anonymous states;
- Home schema validation, opacity clamping, safe URL checks, reserved slugs, and bilingual fallback;
- draft forms, unsaved-change warnings, bottom Live Preview, Desktop/Mobile modes, and disabled preview interactions;
- sanitizer regressions for both preview and public rendering;
- navigation visibility/order and protected-route rejection;
- public fallback rendering when CMS data is unavailable.

### 15.2 Database and Storage tests

- deterministic RLS matrix for anonymous, Website Editor, Administrator, ordinary staff, clinical roles, and finance roles;
- Website Editor CRUD succeeds only for approved website tables and folders;
- Website Editor reads/writes fail for clinic, patient, finance, payroll, inventory, secrets, private documents, and user-role assignment;
- anonymous draft/version reads fail;
- stale-revision publish fails without partial writes;
- publish writes a version and increments revision atomically;
- migration preflight/postflight policy inventory and content-preservation guards pass.

### 15.3 Release gates

- TypeScript check;
- frontend unit/integration tests;
- Deno regression tests;
- production and development Vite builds;
- dependency audit with no high or critical production findings;
- committed-private-file scan;
- desktop/mobile browser verification of all public website routes;
- authenticated browser verification for Administrator and Website Editor without production content modification;
- security scan contains no new error-level finding.

## 16. Deployment Boundary

Code, migrations, role assignment, and production publication are separate approval and verification points. The implementation may be prepared and reviewed without applying a production migration, creating a user, assigning a role, publishing content, changing secrets, or modifying existing production content.

