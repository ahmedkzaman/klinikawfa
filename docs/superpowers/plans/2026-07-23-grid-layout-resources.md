# Website Resource Grid Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the verified shared grid engine to Services, Team, Blog, Gallery, and Reviews listing/detail templates without changing resource content or publication behavior.

**Architecture:** Each resource type supplies a small allowlisted template adapter to the existing shared layout schema, renderer, and editor. Template layouts live in the existing website page/template draft path rather than inside each resource record, so arranging a listing or detail template does not duplicate or rewrite records.

**Tech Stack:** React 18, TypeScript 5.8, Zod 3, existing website CMS resource adapters, shared `WebsiteGridRenderer` and `LayoutEditor`, Vitest, Testing Library, Supabase JSONB validation.

## Global Constraints

- The core plan `docs/superpowers/plans/2026-07-23-grid-layout-core.md` must be merged and verified first.
- Resource data, slugs, routes, moderation, publication state, RLS, and storage paths remain unchanged.
- Layouts configure templates, not individual record contents.
- Only existing website-manager roles may edit or publish template layouts.
- Use the exact shared numeric layout schema and renderer; do not create a second layout engine.
- Existing routes without a saved layout retain their present rendering.
- Follow test-driven development and commit each independently testable adapter.

---

### Task 1: Resource template layout registry

**Files:**
- Create: `src/features/website-cms/layout/resourceTemplates.ts`
- Modify: `src/features/website-cms/resources/types.ts`
- Test: `src/test/resource-template-layouts.test.ts`

**Interfaces:**
- Produces `RESOURCE_TEMPLATE_LAYOUTS`, `ResourceTemplateId`, `getResourceTemplateDefinition(id)`, each with `allowedKinds`, `labels`, `protectedKinds`, and `createDefaultLayout()`.

- [ ] Write failing tests for all listing/detail definitions and current-order defaults.
- [ ] Run `npm test -- src/test/resource-template-layouts.test.ts` and confirm missing-module failure.
- [ ] Implement definitions for Services listing/detail, Team listing/detail, Blog listing/post, Gallery, and Reviews using the exact kinds approved in the design specification.
- [ ] Run the test and confirm PASS.
- [ ] Commit with `git commit -m "Add resource template layout registry"`.

### Task 2: Template draft/publish storage

**Files:**
- Modify: `src/features/website-cms/resources/schemas.ts`
- Modify: `src/features/website-cms/resources/jsonSchemas.ts`
- Create: `supabase/migrations/20260723191000_add_resource_template_layouts.sql`
- Test: `src/test/resource-template-layout-migration.test.ts`

**Interfaces:**
- Adds `resource_template` to the existing private draft/version lifecycle with a payload `{ templateId, layout }`.

- [ ] Write failing tests that enforce exact template IDs, strict shared layout validation, existing manager authorization, revision conflicts, versions, and no public draft access.
- [ ] Run the migration/schema tests and verify RED.
- [ ] Add the strict resource-template schema and forward-only migration using existing draft/publish/audit functions.
- [ ] Run resource publishing and new migration tests; confirm PASS.
- [ ] Commit with `git commit -m "Add resource template layout publishing"`.

### Task 3: Resource template editor screen

**Files:**
- Create: `src/pages/editor/TemplateLayoutEditor.tsx`
- Modify: `src/pages/editor/Services.tsx`
- Modify: `src/pages/editor/Team.tsx`
- Modify: `src/pages/editor/Blog.tsx`
- Modify: `src/pages/editor/Gallery.tsx`
- Modify: `src/pages/editor/Reviews.tsx`
- Modify: editor route configuration in the existing application router.
- Test: `src/test/resource-template-editor.test.tsx`

**Interfaces:**
- Uses shared `LayoutEditor`, existing `EditorWorkspace`, `PublishingSidebar`, version panel, dirty navigation, and bottom `LivePreview`.

