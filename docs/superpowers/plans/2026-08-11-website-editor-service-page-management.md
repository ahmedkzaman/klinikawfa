# Website Editor Service Page Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe creation and deletion of dynamic service landing pages to Website Editor → Services while protecting the three core service pages.

**Architecture:** Move landing-page persistence and dialogs into focused Website CMS modules shared by the legacy Landing Pages screen and Website Editor. Keep canonical SEO rows in the editor, append database landing pages, and enforce protected-slug deletion both in the UI and in the Supabase function.

**Tech Stack:** React 18, TypeScript, TanStack Query, React Hook Form, Zod, Supabase/PostgreSQL, Vitest, Testing Library.

## Global Constraints

- Protected slugs are exactly `rawatan-am`, `prosedur-minor`, and `pemeriksaan-kesihatan`.
- Dynamic landing-page slugs remain immutable after creation.
- Every deletion requires explicit confirmation and permanently removes the public URL.
- Uploaded media is not deleted when its landing page is deleted.
- Existing Website Editor and server-side authorization remain mandatory.

---

### Task 1: Shared landing-page domain and API

**Files:**
- Create: `src/features/website-cms/services/landingPageDomain.ts`
- Create: `src/features/website-cms/services/landingPageApi.ts`
- Modify: `src/features/website-cms/api/resources.ts`
- Test: `src/test/landing-page-domain.test.ts`

**Interfaces:**
- Produces: `PROTECTED_SERVICE_SLUGS`, `isProtectedServiceSlug(slug: string): boolean`, `landingPageFormSchema`, `LandingPageFormValues`, `saveLandingPage(values, id?)`, and `deleteLandingPage(id)`.
- Consumes: existing `save_clinic_landing_page` and `delete_clinic_landing_page` RPCs.

- [ ] **Step 1: Write failing domain tests**

Test that all three protected slugs return `true`, a dynamic slug returns `false`, valid dynamic form input parses, and malformed slugs fail.

- [ ] **Step 2: Run the domain test and verify RED**

Run: `npm.cmd test -- --run src/test/landing-page-domain.test.ts`
Expected: FAIL because the shared domain module does not exist.

- [ ] **Step 3: Implement the shared domain and API**

Use the existing slug expression `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`, preserve current field limits, sanitize blank media URLs to `null`, trim list items, and map Supabase errors without exposing credentials.

- [ ] **Step 4: Run the domain test and type check**

Run: `npm.cmd test -- --run src/test/landing-page-domain.test.ts && npm.cmd run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/features/website-cms/services src/features/website-cms/api/resources.ts src/test/landing-page-domain.test.ts
git commit -m "refactor: share landing page domain and api"
```

### Task 2: Shared create/edit and delete dialogs

**Files:**
- Create: `src/features/website-cms/services/LandingPageFormDialog.tsx`
- Create: `src/features/website-cms/services/DeleteLandingPageDialog.tsx`
- Create: `src/features/website-cms/services/useLandingPageMutations.ts`
- Modify: `src/pages/staff/admin/LandingPages.tsx`
- Test: `src/test/landing-page-mutations.test.tsx`

**Interfaces:**
- Produces: `LandingPageFormDialog`, `DeleteLandingPageDialog`, and `useLandingPageMutations()`.
- Consumes: Task 1 domain/API helpers.

- [ ] **Step 1: Extend the existing mutation test before refactoring**

Assert create calls `save_clinic_landing_page`, delete calls `delete_clinic_landing_page`, duplicate slugs preserve the open form and show the existing error, and successful mutations invalidate both `clinic-services-admin` and `website-editor-services` query keys.

- [ ] **Step 2: Run the mutation test and verify RED for dual invalidation**

Run: `npm.cmd test -- --run src/test/landing-page-mutations.test.tsx`
Expected: FAIL because only the legacy query key is invalidated.

- [ ] **Step 3: Extract the shared components and hook**

Move the current form fields, uploads, rich text editor, preview, confirmation text, mutation state, and toast mapping without changing user-visible behavior. Replace the legacy page’s inline implementation with the shared components.

- [ ] **Step 4: Run the mutation regression test**

Run: `npm.cmd test -- --run src/test/landing-page-mutations.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/features/website-cms/services src/pages/staff/admin/LandingPages.tsx src/test/landing-page-mutations.test.tsx
git commit -m "refactor: share landing page management dialogs"
```

### Task 3: Website Editor create and delete controls

**Files:**
- Modify: `src/pages/editor/Services.tsx`
- Modify: `src/test/website-services-editor.test.tsx`

