# Existing Database Website Editor Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate the reviewed website CMS on the existing production Supabase project and verify that `special_admin`, `admin`, `doctor_admin`, and `website_editor` can manage website content without expanding website-editor access into clinic or administrative systems.

**Architecture:** Keep the already-published React editor and the existing Supabase project `ncysmppzfjtiekfnomdv`. Apply the six committed CMS migrations in order, verify database capability helpers and RLS, then validate the existing frontend route guards and the existing `admin-create-user` policy. No new database, data copy, public-content rewrite, or source-code redesign is required.

**Tech Stack:** React/Vite, Supabase PostgreSQL/RLS, Supabase Auth, Supabase Storage, Supabase Edge Functions, Vitest, Deno, GitHub Actions, GitHub Pages.

## Global Constraints

- Production target is exactly `ncysmppzfjtiekfnomdv`; stop if any connection resolves elsewhere.
- Do not use `nhjbqdiyptjqherdfbqk` for production.
- Do not commit, display, or place passwords, service-role keys, publishable keys, JWTs, or private `.env` files in the repository.
- Do not edit historical migrations; apply the committed migrations exactly as reviewed.
- Do not alter patients, appointments, consultations, payments, insurance, workforce records, existing public content, or production media during activation.
- `special_admin`, `admin`, `doctor_admin`, and `website_editor` are the only website-management roles.
- `website_editor` must remain excluded from clinic, staff-administration, patient, finance, workforce, and private-storage authorization helpers.
- Saving a draft must not change public content; only the explicit Publish action may do so.
- Google Analytics and Google Ads remain disabled until valid identifiers are intentionally entered, and all tracking remains consent-gated.
- Never claim completion until the database checks, role checks, frontend tests, build, security checks, and GitHub Actions gates have passed.

---

### Task 1: Establish the production target and backup boundary

**Files:**
- Read: `supabase/config.toml`
- Read: `.env.example`
- Read: `supabase/migrations/20260720111916_add_website_editor_role.sql`
- Read: `supabase/migrations/20260720115031_create_website_cms_foundation.sql`
- Read: `supabase/migrations/20260720225347_harden_website_cms_integration.sql`
- Read: `supabase/migrations/20260721035032_add_website_page_publishing.sql`
- Read: `supabase/migrations/20260721100403_switch_tracking_to_google.sql`
- Read: `supabase/migrations/20260721170000_create_general_website_page_rpc.sql`

**Interfaces:**
- Consumes: the approved production project reference and the committed migration files.
- Produces: a verified target, a migration pending-set, and an external database export location.

- [ ] **Step 1: Confirm the checkout and current main revision**

  Run from `C:\Users\ahmed\Documents\Codex\2026-07-13\i-n\work\klinikawfa-pr6`:

  ```powershell
  git status --short --branch
  git fetch origin main
  git rev-parse origin/main
  ```

  Expected: a clean checkout and the published main revision beginning with `b185053` or a newer reviewed descendant.

- [ ] **Step 2: Discover the installed Supabase command surface before using it**

  ```powershell
  supabase --version
  supabase link --help
  supabase migration list --help
  supabase db push --help
  ```

  Record the supported syntax in the task notes. Do not infer flags from an older CLI version.

- [ ] **Step 3: Link only to the existing production project**

  Use the supported link command with project reference `ncysmppzfjtiekfnomdv`. Supply the database password interactively or from an approved protected environment; do not save it in the repository.

  Expected: the CLI reports the linked project as `ncysmppzfjtiekfnomdv`.

- [ ] **Step 4: Capture the migration pending-set before any write**

  ```powershell
  supabase migration list --project-ref ncysmppzfjtiekfnomdv
  ```

  The only pending CMS versions expected from this plan are:

  ```text
  20260720111916
  20260720115031
  20260720225347
  20260721035032
  20260721100403
  20260721170000
  ```

  Stop for review if any unrelated pending migration appears or if any of these versions is already partially applied.

- [ ] **Step 5: Export the current production database outside the repository**

  Use the Supabase Dashboard export facility or the supported authenticated database-dump command discovered from the CLI help. Store the export in the existing protected Downloads/documents location, not under `C:\Users\ahmed\Documents\Codex\2026-07-13\i-n\work\klinikawfa-pr6`.

  Expected: the export exists, is readable by the operator, and is not tracked by Git.

