# Service Page SEO Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give authorized website editors safe bilingual SEO drafting, AI generation, previewing, publication, and live metadata control for all eight canonical service pages.

**Architecture:** Add a public read-only published SEO registry keyed by canonical service path, while reusing the existing private CMS draft/version/publish lifecycle for writes. A shared resolver merges published metadata with the current page-derived fallback, and both dynamic category pages and local landing pages consume that resolver. A protected Edge Function generates reviewable bilingual suggestions but never writes or publishes them.

**Tech Stack:** React 18, TypeScript, Zod, TanStack Query, React Helmet Async, Supabase Postgres/RLS/RPC, Supabase Edge Functions (Deno), Vitest, GitHub Pages prerendering.

## Global Constraints

- Cover exactly the eight canonical service paths listed in the approved design.
- Category aliases inherit their category SEO and remain excluded from the sitemap.
- Malay is the default crawler-facing language; English metadata follows the existing English UI mode.
- Canonical URLs are derived from the registry path and cannot be redirected by editors.
- AI generation populates a draft only and never saves or publishes.
- Existing automatic metadata remains the runtime fallback.
- Static GitHub Pages metadata reads the published registry during build and refreshes hourly, with checked-in fallbacks on fetch failure.
- Public roles receive published read access only; all writes use existing website-manager authorization.
- Explicitly grant Data API access because new Supabase tables are no longer assumed to be auto-exposed.
- No patient data, secrets, or OpenAI response bodies are logged.

---

### Task 1: Define the canonical service SEO domain

**Files:**
- Create: `src/features/website-cms/service-seo/domain.ts`
- Modify: `src/features/website-cms/resources/types.ts`
- Modify: `src/features/website-cms/resources/schemas.ts`
- Modify: `src/features/website-cms/resources/registry.ts`
- Modify: `src/features/website-cms/resources/jsonSchemas.ts`
- Create: `src/test/service-seo-domain.test.ts`

**Interfaces:**
- Produces: `CANONICAL_SERVICE_SEO_TARGETS`, `ServiceSeoPayload`, `serviceSeoPayloadSchema`, `resolveServiceSeoPath(pathname)`.
- Consumes: existing `seoFieldsSchema`, `emptySeoFields`, and service alias mapping.

- [ ] **Step 1: Write the failing domain tests**

Test literal expectations for the eight canonical paths, alias consolidation, same-origin canonical derivation, bilingual payload validation, and rejection of unknown fields:

```ts
expect(CANONICAL_SERVICE_SEO_TARGETS.map((target) => target.path)).toEqual([
  "/services/rawatan-umum/",
  "/services/prosedur-kecil/",
  "/services/pemeriksaan-kesihatan/",
  "/services/rawatan-telinga-kuantan/",
  "/services/minor-surgery-kutil-kuantan/",
  "/services/swab-test-demam-kuantan/",
  "/services/pengurusan-berat-badan-kuantan/",
  "/services/sunat-kuantan/",
]);
expect(resolveServiceSeoPath("/services/khatan")).toBe("/services/prosedur-kecil/");
expect(resolveServiceSeoPath("/services/sunat-kuantan/")).toBe("/services/sunat-kuantan/");
```

- [ ] **Step 2: Run the domain test and verify RED**

Run: `npm test -- --run src/test/service-seo-domain.test.ts`  
Expected: FAIL because the service SEO domain module does not exist.

- [ ] **Step 3: Implement the canonical registry and payload schema**

Use a readonly target array containing `path`, `labelMs`, `labelEn`, and `sourceKind`. Define a strict payload:

```ts
export const serviceSeoPayloadSchema = z.object({
  path: z.enum(CANONICAL_SERVICE_SEO_PATHS),
  focusPhraseMs: z.string().trim().max(160),
  focusPhraseEn: z.string().trim().max(160),
  seoMs: seoFieldsSchema.omit({ canonicalUrl: true }).extend({ canonicalUrl: z.literal("") }),
  seoEn: seoFieldsSchema.omit({ canonicalUrl: true }).extend({ canonicalUrl: z.literal("") }),
}).strict();
```

Normalize trailing slashes and resolve category aliases before matching a target.

Add `service_seo` to `WEBSITE_RESOURCE_TYPES`, register `serviceSeoDraftSchema` in both the Zod and JSON-schema registries, and export its inferred type. This keeps the generic draft save/parse path type-safe instead of bypassing it with casts.