**Interfaces:**
- Consumes: Task 1 `isProtectedServiceSlug` and Task 2 shared dialogs/mutations.
- Produces: Website Editor create/delete workflow.

- [ ] **Step 1: Write failing editor behavior tests**

Assert **Create service page** is visible, opening it renders the shared form, the dynamic microsuction row exposes Delete, and the protected core rows do not expose Delete. Confirm a successful create/delete triggers a refreshed list.

- [ ] **Step 2: Run the editor test and verify RED**

Run: `npm.cmd test -- --run src/test/website-services-editor.test.tsx`
Expected: FAIL because create and delete controls are absent.

- [ ] **Step 3: Implement the controls**

Add create-dialog state to the Services header. Add delete controls only to dynamic rows where `isProtectedServiceSlug(item.slug)` is false. Pass the selected record into the shared confirmation dialog and refresh through the shared query invalidation.

- [ ] **Step 4: Run the editor and legacy tests**

Run: `npm.cmd test -- --run src/test/website-services-editor.test.tsx src/test/landing-page-mutations.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/pages/editor/Services.tsx src/test/website-services-editor.test.tsx
git commit -m "feat: manage landing pages in website editor"
```

### Task 4: Database protection for core services

**Files:**
- Create through Supabase CLI: `supabase/migrations/<timestamp>_protect_core_landing_pages.sql`
- Create: `supabase/tests/protect_core_landing_pages.sql`

**Interfaces:**
- Replaces: `public.delete_clinic_landing_page(uuid)` while preserving its signature and grants.
- Produces: server-side protected-slug rejection.

- [ ] **Step 1: Create the migration through the CLI**

Run: `npx.cmd supabase migration new protect_core_landing_pages`
Expected: a timestamped migration file.

- [ ] **Step 2: Write the failing PostgreSQL contract test**

The test creates a dynamic fixture and confirms authorized deletion removes it. It then invokes the function for each protected slug and expects a stable `PROTECTED_SERVICE_PAGE` exception without deleting the row.

- [ ] **Step 3: Run the PostgreSQL test and verify RED**

Run the repository’s existing PostgreSQL contract-test command discovered from `.github/workflows/security-gate.yml`.
Expected: FAIL because the current function permits protected deletion.

- [ ] **Step 4: Implement server-side protection**

Lock and load the target row, reject the three protected slugs with `raise exception 'PROTECTED_SERVICE_PAGE' using errcode = '42501'`, retain the existing authorization check, delete only after both checks, and preserve revoke/grant/owner statements.

- [ ] **Step 5: Verify the contract test and database advisors**

Run the PostgreSQL contract suite, then `npx.cmd supabase db advisors` when supported by the installed CLI.
Expected: tests PASS and no new security or performance advisories caused by the function.

- [ ] **Step 6: Commit**

```powershell
git add supabase/migrations supabase/tests/protect_core_landing_pages.sql
git commit -m "fix: protect core service pages from deletion"
```

### Task 5: Full verification and deployment

**Files:**
- Verify only; no expected source changes.

**Interfaces:**
- Consumes all previous tasks.
- Produces a validated production deployment.

- [ ] **Step 1: Run focused tests**

Run: `npm.cmd test -- --run src/test/landing-page-domain.test.ts src/test/landing-page-mutations.test.tsx src/test/website-services-editor.test.tsx src/test/website-resource-schemas.test.ts`
Expected: all tests PASS.

- [ ] **Step 2: Run lint, type check, and build**

Run ESLint on changed TypeScript/TSX files, `npm.cmd run typecheck`, and `npm.cmd run build`.
Expected: exit code 0 for each.

- [ ] **Step 3: Inspect scope and whitespace**

Run: `git status --short`, `git diff --check`, and `git diff --stat HEAD~4..HEAD`.
Expected: only planned files plus existing unrelated untracked files; no whitespace errors.

- [ ] **Step 4: Apply the pending Supabase migration**

Use the linked production project and the repository’s established Supabase CLI workflow. Confirm the remote migration list records the new migration.

- [ ] **Step 5: Push to `main` and monitor deployment**

Push the validated commit range to `origin/main`; monitor Security Gate and Deploy GitHub Pages to successful completion.

- [ ] **Step 6: Perform live smoke checks**

Confirm `/editor/services` returns HTTP 200, an authorized editor can open Create, protected rows have no Delete action, a temporary dynamic page can be created and deleted, and both administration screens synchronize after each action.