- [ ] **Step 6: Run the read-only identity preflight**

  Execute this SQL through an authenticated SQL channel, never through the public browser client:

  ```sql
  select current_database() as database_name,
         current_setting('app.settings.project_ref', true) as configured_project_ref,
         to_regclass('public.user_roles') is not null as has_user_roles,
         to_regclass('public.clinic_services') is not null as has_clinic_services,
         to_regclass('public.website_pages') is not null as has_website_pages;
  ```

  Expected: the connected project is the previously used production database, `has_user_roles` and `has_clinic_services` are true, and `has_website_pages` is false before activation.

### Task 2: Validate the committed CMS migrations before applying them

**Files:**
- Read: `src/test/website-editor-role-migration.test.ts`
- Read: `src/test/website-cms-foundation-migration.test.ts`
- Read: `src/test/cms-foundation-integration-hardening.test.ts`
- Read: `src/test/website-page-publishing-migration.test.ts`
- Read: `src/test/google-tracking-migration.test.ts`
- Read: `src/test/general-page-creation-migration.test.ts`
- Read: `supabase/functions/admin-create-user/role-policy.ts`
- Read: `supabase/functions/admin-create-user/role-policy_test.ts`

**Interfaces:**
- Consumes: the six migration files and the existing role-policy tests.
- Produces: a green local migration-policy test set and an approved migration checksum list.

- [ ] **Step 1: Verify the capability role set in source**

  Confirm all of these exact role literals occur in both frontend and database capability definitions:

  ```text
  admin
  special_admin
  doctor_admin
  website_editor
  ```

  Confirm that `website_editor` does not occur in workforce or clinic authorization unions in `20260720225347_harden_website_cms_integration.sql`.

- [ ] **Step 2: Run the migration and role-policy regression tests**

  ```powershell
  npm test -- src/test/website-editor-role-migration.test.ts src/test/website-cms-foundation-migration.test.ts src/test/cms-foundation-integration-hardening.test.ts src/test/website-page-publishing-migration.test.ts src/test/google-tracking-migration.test.ts src/test/general-page-creation-migration.test.ts
  deno test supabase/functions/admin-create-user/role-policy_test.ts
  ```

  Expected: every selected test passes; no migration text is modified.

- [ ] **Step 3: Record migration checksums before applying**

  ```powershell
  Get-FileHash supabase/migrations/20260720111916_add_website_editor_role.sql,
    supabase/migrations/20260720115031_create_website_cms_foundation.sql,
    supabase/migrations/20260720225347_harden_website_cms_integration.sql,
    supabase/migrations/20260721035032_add_website_page_publishing.sql,
    supabase/migrations/20260721100403_switch_tracking_to_google.sql,
    supabase/migrations/20260721170000_create_general_website_page_rpc.sql -Algorithm SHA256
  ```

  Preserve the six hashes in the execution record so the applied SQL can be compared byte-for-byte with the reviewed source.

### Task 3: Apply the six CMS migrations to the existing database

**Files:**
- Apply unchanged: `supabase/migrations/20260720111916_add_website_editor_role.sql`
- Apply unchanged: `supabase/migrations/20260720115031_create_website_cms_foundation.sql`
- Apply unchanged: `supabase/migrations/20260720225347_harden_website_cms_integration.sql`
- Apply unchanged: `supabase/migrations/20260721035032_add_website_page_publishing.sql`
- Apply unchanged: `supabase/migrations/20260721100403_switch_tracking_to_google.sql`
- Apply unchanged: `supabase/migrations/20260721170000_create_general_website_page_rpc.sql`

**Interfaces:**
- Consumes: the clean migration pending-set, production export, and six verified hashes from Tasks 1–2.
- Produces: CMS tables, the website-editor enum value, RLS policies, storage boundary, publishing triggers/RPC, and Google tracking configuration in `ncysmppzfjtiekfnomdv`.

- [ ] **Step 1: Reconfirm the target immediately before writing**

  ```powershell
  supabase migration list --project-ref ncysmppzfjtiekfnomdv
  ```

  Confirm the same six pending versions and no extras. Abort if the list changed.

- [ ] **Step 2: Push only the reviewed migrations using the discovered CLI syntax**

  Use the CLI's supported `db push` form for project `ncysmppzfjtiekfnomdv`, with interactive confirmation disabled only if the command still prints the exact pending migration list before applying it.

  Expected: the command applies the six versions in timestamp order and exits zero. If any migration raises a preflight or postflight exception, stop and preserve the export; do not rerun blindly.

- [ ] **Step 3: Verify migration history**

  ```powershell
  supabase migration list --project-ref ncysmppzfjtiekfnomdv
  ```

  Expected: all six versions are marked applied exactly once and no unrelated version was added by this task.

