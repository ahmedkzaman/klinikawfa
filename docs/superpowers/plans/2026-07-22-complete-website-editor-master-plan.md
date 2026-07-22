# Complete Klinik Awfa Website Editor Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking. This is one coordinated implementation program with staged commits and one final release gate.

**Goal:** Finish the entire Website Editor in one integration program so all approved roles can manage Home, general pages, services, team/doctors, blog, gallery, public reviews, navigation, Google Analytics/Ads consent settings, and their own editor profile without gaining access to clinic or administrative systems.

**Architecture:** Preserve the approved hybrid structured CMS. Home and general pages use website_pages plus private drafts; established public resources keep their existing source tables but publish only through typed private drafts and fixed database branches; public reviews remain isolated in website_review_presentations. Every editor shares Save Draft, bottom Desktop/Mobile Live Preview, explicit Publish, revision history, and conflict-safe restore.

**Tech Stack:** React 18, TypeScript, Vite, React Router, React Hook Form, Zod, TanStack Query, Supabase Postgres/Auth/RLS/Storage, DOMPurify, Vitest, Testing Library, Deno, GitHub Actions, GitHub Pages.

## Previously approved decisions incorporated

- One focused /editor workspace separate from clinic and staff administration.
- Authorized roles are admin, special_admin, doctor_admin, and website_editor.
- The Website Editor role must never receive clinic, patient, appointment, finance, payroll, inventory, workforce, secret, role-management, or private-storage access.
- Malay fields are required. Empty optional English fields fall back to Malay.
- Editors work Draft -> bottom Live Preview -> Publish directly.
- Live Preview has Desktop and Mobile modes, displays unsaved local state, and disables navigation, submissions, analytics, and indexing.
- Existing public wording, routes, slugs, media URLs, and visual design are preserved on initial activation.
- Rich HTML is sanitized at the output boundary using sanitizeRichHtml.
- Media uses the public website-media bucket only, UUID filenames, explicit folders, safe MIME types, size limits, and mandatory alt text.
- Home background opacity remains restricted to 5–25%, initially matching the existing 13% appearance.
- Google Analytics 4 and Google Ads replace Meta Pixel, remain disabled by default, and cannot load before explicit Marketing consent.
- Google events remain limited to approved public page views and generic contact_click, phone_click, and whatsapp_click events; no healthcare, appointment, identity, payment, authentication, or free-text data is sent.
- The active Supabase project is nhjbqdiyptjqherdfbqk.
- No partial frontend release: placeholders are replaced and all migrations/tests pass before the final production deployment.

## Current-state baseline

| Area | Current state | Required action |
|---|---|---|
| Editor route guard | Working | Preserve and extend tests |
| Roles | Owner is special_admin; four-role CMS helper exists | Verify all four roles and website_editor isolation |
| CMS foundation | Eight website tables, RLS, Storage policies exist | Reconcile migration history and verify grants |
| Home editor | Implemented | Seed exact Home row and authenticated draft |
| General Pages | Implemented | Validate creation/publish flow and seed safe system pages if approved content exists |
| Services | Hardcoded unavailable placeholder | Build editor and fixed publish branch |
| Team / Doctors | Hardcoded unavailable placeholder | Build editor and fixed publish branch |
| Blog | Hardcoded unavailable placeholder | Build editor and fixed publish branch |
| Gallery | Hardcoded unavailable placeholder | Build editor, uploads, ordering, visibility |
| Reviews | Hardcoded unavailable placeholder | Build isolated public presentation editor |
| Navigation | Hardcoded unavailable placeholder | Build draftable bilingual navigation |
| Analytics & Consent | Implemented for Google | Validate database/runtime/consent and keep disabled |
| Dashboard | Component exists but is not routed and contains placeholder copy | Turn into real content-status dashboard |
| Editor profile | Sign-out exists; no focused profile screen | Add safe account/profile and password controls |
| CMS data | All CMS content/draft/version/navigation/review counts are zero | Seed exact published state without rewriting public content |