- [ ] Write failing route, role, draft, preview, save, publish, restore, and conflict tests.
- [ ] Run tests and verify RED.
- [ ] Implement a single parameterized editor screen and add “Edit layout” actions to each resource area.
- [ ] Ensure preview is last and uses the public adapter with preview-safe interactions.
- [ ] Run tests and confirm PASS.
- [ ] Commit with `git commit -m "Add resource template layout editor"`.

### Task 4: Services adapters

**Files:**
- Modify: `src/pages/Services.tsx`
- Modify: `src/pages/ServiceDetail.tsx`
- Create: `src/features/website-cms/layout/adapters/services.tsx`
- Test: `src/test/services-template-layout.test.tsx`

- [ ] Write failing tests for current fallback layout, allowlisted blocks, hidden blocks, mapped service slugs, sanitizer preservation, and unknown-slug 404.
- [ ] Run tests and verify RED.
- [ ] Route listing/detail through the shared renderer and Services adapters.
- [ ] Run existing service and sanitizer tests; confirm PASS.
- [ ] Commit with `git commit -m "Add grid layouts to service templates"`.

### Task 5: Team adapters

**Files:**
- Modify: `src/pages/Doctors.tsx`
- Modify: `src/pages/DoctorOnDuty.tsx` only if its existing doctor-card presentation consumes the shared Team template; otherwise leave it unchanged and record that decision in the test.
- Create: `src/features/website-cms/layout/adapters/team.tsx`
- Test: `src/test/team-template-layout.test.tsx`

- [ ] Write failing fallback, listing, profile, hidden-block, mobile-order, and missing-profile tests.
- [ ] Run tests and verify RED.
- [ ] Route existing Team data through the adapter and shared renderer without changing queries.
- [ ] Run focused and existing Team tests; confirm PASS.
- [ ] Commit with `git commit -m "Add grid layouts to team templates"`.

### Task 6: Blog adapters

**Files:**
- Modify current Blog listing route and `src/pages/BlogPost.tsx`.
- Create: `src/features/website-cms/layout/adapters/blog.tsx`
- Test: `src/test/blog-template-layout.test.tsx`

- [ ] Write failing listing/post fallback, Markdown sanitizer, taxonomy, pagination, related-post, hidden-block, and mobile-order tests.
- [ ] Run tests and verify RED.
- [ ] Route existing Blog fragments through the shared renderer.
- [ ] Run existing Blog, taxonomy, and security tests; confirm PASS.
- [ ] Commit with `git commit -m "Add grid layouts to blog templates"`.

### Task 7: Gallery and Reviews adapters

**Files:**
- Modify: `src/pages/Gallery.tsx`
- Modify: `src/components/home/TestimonialsSection.tsx`
- Create: `src/features/website-cms/layout/adapters/gallery.tsx`
- Create: `src/features/website-cms/layout/adapters/reviews.tsx`
- Test: `src/test/gallery-reviews-template-layout.test.tsx`

- [ ] Write failing fallback, filtering, lightbox, moderation-state, hidden-block, and mobile-order tests.
- [ ] Run tests and verify RED.
- [ ] Route both templates through the shared renderer without changing media or review queries.
- [ ] Run gallery, review-policy, and security tests; confirm PASS.
- [ ] Commit with `git commit -m "Add grid layouts to gallery and reviews"`.

### Task 8: Full resource verification

**Files:**
- Modify only files required by verified failures.

- [ ] Run all new resource-template tests.
- [ ] Run `npx tsc --noEmit`, `npm test`, `npm run lint:changed`, `npm run build`, and `npm run build:dev`; require exit 0.
- [ ] Perform read-only desktop/tablet/mobile browser verification for all affected public routes and editor layout screens.
- [ ] Confirm no content, secret, route, permission, RLS, storage, or production-data regressions.
- [ ] Request code review, fix actionable findings test-first, rerun all gates, and complete the branch using `superpowers:finishing-a-development-branch`.