### Task 4: Verify schema, RLS, storage, and capability boundaries

**Files:**
- Read: `supabase/migrations/20260720115031_create_website_cms_foundation.sql`
- Read: `supabase/migrations/20260720225347_harden_website_cms_integration.sql`
- Read: `supabase/migrations/20260721035032_add_website_page_publishing.sql`
- Read: `supabase/migrations/20260721100403_switch_tracking_to_google.sql`

**Interfaces:**
- Consumes: the applied production migrations.
- Produces: SQL evidence that all CMS objects exist with least-privilege grants and RLS.

- [ ] **Step 1: Verify tables, functions, trigger, and bucket**

  Execute this read-only query through the authenticated SQL channel:

  ```sql
  select table_name
  from information_schema.tables
  where table_schema = 'public'
    and table_name in (
      'website_pages', 'website_page_drafts', 'website_content_drafts',
      'website_content_versions', 'website_navigation_items',
      'website_navigation_drafts', 'website_review_presentations',
      'website_tracking_settings'
    )
  order by table_name;

  select routine_schema, routine_name
  from information_schema.routines
  where (routine_schema = 'private' and routine_name in (
           'can_manage_website', 'can_manage_tracking_settings',
           'publish_website_page_draft'
         ))
     or (routine_schema = 'public' and routine_name = 'create_general_website_page')
  order by routine_schema, routine_name;

  select id, name, public
  from storage.buckets
  where id = 'website-media';
  ```

  Expected: eight CMS tables, four expected routines, and a public `website-media` bucket with the configured file restrictions.

- [ ] **Step 2: Verify RLS is enabled and editor policies exist**

  ```sql
  select c.relname as table_name, c.relrowsecurity as rls_enabled
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname like 'website_%'
  order by c.relname;

  select schemaname, tablename, policyname, roles, cmd
  from pg_policies
  where (schemaname = 'public' and tablename like 'website_%')
     or (schemaname = 'storage' and tablename = 'objects'
         and policyname like 'Website managers%')
  order by schemaname, tablename, policyname;
  ```

  Expected: RLS is enabled for every CMS table; website-manager policies use `private.can_manage_website()`; tracking updates use `private.can_manage_tracking_settings()`; no policy grants `website_editor` clinic or workforce access.

- [ ] **Step 3: Run Supabase security advisors**

  Use the Supabase advisor tool for project `ncysmppzfjtiekfnomdv` with type `security`. Resolve any new CMS-related error before continuing. Existing unrelated warnings must be recorded, not silently suppressed.

### Task 5: Verify account provisioning and role isolation

**Files:**
- Read: `src/components/clinic/settings/UserManagementSettings.tsx`
- Read: `src/components/clinic/settings/AddUserDialog.tsx`
- Read: `supabase/functions/admin-create-user/index.ts`
- Read: `supabase/functions/admin-create-user/role-policy.ts`
- Read: `supabase/functions/admin-create-user/role-policy_test.ts`

**Interfaces:**
- Consumes: the applied `website_editor` enum and the committed provisioning policy.
- Produces: evidence that administrator tiers can create website-editor accounts and website editors cannot create accounts or enter clinic systems.

- [ ] **Step 1: Verify the live Edge Function source and JWT requirement**

  Compare the deployed `admin-create-user` function with the committed files. It must use the role policy containing `admin`, `special_admin`, and `doctor_admin` as caller tiers and `website_editor` as a creatable role. It must require a valid JWT.

  If the live function is older, deploy only this committed function to `ncysmppzfjtiekfnomdv` with JWT verification enabled, then read back the deployed version and test it. Do not deploy unrelated functions.

- [ ] **Step 2: Validate existing administrator access without changing roles**

  Sign in with an existing `admin`, `special_admin`, and `doctor_admin` account through the website. Confirm each can open `/editor` and see the editor navigation. Do not demote, promote, or change any existing account.

- [ ] **Step 3: Create the dedicated editor through the existing UI**

  From **Clinic → Settings → User Management**, use **Add Website Editor**. Enter the operator-provided editor email and a temporary password only in the UI. Do not place credentials in source, shell history, screenshots, or task notes.

  Expected: the account receives only `website_editor`, is redirected to `/editor` after login, and has no staff onboarding record.