## Editor page and function contract

### /editor — Dashboard

- Show counts and status for Home, Pages, Services, Team, Blog, Gallery, Reviews, and Navigation.
- Show Draft, Published, Needs attention, and conflict indicators.
- Show recent CMS draft/publication activity using CMS audit fields only.
- Link to each editor section.
- Never show clinic KPIs, appointments, leads, patients, payments, staff, or analytics reports.

### /editor/home — Structured Home editor

- Hero: bilingual slides, subtitles, clinic background image, alt text, low opacity, autoplay interval, and CTA labels/URLs.
- Why Klinik Awfa: bilingual heading, introduction, and structured highlight cards.
- Video: bilingual section text plus a YouTube/public video URL and optional poster. No video-file migration is required.
- Services preview: bilingual heading/description, visibility, CTA, and item limit; service items remain sourced from published services.
- Gallery preview: bilingual heading/description, visibility, CTA, and item limit.
- Testimonials: bilingual heading/description and visibility; items remain sourced from published review presentations.
- Map/location: bilingual heading/description and safe display/embed fields.
- Section visibility and ordering for the fixed seven Home sections.
- Save Draft, Publish, history, restore-to-draft, conflict warning, unsaved warning, and bottom Desktop/Mobile Live Preview.

### /editor/pages — General Pages

- List page title, slug, status, revision, last editor, and last update.
- Search/filter by status and language completeness.
- Create a page with normalized unique slug; reject protected/reserved routes.
- Edit bilingual title, hero image/alt text, sanitized rich body, structured media, CTA, and SEO title/description.
- Slug becomes immutable after first publication unless a future administrator-only redirect migration is explicitly approved.
- Archive/unpublish through an explicit confirmation; no destructive hard delete of published history.
- Render published pages at /pages/:slug.
- Save Draft, Publish, history, restore-to-draft, conflict handling, unsaved warning, and bottom Desktop/Mobile Live Preview.

### /editor/services — Services / landing pages

- Edit only the existing canonical service category rows; do not add or delete service categories in this implementation.
- Preserve the public slug alias map and the three canonical database categories: rawatan-am, prosedur-minor, and pemeriksaan-kesihatan.
- Edit bilingual title, description, CTA, service bullet lists, hero image, and optional YouTube/public promo video URL.
- Preserve approved service wording until the editor explicitly changes and publishes a draft.
- Sanitize rich descriptions in preview and public rendering.
- Save Draft, Publish, history, restore-to-draft, ordering where already supported, and bottom Desktop/Mobile Live Preview.

### /editor/team — Team / doctor profiles

- List active, hidden, and draft profiles with display order.
- Create a profile draft without creating a public row until publication.
- Edit profile type, bilingual name/title/bio/expertise, qualifications, photo, years of experience, visibility, and display order.
- Do not expose staff employment records, schedules, payroll, attendance, personal documents, or private profile data.
- Publish only safe presentation columns to team_members.
- Archive/hide instead of deleting a published profile.
- Save Draft, Publish, history, restore-to-draft, and bottom Desktop/Mobile Live Preview.

### /editor/blog — Health tips / blog posts

- List drafts, scheduled, published, archived, and orphan private drafts.
- Create and edit bilingual title, excerpt, sanitized body, category, featured image, reading time, publication status, and permitted schedule fields.
- Generate a normalized slug before first publication and lock it afterward.
- Never expose author identity through public projections.
- Render public lists/details with explicit presentation-only selects and Malay fallback.
- Save Draft, Publish, history, restore-to-draft, scheduling validation, and bottom Desktop/Mobile Live Preview.

### /editor/gallery — Gallery

- Upload JPEG, PNG, WebP, MP4, and WebM only, maximum 25 MiB.
- Use immutable gallery/<UUID>.<extension> paths; never replace an existing public object in place.
- Permit YouTube/public video links where the current gallery renderer supports them; do not import the old video file.
- Edit bilingual alt text, tags, display order, and visibility.
- Reorder items in draft without changing the live gallery until Publish.
- Warn that website-media objects are publicly retrievable and must never contain patient/private material.
- Save Draft, Publish, history, restore-to-draft, and bottom Desktop/Mobile Live Preview.