- [ ] **Step 4: Run the domain test and verify GREEN**

Run: `npm test -- --run src/test/service-seo-domain.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit the domain contract**

```powershell
git add src/features/website-cms/service-seo/domain.ts src/features/website-cms/resources src/test/service-seo-domain.test.ts
git commit -m "feat: define canonical service SEO targets"
```

### Task 2: Add the published SEO registry and secured publication lifecycle

**Files:**
- Create through CLI: the file printed by `npx.cmd supabase migration new add_service_seo_registry`
- Create: `src/test/service-seo-migration.test.ts`

**Interfaces:**
- Produces: `public.website_service_seo`, `public.publish_service_seo(uuid, integer)`, and eight seeded rows.
- Consumes: `private.can_manage_website()`, `private.website_seo_payload_is_valid(jsonb)`, `website_content_drafts`, `website_content_versions`, `website_content_audit`, and `website_media`.

- [ ] **Step 1: Write the failing migration contract test**

Assert the migration contains:

```ts
expect(sql).toContain("create table public.website_service_seo");
expect(sql).toContain("enable row level security");
expect(sql).toContain("grant select on table public.website_service_seo to anon, authenticated");
expect(sql).toContain("revoke insert, update, delete on table public.website_service_seo from anon, authenticated");
expect(sql).toContain("private.can_manage_website()");
expect(sql).toContain("stale website resource revision");
expect(sql).toContain("/services/sunat-kuantan/");
```

Also assert direct write policies are absent and the publication function revokes `PUBLIC` execution before granting only `authenticated`.

- [ ] **Step 2: Run the migration test and verify RED**

Run: `npm test -- --run src/test/service-seo-migration.test.ts`  
Expected: FAIL because no matching migration exists.

- [ ] **Step 3: Generate the migration with the Supabase CLI**

Run:

```powershell
npx.cmd supabase migration new add_service_seo_registry
```

Use the exact generated path reported by the CLI for the remaining Task 2 steps.

- [ ] **Step 4: Implement table, RLS, explicit grants, and seeds**

Create a table with:

```sql
id uuid primary key default gen_random_uuid(),
path text not null unique check (path ~ '^/services/[a-z0-9-]+/$'),
label_ms text not null,
label_en text not null,
source_kind text not null check (source_kind in ('category','local_landing')),
focus_phrase_ms text not null default '',
focus_phrase_en text not null default '',
seo_ms jsonb not null default '{}'::jsonb check (jsonb_typeof(seo_ms) = 'object'),
seo_en jsonb not null default '{}'::jsonb check (jsonb_typeof(seo_en) = 'object'),
seo_ms_social_image_path text,
seo_en_social_image_path text,
website_revision integer not null default 0 check (website_revision >= 0),
published_at timestamptz,
published_by uuid references auth.users(id),
created_at timestamptz not null default now(),
updated_at timestamptz not null default now()
```

Enable RLS, add an unrestricted select policy for published rows, explicitly grant `SELECT` to `anon, authenticated`, and explicitly revoke direct writes. Seed the eight literal rows idempotently with `ON CONFLICT (path) DO UPDATE` limited to labels/source kind.

- [ ] **Step 5: Implement guarded publication**

Add `public.publish_service_seo(p_resource_id uuid, p_expected_revision integer) returns jsonb` as a tightly scoped `SECURITY DEFINER` function with `SET search_path = pg_catalog`. It must:

1. require `auth.uid()` and `private.can_manage_website()`;
2. lock the registry and matching `website_content_drafts` row where `resource_type='service_seo'`;
3. reject stale revisions;
4. validate exact payload keys and both SEO objects with `private.website_seo_payload_is_valid`;
5. reject a draft path that differs from the immutable registry path;
6. resolve selected media IDs to non-trashed public storage paths;
7. update the published row and increment revision atomically;
8. insert a version and audit record;
9. delete the draft;
10. keep only the latest 20 versions.

Revoke execute from `PUBLIC, anon` and grant execute only to `authenticated`.

- [ ] **Step 6: Extend existing CMS check constraints safely**

Recreate the `resource_type` checks on `website_content_drafts`, `website_content_versions`, `website_content_lifecycle`, `website_media_references`, and `website_content_audit` to include `service_seo`. Use named constraint discovery from `pg_constraint` where legacy names may vary; do not weaken other accepted values.

- [ ] **Step 7: Run the migration contract and local database tests**

Run:

```powershell
npm test -- --run src/test/service-seo-migration.test.ts
```

Expected: PASS.

- [ ] **Step 8: Run the migration contract with a real local PostgreSQL runtime**

Run the same test again with `REQUIRE_POSTGRES_TEST=1` and `POSTGRES_BIN` pointing to the installed PostgreSQL binary, matching the Security Gate contract-test pattern. Expected: PASS against a temporary real database. Production type generation remains in Task 8 after the reviewed migration is applied.

- [ ] **Step 9: Commit the database contract**

```powershell
git add supabase/migrations src/test/service-seo-migration.test.ts
git commit -m "feat: add service SEO publishing registry"
```

### Task 3: Add service SEO API and runtime resolver

**Files:**
- Create: `src/features/website-cms/service-seo/api.ts`
- Create: `src/features/website-cms/service-seo/useServiceSeoMetadata.ts`
- Create: `src/test/service-seo-api.test.ts`
- Create: `src/test/service-seo-metadata.test.tsx`

**Interfaces:**
- Produces: `listServiceSeoTargets()`, `fetchServiceSeoDraft(id)`, `saveServiceSeoDraft(input)`, `publishServiceSeo(id, revision)`, `useServiceSeoMetadata(path, language, fallback)`.
- Consumes: Task 1 schemas and Task 2 table/RPC.

- [ ] **Step 1: Write failing API and resolver tests**

Verify published reads select by canonical path, drafts are parsed strictly, publication calls `publish_service_seo`, Malay is the default, English falls back to Malay, and query errors preserve supplied metadata:

```ts
expect(result.current).toMatchObject({
  title: "Rawatan Telinga Kuantan",
  canonicalUrl: "https://klinikawfa.com/services/rawatan-telinga-kuantan/",
  noIndex: false,
  noFollow: false,
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- --run src/test/service-seo-api.test.ts src/test/service-seo-metadata.test.tsx`  
Expected: FAIL because API/resolver modules do not exist.

- [ ] **Step 3: Implement API functions**

Use the existing Supabase client and existing `saveResourceDraft` mechanism with `resourceType: "service_seo"`. Do not directly update `website_service_seo`. Convert database snake_case rows to the Task 1 domain contract at the boundary.

- [ ] **Step 4: Implement the resolver hook**

Use TanStack Query with key `['service-seo', canonicalPath]`, a stable stale time, and a merge function that returns:

```ts
type ResolvedServiceSeo = {
  title: string;
  description: string;
  socialTitle: string;
  socialDescription: string;
  image?: string;
  canonicalUrl: string;
  noIndex: boolean;
  noFollow: boolean;
};
```

An empty or failed custom record must return the provided fallback. Resolve media paths through the existing public website-media URL helper.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `npm test -- --run src/test/service-seo-api.test.ts src/test/service-seo-metadata.test.tsx`  
Expected: PASS.

- [ ] **Step 6: Commit the API and resolver**

```powershell
git add src/features/website-cms/service-seo src/test/service-seo-api.test.ts src/test/service-seo-metadata.test.tsx
git commit -m "feat: resolve published service SEO"
```

### Task 4: Build the eight-page SEO editor

**Files:**
- Create: `src/pages/editor/ServiceSeoEditor.tsx`
- Modify: `src/pages/editor/Services.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/editor/seo/SeoPanel.tsx`
- Create: `src/test/service-seo-editor.test.tsx`
- Modify: `src/test/website-services-editor.test.tsx`

**Interfaces:**
- Produces: route `/editor/services/seo/:id` and a reusable SEO panel with locked canonical display and AI action slot.
- Consumes: Task 3 API and existing `GoogleSearchPreview`, `SocialPreview`, `MediaSelectorDialog`, dirty-navigation guard, and save/publish buttons.

- [ ] **Step 1: Write failing editor tests**

Test that the list shows eight canonical targets, category pages retain **Edit content**, every row has **Edit SEO**, the canonical field is read-only, Save Draft and Publish SEO call different APIs, language tabs preserve independent values, and an AI error preserves typed form values.

- [ ] **Step 2: Run editor tests and verify RED**

Run: `npm test -- --run src/test/service-seo-editor.test.tsx src/test/website-services-editor.test.tsx`  
Expected: FAIL because the SEO editor does not exist and the list contains only three rows.

- [ ] **Step 3: Make `SeoPanel` safely reusable**

Add optional props:

```ts
canonicalUrl?: string;
canonicalReadOnly?: boolean;
headerAction?: React.ReactNode;
```

When read-only, display the derived canonical URL without writing it into the editable SEO JSON. Preserve existing blog editor behavior when these props are omitted.

- [ ] **Step 4: Implement the SEO editor page**

Use Malay/English tabs, focus phrase inputs, the shared panel, dirty-state protection, Save Draft, Publish SEO, notices, loading/error states, and AI generation. Publishing must first save the validated draft at the current base revision, then call `publish_service_seo` with the returned revision.

- [ ] **Step 5: Expand the services editor list and route**

Merge the three content resources with the eight SEO registry targets by canonical path. Category rows link to both content and SEO editors; local landing rows link only to SEO. Add:

```tsx
<Route path="services/seo/:id" element={<ServiceSeoEditor />} />
```

before the generic `services/:id` editor route.

- [ ] **Step 6: Run editor tests and verify GREEN**

Run: `npm test -- --run src/test/service-seo-editor.test.tsx src/test/website-services-editor.test.tsx src/test/editor-seo.test.tsx`  
Expected: PASS, including existing blog SEO behavior.

- [ ] **Step 7: Commit the editor**

```powershell
git add src/pages/editor/ServiceSeoEditor.tsx src/pages/editor/Services.tsx src/App.tsx src/components/editor/seo/SeoPanel.tsx src/test
git commit -m "feat: add service SEO editor"
```

### Task 5: Add authorized AI SEO generation

**Files:**
- Create: `supabase/functions/generate-service-seo/index.ts`
- Modify: `supabase/functions/_shared/auth-helpers.ts`
- Modify: `supabase/config.toml`
- Modify: `supabase/functions/tests/ai.test.ts`
- Create: `supabase/functions/tests/service-seo.test.ts`

**Interfaces:**
- Produces: JWT-protected `generate-service-seo` Edge Function.
- Consumes: the existing OpenAI secret, `withAuth`, and `ServiceSeoEditor` request/response contract.

- [ ] **Step 1: Write failing authorization and response-validation tests**

Add a `website_manager` role label mapping to exactly `admin`, `special_admin`, `doctor_admin`, and `website_editor`. Test missing JWT → 401, unauthorized role → 403, incomplete input → 400, malformed provider response → 502, and valid bilingual JSON → 200.

- [ ] **Step 2: Run Deno tests and verify RED**

Run:

```powershell
deno test --allow-env --allow-net supabase/functions/tests/ai.test.ts supabase/functions/tests/service-seo.test.ts
```

Expected: FAIL because `website_manager` and the new function do not exist.

- [ ] **Step 3: Extend the shared role helper**

Change `RoleLabel` and `LABEL_TO_ROLES`:

```ts
export type RoleLabel = "clinical" | "ops" | "admin" | "special_admin" | "website_manager";
website_manager: ["admin", "special_admin", "doctor_admin", "website_editor"],
```

Keep current mappings unchanged.

- [ ] **Step 4: Implement the Edge Function**

Use `withAuth` with `allowedRoles: ['website_manager']`, a 48 KiB body limit, and strict input checks. Send only public website copy and clinic/location context to OpenAI. Request JSON with:

```ts
type GeneratedServiceSeo = {
  ms: { title: string; description: string; socialTitle: string; socialDescription: string };
  en: { title: string; description: string; socialTitle: string; socialDescription: string };
};
```

Validate non-empty fields and maximum stored lengths before returning. Use `OPENAI_SEO_MODEL` with fallback `gpt-4o-mini`. Never save data or log provider content.

- [ ] **Step 5: Register JWT verification**

Add:

```toml
[functions.generate-service-seo]
verify_jwt = true
```

- [ ] **Step 6: Run Deno tests and verify GREEN**

Run the Step 2 command.  
Expected: PASS.

- [ ] **Step 7: Connect the editor AI button**

Invoke `generate-service-seo` with current content and focus phrases. Parse the response before updating both language drafts. On error, show a safe notice and leave state unchanged.

- [ ] **Step 8: Commit AI generation**

```powershell
git add supabase/functions supabase/config.toml src/pages/editor/ServiceSeoEditor.tsx
git commit -m "feat: generate bilingual service SEO"
```

### Task 6: Apply published SEO to every canonical page

**Files:**
- Modify: `src/pages/ServiceDetail.tsx`
- Modify: `src/pages/LocalServicePage.tsx`
- Modify: `src/components/seo/SEOHead.tsx` only if the resolver exposes a missing robots/image input
- Modify: `src/test/service-detail-schema.test.tsx`
- Modify: `src/test/local-service-pages.test.tsx`
- Create: `src/test/service-seo-runtime.test.tsx`

**Interfaces:**
- Consumes: `useServiceSeoMetadata` from Task 3.
- Produces: matching `<title>`, description, robots, canonical, social tags, and JSON-LD descriptions.

- [ ] **Step 1: Write failing runtime tests**

For a category and a local landing page, assert custom metadata overrides the fallback, `noIndex/noFollow` reach the robots tag, social fields reach Open Graph/Twitter, and WebPage/Service schemas use the resolved description. Add a rejected-query case that preserves current metadata.

- [ ] **Step 2: Run runtime tests and verify RED**

Run: `npm test -- --run src/test/service-seo-runtime.test.tsx src/test/service-detail-schema.test.tsx src/test/local-service-pages.test.tsx`  
Expected: FAIL because pages do not query the SEO registry.

- [ ] **Step 3: Integrate the shared resolver**

Build current automatic title/description/hero image first, call the resolver with the canonical path, then pass one resolved object to `SEOHead` and schema builders. Do not block visible page content while SEO loads; server/prerender waits for settled queries using the existing prerender pipeline.

- [ ] **Step 4: Run runtime tests and verify GREEN**

Run the Step 2 command.  
Expected: PASS.

- [ ] **Step 5: Commit runtime metadata**

```powershell
git add src/pages/ServiceDetail.tsx src/pages/LocalServicePage.tsx src/components/seo/SEOHead.tsx src/test
git commit -m "feat: publish service SEO metadata"
```

### Task 7: Complete sitemap and prerender coverage

**Files:**
- Modify: `public/sitemap.xml`
- Modify: `scripts/prepare-public-seo-pages.mjs`
- Modify: `.github/workflows/deploy-pages.yml`
- Modify: `src/test/seo-static-files.test.ts`
- Modify: `src/test/github-pages-hosting.test.ts`
- Create: `src/test/service-seo-registry-sync.test.ts`

**Interfaces:**
- Consumes: `CANONICAL_SERVICE_SEO_TARGETS` from Task 1.
- Produces: sitemap/prerender parity for all eight canonical paths.

- [ ] **Step 1: Write failing parity tests**

Assert each canonical target appears exactly once in the sitemap, no alias appears, and the Pages workflow creates an HTML file for every target. Assert trailing-slash canonical output for category and local pages. Add fixture tests proving the preparation script prefers published registry metadata, honors `index/follow`, and falls back to checked-in defaults when registry loading fails.

- [ ] **Step 2: Run parity tests and verify RED**

Run: `npm test -- --run src/test/service-seo-registry-sync.test.ts src/test/seo-static-files.test.ts src/test/github-pages-hosting.test.ts`  
Expected: FAIL because the three category pages are missing from the sitemap/Pages contract and the preparation script is hard-coded.

- [ ] **Step 3: Update sitemap and prerender routes**

Add the three missing category canonicals with `changefreq=monthly` and `priority=0.9`. Keep aliases excluded. Refactor `scripts/prepare-public-seo-pages.mjs` so it:

1. keeps checked-in fallback metadata for all eight canonical paths;
2. accepts `SERVICE_SEO_REGISTRY_JSON` for deterministic tests;
3. otherwise fetches `path,seo_ms,seo_ms_social_image_path` from the public `website_service_seo` REST endpoint using `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`;
4. validates returned paths against the maintained canonical list;
5. merges non-empty published Malay values over fallbacks;
6. emits index/follow or noindex/nofollow from the published flags;
7. continues with fallbacks and a safe warning if the public read fails.

Extend `.github/workflows/deploy-pages.yml` with `schedule: [{ cron: '17 * * * *' }]`, allow the scheduled event in the job condition, and pass the existing public Supabase build environment to the preparation script. The job must still verify the latest `main` commit passed Security Gate before deploying.

- [ ] **Step 4: Run parity tests and build**

Run:

```powershell
npm test -- --run src/test/service-seo-registry-sync.test.ts src/test/seo-static-files.test.ts src/test/github-pages-hosting.test.ts
npm run build
```

Expected: PASS; built HTML for every canonical service path contains a self-referencing canonical.

- [ ] **Step 5: Commit sitemap and prerender coverage**

```powershell
git add public/sitemap.xml scripts src/test
git commit -m "seo: cover all canonical service pages"
```

### Task 8: Apply Supabase changes, deploy, and verify production

**Files:**
- Modify: `src/integrations/supabase/types.ts` using generated production types
- No additional source files unless verification exposes a concrete defect.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: production database objects, deployed Edge Function, GitHub Pages release, and verification evidence.

- [ ] **Step 1: Run pre-deployment verification**

Run:

```powershell
git diff --check
npm test -- --run src/test/service-seo-domain.test.ts src/test/service-seo-migration.test.ts src/test/service-seo-api.test.ts src/test/service-seo-metadata.test.tsx src/test/service-seo-editor.test.tsx src/test/service-seo-runtime.test.tsx src/test/service-seo-registry-sync.test.ts src/test/seo-static-files.test.ts src/test/github-pages-hosting.test.ts
npm run build
deno test --allow-env --allow-net supabase/functions/tests/ai.test.ts supabase/functions/tests/service-seo.test.ts
```

Expected: all commands exit 0.

- [ ] **Step 2: Review production migration state and advisors**

Use the connected Supabase project `nhjbqdiyptjqherdfbqk` to list migrations and fetch security/performance advisors. Record existing notices so only new findings caused by this change block deployment.

- [ ] **Step 3: Apply the migration once**

Apply the exact reviewed migration to `nhjbqdiyptjqherdfbqk` using the connected Supabase migration tool. Verify with read-only SQL that there are eight rows, RLS is enabled, grants are read-only, and anonymous select succeeds.

- [ ] **Step 4: Generate and install production TypeScript types**

Generate types from `nhjbqdiyptjqherdfbqk`, replace `src/integrations/supabase/types.ts`, then run typecheck and the focused tests again.

- [ ] **Step 5: Deploy the Edge Function**

Deploy `generate-service-seo` with JWT verification enabled and all relative dependencies. Invoke it without a token and verify HTTP 401; use an authorized editor session only for a safe smoke test that returns suggestions without writing any row.

- [ ] **Step 6: Re-run database advisors and smoke queries**

Confirm no new security or performance advisor finding. Query all eight published paths and verify revision 0 fallback records exist before editors publish custom SEO.

- [ ] **Step 7: Commit generated types and final adjustments**

```powershell
git add src/integrations/supabase/types.ts
git commit -m "chore: refresh service SEO database types"
```

- [ ] **Step 8: Push the reviewed commits to `main`**

Fetch `origin/main`, require a fast-forward relationship, and push the current detached HEAD with:

```powershell
git push origin HEAD:main
```

- [ ] **Step 9: Monitor GitHub Security Gate and Pages deployment**

Use `gh run list` and `gh run view` until both workflows for the pushed commit complete successfully. A failed gate blocks completion.

- [ ] **Step 10: Verify all eight live URLs**

For each canonical URL, verify:

- HTTP 200;
- one title and one meta description;
- index/follow default;
- self-referencing trailing-slash canonical;
- matching Open Graph URL;
- WebPage and Service JSON-LD use the same description;
- no alias appears in the sitemap.

- [ ] **Step 11: Verify the editor workflow**

Open `/editor/services`, confirm eight SEO rows, open one SEO editor, generate suggestions, save a draft, confirm the public row is unchanged, then discard or publish only a deliberately reviewed smoke-test payload. Do not leave test copy live.

- [ ] **Step 12: Report completion evidence**

Report the deployed commit, migration name, Edge Function version, test counts, GitHub workflow links, advisor status, and live URL verification. Mention that separate indexable English URLs remain outside this release.