- [ ] **Step 4: Verify role isolation**

  For the dedicated editor account, confirm:

  ```text
  /editor                 allowed
  /editor/home            allowed
  /editor/pages           allowed
  /editor/services        allowed
  /editor/team            allowed
  /editor/blog            allowed
  /editor/gallery         allowed
  /editor/reviews         allowed
  /editor/navigation      allowed
  /editor/analytics       allowed
  /clinic                 denied
  /staff/admin             denied
  ```

  Also verify through the authenticated Data API that the account cannot read or write patients, appointments, payments, workforce records, private documents, or clinic reviews.

### Task 6: Verify editor behavior without changing public content

**Files:**
- Read: `src/pages/editor/HomeEditor.tsx`
- Read: `src/pages/editor/PageEditor.tsx`
- Read: `src/features/website-cms/hooks/useWebsitePage.ts`
- Read: `src/features/website-cms/api/pages.ts`
- Read: `src/components/editor/EditorLayout.tsx`

**Interfaces:**
- Consumes: the live CMS tables and an authenticated website-manager session.
- Produces: evidence that draft, preview, media, revision, and publish boundaries behave as designed.

- [ ] **Step 1: Confirm public fallback before any publish**

  Open `https://klinikawfa.com` in an anonymous session and capture the current homepage content fingerprint. Confirm it is unchanged after CMS activation because no published CMS row has been created.

- [ ] **Step 2: Create a synthetic draft in the editor**

  Use a clearly synthetic, non-clinical draft value such as `CMS validation draft` in a new general page. Save the draft and confirm the public route does not expose it while its status remains `draft`.

- [ ] **Step 3: Verify the separate bottom preview**

  Confirm the live-preview section appears at the bottom of the editor page and renders the draft without submitting any appointment, login, payment, or clinic form.

- [ ] **Step 4: Verify media boundary**

  Upload one synthetic image to the `website-media` bucket under the permitted `pages` path. Confirm the editor role can list and remove only its website-media object. Remove the synthetic object after verification.

- [ ] **Step 5: Verify publish and revision conflict behavior**

  Publish the synthetic page, confirm it becomes publicly readable, then archive or remove the synthetic page through the approved editor flow. Attempt a stale revision update and confirm the database rejects it with the expected stale-draft error. Do not publish changes to the homepage or existing public content.

- [ ] **Step 6: Verify tracking remains disabled**

  Confirm `website_tracking_settings` has one `google_tag` row with `enabled = false`, no measurement ID, no Ads conversion ID, and no public tracking requests. Do not enter real analytics identifiers during this activation.

### Task 7: Run full validation and handoff

**Files:**
- Read: `.github/workflows/security-gate.yml`
- Read: `.github/workflows/deploy-pages.yml`
- Read: `docs/superpowers/specs/2026-07-21-existing-database-website-editor-activation-design.md`

**Interfaces:**
- Consumes: the verified production database and editor behavior.
- Produces: a final validation record and a clean handoff for publishing only after all gates pass.

- [ ] **Step 1: Run local application gates**

  ```powershell
  npm ci
  npm run lint:changed
  npx tsc --noEmit
  npm test
  npm run build
  npm run build:dev
  ```

  Expected: all commands exit zero. Existing non-failing chunk-size or router warnings may be recorded but must not hide failures.

- [ ] **Step 2: Run Edge Function and security checks**

  ```powershell
  deno test supabase/functions/_shared/secure-random_test.ts
  deno test --allow-net --allow-env supabase/functions/tests/ai.test.ts
  deno test supabase/functions/admin-create-user/role-policy_test.ts
  ```

  Run the production dependency audit through the GitHub Security Gate against the public npm registry; treat high or critical findings as blockers.

- [ ] **Step 3: Run the GitHub workflows**

  Push only the approved documentation/implementation changes required for this plan. Wait for both `Security Gate` and `Deploy GitHub Pages` to pass. Do not publish a new frontend bundle unless source changes were made and validated.

- [ ] **Step 4: Perform final read-only production checks**

  Verify `https://klinikawfa.com`, direct editor route protection, public service reads, current homepage background, and browser console behavior. Do not submit forms or perform additional database writes.

- [ ] **Step 5: Record completion and stop**

  Record the project reference, migration versions, backup location, role matrix, advisor result, workflow run URLs, and any warnings. Keep all secrets and database exports outside Git. Stop before enabling Google tracking or changing unrelated production data.

## Rollback Procedure

If activation fails, stop immediately and preserve the external database export and command output. Do not delete CMS tables or edit migration history. Review the failing migration and use a separately approved forward-only corrective migration. If a published synthetic page or media object exists, remove only that synthetic resource through the editor flow after confirming its exact ID/path. Existing clinic and public-content data is never part of rollback.