### /editor/reviews — Public testimonials

- Read and write only website_review_presentations.
- Never query or grant access to clinic_reviews.
- Create/edit bilingual public display name and review text, rating, source label, visibility/status, and display order.
- Render all fields as React text, not raw HTML.
- Archive/hide instead of destructive deletion of publication history.
- Save Draft, Publish, history, restore-to-draft, and bottom Desktop/Mobile Live Preview.

### /editor/navigation — Public navigation

- Manage bilingual labels, approved internal routes or external HTTPS URLs, visibility, order, and one submenu level.
- Add published general pages to navigation.
- Reject protected routes, unknown internal routes, duplicate visible positions, self-parenting, cycles, unsafe schemes, protocol-relative URLs, and backslash obfuscation.
- Header and Footer use published navigation and fall back to current static navigation on missing/invalid/error data.
- Publish navigation atomically from one private singleton draft.
- Save Draft, Publish, history, restore-to-draft, and bottom Desktop/Mobile Live Preview.

### /editor/analytics — Google Analytics & Consent

- Edit GA4 Measurement ID, Google Ads Conversion ID, the fixed three conversion labels, enabled state, and consent version.
- Validate G- and AW- identifier formats.
- Remain disabled unless required IDs/labels are valid.
- Never expose secrets; these identifiers are public configuration.
- Show no analytics reports.
- Maintain Consent Mode v2 denied defaults and explicit Marketing acceptance.
- Provide a test status explaining whether tracking is disabled, awaiting consent, or correctly configured.

### /editor/profile — Editor account

- Show authenticated email and assigned application role.
- Permit display-name/language preferences only if stored in a safe editor profile field.
- Provide Send password-reset email and Sign out.
- Do not expose role assignment, other users, staff records, or secrets.

## Global data and security contracts

- Public page tables contain published data only; private draft tables are inaccessible to anonymous and ordinary authenticated users.
- Browser clients receive explicit presentation-column SELECT grants only.
- Browser clients receive no direct INSERT/UPDATE/DELETE privileges on published resource tables.
- Publish operations use fixed SECURITY DEFINER trigger/RPC branches in the private schema, with fixed search_path, explicit auth.uid() role checks, PUBLIC execution revoked, payload validation, row locks, revision checks, version snapshots, and atomic updates.
- No client-controlled dynamic SQL.
- UPDATE policies include SELECT, USING, and WITH CHECK requirements.
- Every public/exposed table has RLS enabled.
- website_editor authorization comes only from user_roles, never user_metadata.
- Version history retains at least the latest 20 publications per resource.
- Restore always creates/updates a private draft; it never silently changes the live site.
- Public renderer failures fall back to the existing bundled/static content without blanking the website.

---

### Task 1: Reconcile repository, migration history, and live schema

**Files:**
- Review: supabase/migrations/20260720111916_add_website_editor_role.sql
- Review: supabase/migrations/20260720115031_create_website_cms_foundation.sql
- Review: supabase/migrations/20260720225347_harden_website_cms_integration.sql
- Review: supabase/migrations/20260721035032_add_website_page_publishing.sql
- Review: supabase/migrations/20260721100403_switch_tracking_to_google.sql
- Review: supabase/migrations/20260721170000_create_general_website_page_rpc.sql
- Quarantine/reconcile: supabase/migrations/20260722032157_229f6499-c9c6-413e-b659-052c2d5ac2f7.sql
- Create: src/test/website-cms-live-contract.test.ts

**Interfaces:**
- Produces an exact object/column/policy/function/grant inventory for project nhjbqdiyptjqherdfbqk.

