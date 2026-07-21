# Klinik Awfa Website Content CMS Implementation Roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a secure Website Editor workspace, structured public-content publishing, isolated media and review management, and consent-gated Meta Pixel analytics without expanding access to clinic operations or changing existing live wording during migration.

**Architecture:** The work is split into four ordered implementation plans because authorization/database boundaries, public-page rendering, existing-resource management, and analytics consent are independently reviewable systems. Each plan produces a testable increment and stops at explicit staging and production boundaries.

**Tech Stack:** React 18, React Router 6, TypeScript 5, Vite 8, TanStack Query, React Hook Form, Zod, DOMPurify, Supabase Auth/Postgres/RLS/Storage, Vitest, Testing Library, Deno tests, GitHub Actions, GitHub Pages.

## Global Constraints

- Preserve all current public wording, routes, media URLs, and layouts while seeding CMS content.
- Keep `website_editor` out of `isStaffOrAdmin`, `isOpsOrAdmin`, `isClinical`, `canViewInsights`, and every clinic/finance/staff authorization helper.
- Enforce access in PostgreSQL RLS and Storage policies; React guards are usability controls only.
- Never expose a service-role key, database password, patient identifier, private review linkage, or secret in browser code, migrations, fixtures, logs, screenshots, or commits.
- Public/published records and private drafts remain in separate tables.
- Website Editors never receive direct access to `clinic_reviews`; public testimonials use the isolated `website_review_presentations` model.
- Malay fields are the required public fallback. Migration copies current text exactly and never machine-translates it.
- Rich HTML is sanitized at every preview and public rendering boundary through `sanitizeRichHtml`.
- Meta Pixel remains disabled until an Administrator supplies a valid Pixel ID, enables it, and a visitor explicitly accepts the current Marketing consent version.
- No Meta script or request is allowed on protected, appointment-form, payment, authentication, callback, or editor routes, or on URLs containing a query string.
- Create migration files with `supabase migration new`; do not invent migration timestamps.
- New Data API tables require explicit grants plus RLS.
- Applying a staging migration, applying a production migration, assigning a role, entering a Pixel ID, enabling analytics, publishing CMS content, and deploying are separate checkpoints.

---

## Ordered Plans

### Plan 1: Authorization and Data Foundation

File: `docs/superpowers/plans/2026-07-20-website-cms-foundation.md`

Produces:

- `website_editor` enum value and frontend role type;
- guarded Administrator-only Website Editor account creation through the existing server-side function;
- database helpers, tables, RLS, grants, and Storage boundary;
- isolated `/editor` route shell and role-aware login redirect;
- deterministic policy tests proving Website Editor isolation.

Exit gate: local checks pass and the migration diff is reviewed. No production application.

### Plan 2: Structured Pages, Drafts, Preview, and Publishing

File: `docs/superpowers/plans/2026-07-20-website-cms-pages.md`

Consumes:

- `canManageWebsite` from Plan 1;
- `website_pages`, `website_page_drafts`, and `website_content_versions` from Plan 1.

Produces:

- structured Home and general-page schemas;
- exact existing Home content as the bundled fallback and initial seed;
- Save Draft, bottom Live Preview, Desktop/Mobile modes, Publish, revision conflict handling, history, and restore-to-draft;
- `/pages/:slug` public rendering.

Exit gate: a draft can be previewed and published in sanitized staging while production content remains unchanged.

### Plan 3: Existing Resources, Reviews, Media, and Navigation

File: `docs/superpowers/plans/2026-07-20-website-cms-resources.md`

Consumes:

- editor shell and draft/version contracts from Plans 1 and 2.

Produces:

- Website Editor screens for services, team/doctors, blog, gallery, isolated public reviews, and navigation;
- bilingual presentation fields and exact-value migration;
- safe website-media uploads;
- dynamic public navigation and public testimonial projection.

Exit gate: all content-resource RLS/storage tests and desktop/mobile public-route checks pass in sanitized staging.

### Plan 4: Consent-Gated Meta Pixel

File: `docs/superpowers/plans/2026-07-20-consent-gated-meta-pixel.md`

Consumes:

- dedicated four-role tracking-settings route from Plan 1;
- `website_tracking_settings` from Plan 1;
- public navigation/layout from Plans 2 and 3.

Produces:

- bilingual consent controls and privacy disclosure;
- local consent persistence, withdrawal, and version changes;
- idempotent dynamic Meta loader and strict route/event allowlist;
- tracking settings restricted to `admin`, `special_admin`, `doctor_admin`, and `website_editor`;
- CSP and browser-network validation.

Exit gate: tests prove zero Meta requests without consent, after rejection/withdrawal, and on prohibited routes. Tracking remains disabled in production.

---

## Final Integration Sequence

- [ ] **Step 1: Execute Plan 1 and review its migration and role matrix**

Expected: editor shell is inaccessible to ordinary staff, clinical roles, locum, guest, and anonymous users.

- [ ] **Step 2: Execute Plan 2 and verify exact Home fallback parity**

Expected: the public site is unchanged before any CMS row is published.

- [ ] **Step 3: Execute Plan 3 and verify resource/media isolation**

Expected: Website Editor can manage only public website content and website-media objects.

- [ ] **Step 4: Execute Plan 4 with Meta configuration disabled**

Expected: consent UI is functional, but no Meta network request occurs while `enabled = false`.

- [ ] **Step 5: Run the complete local release gate**

Run:

```powershell
npm ci
npm run lint:changed
npx tsc --noEmit
npm test
deno test supabase/functions/_shared/secure-random_test.ts
deno test --allow-net --allow-env supabase/functions/tests/ai.test.ts
npm run build
npm run build:dev
npm audit --omit=dev --audit-level=high --registry=https://registry.npmjs.org/
```

Expected: all commands exit `0`; production audit reports `high=0` and `critical=0`.

- [ ] **Step 6: Run the committed-private-file check**

Run:

```powershell
git ls-files | Select-String -Pattern '(^|/)(\.env($|\.)|node_modules/|dist/|.*credentials.*|.*service-role.*)'
```

Expected: only approved blank example environment files match; no real credential, `node_modules`, or `dist` path is tracked.

- [ ] **Step 7: Apply reviewed migrations to sanitized staging only**

Precondition: staging project-reference guard passes and does not equal any committed production reference.

Expected: migrations apply once, Supabase advisors contain no new error, and generated TypeScript types include every new table/function/enum. With a separate Edge Function deployment approval, deploy the changed `admin-create-user` function to sanitized staging only and verify its role-policy unit test before using it to create the synthetic Website Editor fixture. Do not deploy the function to production in this step.

- [ ] **Step 8: Run the deterministic staging RLS and Storage matrix**

Expected: all approved Website Editor operations pass; every clinic, patient, finance, payroll, inventory, staff-administration, secret, private-storage, role-assignment, and `clinic_reviews` operation fails.

- [ ] **Step 9: Perform read-only browser verification**

Check desktop and mobile Home, services, doctors, gallery, health tips, new content pages, editor preview, consent choices, and analytics network behavior without submitting forms.

Expected: no console error, no content regression, no Meta request outside the consented allowlist, and no editor access leak.

- [ ] **Step 10: Open a review PR**

Expected: CI passes and the PR description lists schema changes, RLS matrix evidence, content snapshot hash, tracking-disabled state, and explicit actions not performed.

- [ ] **Step 11: Stop before production mutation**

Do not apply production migrations, create or assign the Website Editor account, publish CMS content, set the Pixel ID, enable tracking, change secrets, or deploy until each corresponding checkpoint is explicitly authorized and its rollback evidence is recorded.