- [ ] Write a failing contract test for the eight tables, four-role helpers, page publishing trigger, general-page RPC, Google columns, Storage bucket, and RLS/grants.
- [ ] Compare the duplicate-looking 20260722032157 migration with the already-applied foundation; remove it from the pending production set or replace it with a harmless documented reconciliation only after proving its origin.
- [ ] Query the live schema read-only and record all differences from committed migrations.
- [ ] Add forward-only reconciliation migrations only for confirmed differences; never rerun CREATE TABLE blindly.
- [ ] Run migration-text tests and TypeScript.
- [ ] Commit as Reconcile website CMS schema state.

### Task 2: Seed the exact current Home page and activate Home drafts

**Files:**
- Create with Supabase CLI: supabase/migrations/*_seed_exact_home_content.sql
- Create: src/test/website-home-seed.test.ts
- Review: src/features/website-cms/home/homeDefaults.ts
- Review: src/pages/editor/HomeEditor.tsx

**Interfaces:**
- Produces one published home row at revision 1 with content equal to DEFAULT_HOME_CONTENT.

- [ ] Write a test that canonical JSON from DEFAULT_HOME_CONTENT equals the SQL seed payload.
- [ ] Generate the migration using supabase migration new seed_exact_home_content.
- [ ] Insert only when slug home is absent; abort if a conflicting row exists; never overwrite live wording.
- [ ] Apply in isolated staging and create the matching private draft through an authenticated website-manager session.
- [ ] Verify load, local edits, Save Draft, Publish, history, restore, stale revision rejection, and bottom preview.
- [ ] Commit as Seed exact homepage CMS content.

### Task 3: Finish Dashboard, Pages, and Editor Profile

**Files:**
- Modify: src/pages/editor/Dashboard.tsx
- Modify: src/pages/editor/Pages.tsx
- Modify: src/pages/editor/PageEditor.tsx
- Create: src/pages/editor/EditorProfile.tsx
- Modify: src/components/editor/EditorLayout.tsx
- Modify: src/App.tsx
- Create: src/test/editor-dashboard-profile.test.tsx
- Extend: src/test/general-pages.test.tsx

**Interfaces:**
- Produces real /editor dashboard, /editor/pages flows, and /editor/profile.

- [ ] Write failing tests for status cards, CMS-only activity, safe profile fields, reset email, page create/archive, and bottom preview.
- [ ] Replace Dashboard placeholder copy and route /editor to Dashboard; label /editor/home as Home.
- [ ] Add Pages filtering, safe archive, error detail, and success states.
- [ ] Add the safe Editor Profile screen and navigation item.
- [ ] Verify no clinic/admin query occurs from these screens.
- [ ] Run focused tests, TypeScript, and build.
- [ ] Commit as Complete core editor workspace.

### Task 4: Define typed resource schemas and adapters

**Files:**
- Create: src/features/website-cms/resources/types.ts
- Create: src/features/website-cms/resources/schemas.ts
- Create: src/features/website-cms/resources/jsonSchemas.ts
- Create: src/features/website-cms/resources/registry.ts
- Create: src/test/website-resource-schemas.test.ts

**Interfaces:**
- Produces WebsiteResourceType for service, team_member, blog_post, gallery_image, and review.
- Produces strict ResourceAdapter parsePublished, parseDraft, toDraft, and renderPreview contracts.

- [ ] Write accepted/rejected fixture tests for every resource, Malay requirements, English fallback, safe URLs, bounds, and unknown keys.
- [ ] Implement strict Zod schemas and matching JSON Schema Draft 7 constants with additionalProperties false.
- [ ] Register exactly the five approved resource types; reject arbitrary types such as patients.
- [ ] Run focused tests and commit as Define website resource adapters.

### Task 5: Add bilingual presentation fields and isolated review seed

**Files:**
- Create with Supabase CLI: supabase/migrations/*_add_website_resource_presentations.sql
- Create: src/test/website-resource-presentation-migration.test.ts

**Interfaces:**
- Adds missing bilingual service/gallery fields and website_revision.
- Seeds public review presentations only from the safe public reviews table.

- [ ] Write tests proving no destructive rename/drop and no clinic_reviews reference.
- [ ] Backfill Malay presentation fields with COALESCE(new, legacy); preserve non-null bilingual values.
- [ ] Leave English optional and empty where no verified translation exists.
- [ ] Seed only safe published review presentation fields.
- [ ] Verify exact row counts and preservation in isolated staging.
- [ ] Commit as Add bilingual website resource presentations.

### Task 6: Implement fixed resource draft/publish/version transactions

**Files:**
- Create with Supabase CLI: supabase/migrations/*_add_website_resource_publishing.sql
- Create: src/features/website-cms/api/resources.ts
- Create: src/test/website-resource-publishing-migration.test.ts
- Create: src/test/website-resources-api.test.ts

**Interfaces:**
- Produces fetchResourceList, fetchResourceEditor, createResourceDraft, saveResourceDraft, publishResourceDraft, and restoreResourceVersion.

- [ ] Write failing SQL/API tests for validation, explicit branches, stale revision 40001, unknown type 22023, snapshots, and no dynamic SQL.
- [ ] Add draft validation on save and repeat validation inside publish.
- [ ] Implement fixed branches for the five resource types.
- [ ] Refuse creation of missing service categories; permit private new drafts for team/blog/gallery/review.
- [ ] Revoke published-table browser mutations and grant exact presentation-only reads.
- [ ] Run focused tests, advisors, TypeScript, and commit as Add safe website resource publishing.

### Task 7: Build shared ResourceEditorFrame

**Files:**
- Create: src/components/editor/ResourceEditorFrame.tsx
- Create: src/components/editor/ResourceListFrame.tsx
- Extend: src/components/editor/EditorDirtyNavigation.tsx
- Create: src/test/resource-editor-frame.test.tsx

**Interfaces:**
- Produces common list, editor toolbar, Save Draft, Publish, history, restore, conflict/error display, and bottom Desktop/Mobile Live Preview.

- [ ] Write tests for local preview, disabled preview interactions, dirty navigation, save/publish state, conflicts, and restore.
- [ ] Implement accessible controls with the existing professional editor design language.
- [ ] Ensure preview never mounts Google tracking or submits/navigates.
- [ ] Run focused tests and commit as Add shared website resource editor frame.

### Task 8: Build Services editor and public projection

**Files:**
- Create: src/pages/editor/Services.tsx
- Create: src/pages/editor/ServiceEditor.tsx
- Modify: src/pages/ServiceDetail.tsx
- Modify: src/lib/serviceSlugMap.ts only if tests reveal a regression
- Modify: src/App.tsx
- Create: src/test/website-services-editor.test.tsx
- Create: src/test/website-public-resource-projections.test.ts

- [ ] Write tests for three canonical categories, 16 public aliases, bilingual fallback, approved bullets, sanitizer, preview, and no Add Service.
- [ ] Adapt safe fields from src/pages/staff/admin/LandingPages.tsx without mounting StaffLayout or admin hooks.
- [ ] Use exact presentation-only service projection and preserve resolveServiceCategorySlug.
- [ ] Replace /editor/services placeholder with list/detail routes.
- [ ] Run service, sanitizer, slug-map, projection, TypeScript, and build tests.
- [ ] Commit as Add services website editor.

### Task 9: Build Team / Doctors editor and public projection

**Files:**
- Create: src/pages/editor/Team.tsx
- Create: src/pages/editor/TeamEditor.tsx
- Modify: src/pages/Doctors.tsx
- Verify: src/pages/DoctorOnDuty.tsx
- Modify: src/App.tsx
- Create: src/test/website-team-editor.test.tsx

- [ ] Write tests for create draft, bilingual fields, visibility/order, safe photo, archive, and denial of staff/private fields.
- [ ] Adapt presentation fields from the existing Team editor without staff authorization dependencies.
- [ ] Use explicit public team projection and active-only public filtering.
- [ ] Replace /editor/team placeholder with list/detail routes.
- [ ] Run focused tests, TypeScript, and build.
- [ ] Commit as Add team website editor.

### Task 10: Build Blog editor and public projection

**Files:**
- Create: src/pages/editor/Blog.tsx
- Create: src/pages/editor/BlogEditor.tsx
- Modify: src/hooks/useBlogPosts.ts
- Modify: src/pages/HealthTips.tsx
- Modify: src/pages/BlogPost.tsx
- Modify: src/App.tsx
- Create: src/test/website-blog-editor.test.tsx

- [ ] Write tests for new draft, slug lock, categories, bilingual fallback, sanitized body, publish/archive/schedule validation, and safe projections.
- [ ] Adapt safe form fields from the existing Blog editor.
- [ ] Remove wildcard blog selects and omit author identity from public data.
- [ ] Replace /editor/blog placeholder with list/detail routes.
- [ ] Run focused tests, sanitizer, TypeScript, and build.
- [ ] Commit as Add blog website editor.

### Task 11: Add safe media uploads and Gallery editor

**Files:**
- Create: src/features/website-cms/media/validation.ts
- Create: src/features/website-cms/media/uploadWebsiteMedia.ts
- Create: src/components/editor/WebsiteMediaUploader.tsx
- Create: src/pages/editor/Gallery.tsx
- Modify: src/hooks/useGalleryImages.ts
- Modify: src/pages/editor/HomeEditor.tsx
- Modify: src/pages/editor/PageEditor.tsx
- Modify: src/App.tsx
- Create: src/test/website-media.test.ts
- Create: src/test/website-gallery-editor.test.tsx

- [ ] Write tests for MIME/size/folder rules, UUID paths, no upsert, alt text, ordering, visibility, public-media warning, and safe projections.
- [ ] Implement immutable website-media uploads for home, pages, services, team, blog, gallery, and reviews folders.
- [ ] Integrate uploader into Home, Pages, Team, Blog, Services, and Gallery.
- [ ] Support validated YouTube/public URLs without importing the old video file.
- [ ] Replace /editor/gallery placeholder.
- [ ] Run Storage matrix, focused tests, TypeScript, and build.
- [ ] Commit as Add safe website media and gallery editor.

### Task 12: Build isolated Reviews editor

**Files:**
- Create: src/pages/editor/Reviews.tsx
- Modify: src/components/home/TestimonialsSection.tsx
- Modify: src/App.tsx
- Create: src/test/website-reviews-isolation.test.tsx

- [ ] Write tests that fail on any clinic_reviews access or raw HTML rendering.
- [ ] Implement create/edit/order/publish/archive using website_review_presentations only.
- [ ] Switch public testimonials to published presentation rows with static fallback on error.
- [ ] Replace /editor/reviews placeholder.
- [ ] Run review isolation, existing clinic-review policy, TypeScript, and build tests.
- [ ] Commit as Isolate public review presentations.

### Task 13: Build Navigation editor and atomic publisher

**Files:**
- Create with Supabase CLI: supabase/migrations/*_add_website_navigation_publishing.sql
- Create: src/features/website-cms/navigation/schema.ts
- Create: src/features/website-cms/api/navigation.ts
- Create: src/pages/editor/Navigation.tsx
- Modify: src/components/layout/Header.tsx
- Modify: src/components/layout/Footer.tsx
- Modify: src/App.tsx
- Create: src/test/website-navigation.test.tsx
- Create: src/test/website-navigation-publishing-migration.test.ts

- [ ] Write tests for bilingual labels, static fallback, one submenu, pages links, route allowlist, HTTPS-only external URLs, no cycles, and no duplicate positions.
- [ ] Implement matching Zod/database validation.
- [ ] Implement revision-checked singleton draft publication and immutable history using fixed SQL.
- [ ] Replace /editor/navigation placeholder and update Header/Footer to published-with-static-fallback behavior.
- [ ] Run navigation, security, TypeScript, production and development builds.
- [ ] Commit as Add managed public navigation.

### Task 14: Validate Google Analytics/Ads and consent end to end

**Files:**
- Review/modify only where validation fails: src/features/analytics/*
- Review/modify only where validation fails: src/features/consent/*
- Review: src/pages/editor/AnalyticsSettings.tsx
- Extend: src/test/google-*.test.*
- Modify: privacy/consent copy and host CSP configuration only if tests identify a gap

- [ ] Verify database row uses provider google_tag, enabled false, empty identifiers, and the four-role update helper.
- [ ] Run ID, consent-store, route-policy, loader, controller, CSP, and end-to-end tests.
- [ ] Verify no Google request before acceptance, after rejection, or after withdrawal.
- [ ] Verify no analytics in editor previews/protected routes and no sensitive event parameters.
- [ ] Keep tracking disabled until the owner manually supplies valid production IDs and explicitly enables it.
- [ ] Commit only necessary corrections as Validate consent-gated Google tracking.

### Task 15: Complete role, RLS, Storage, and adversarial testing

**Files:**
- Extend: stress-tests/phase-d/website-cms.fixture.test.ts
- Create: docs/security/website-cms-complete-validation.md
- Regenerate: src/integrations/supabase/types.ts

- [ ] Test admin, special_admin, doctor_admin, and website_editor editor access.
- [ ] Test ordinary/clinical roles are denied editor writes.
- [ ] Prove website_editor denial for clinic, patients, appointments, finance, payroll, inventory, staff admin, role assignment, secrets, private Storage, and clinic_reviews.
- [ ] Test every draft/publish/version/restore flow and all website-media folders.
- [ ] Run Supabase security and performance advisors; fix new CMS errors and record unrelated warnings without suppression.
- [ ] Regenerate types and run TypeScript.
- [ ] Commit as Validate complete website CMS isolation.

### Task 16: One final integration, migration, and release

**Files:**
- Modify: .github/workflows/security-gate.yml only if new focused tests are not already covered
- Create: docs/releases/website-editor-complete-release.md

- [ ] Rebase one integration branch on current main and verify the diff contains only approved CMS, tests, migrations, documentation, and lockfile changes.
- [ ] Run npm ci, lint:changed, tsc --noEmit, all Vitest tests, Deno tests, production build, development build, public npm audit, tracked-secret scan, and migration tests.
- [ ] Restore a fresh sanitized staging database/branch and apply every new migration in timestamp order.
- [ ] Run desktop/mobile browser checks for all editor and public routes with no patient/form submissions.
- [ ] Open one final review PR; require Security Gate and Pages deployment checks to pass.
- [ ] Back up nhjbqdiyptjqherdfbqk immediately before production migration.
- [ ] Apply only reviewed pending migrations, verify migration readback, RLS, row counts, and exact Home seed.
- [ ] Deploy the frontend once, after the complete feature set is present.
- [ ] Run live smoke tests for every editor route, one reversible synthetic draft/publish per content type, public fallback behavior, console/network errors, and HTTPS.
- [ ] Remove synthetic records/media, retain the backup outside Git, document rollback points, and close the release.

## Final acceptance criteria

- No editor navigation item displays Coming in the next CMS plan or unavailable because of missing seed data.
- Every editor supports private draft, separate bottom Desktop/Mobile Live Preview, explicit publish, history, restore-to-draft, stale-revision handling, and unsaved-change warning where applicable.
- Current public content remains unchanged immediately after activation.
- All four approved roles can use the editor; website_editor remains unable to access clinic/admin systems or sensitive data.
- Anonymous users can read only published safe presentation fields.
- Home background and YouTube/public video controls work without importing the old video.
- Google Analytics/Ads remains consent-gated and disabled until valid owner-supplied IDs are enabled.
- Security Gate, migrations, tests, builds, advisors, live desktop/mobile checks, and cleanup all pass.
