# Dynamic Service SEO and AEO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every existing and newly created dynamic service page an immediately available bilingual SEO+AEO draft editor, safe AI generation, and published structured data.

**Architecture:** Keep `website_service_seo` as the single SEO/AEO registry and link dynamic entries to `clinic_services`. Create the registry row transactionally in the guarded landing-page RPC, invoke the authenticated AI Edge Function after the page save, and store the result in the existing revisioned draft system. Resolve editor and public metadata dynamically from database records while retaining the fixed canonical registry as a compatibility fallback.

**Tech Stack:** React, TypeScript, Zod, TanStack Query, Supabase Postgres/RLS/RPC, Supabase Edge Functions (Deno), Vitest, React Testing Library.

## Global Constraints

- AI-generated SEO and AEO must be saved as a draft and never auto-published.
- Malay and English content must be generated together.
- A generation failure must not roll back or block service-page creation.
- Published JSON-LD may contain only schema-validated, approved data.
- Generated medical content must not invent pricing, guarantees, outcomes, availability, accreditation, or suitability.
- Existing canonical service identifiers and published behavior must remain unchanged.
- Protected core service pages must remain undeletable server-side.
- Authorization must be enforced server-side; browser roles retain no direct mutation access to registry or presentation tables.

---

## File structure

- `src/features/website-cms/service-seo/domain.ts`: dynamic path, SEO+AEO payload, FAQ, and JSON-LD-safe domain schemas.
- `src/features/website-cms/service-seo/api.ts`: registry reads, editor loading, draft persistence, publish calls, and shared generation orchestration.
- `src/features/website-cms/service-seo/structuredData.ts`: convert a validated published payload into public FAQ and medical-service JSON-LD.
- `src/features/website-cms/service-seo/useServiceSeoMetadata.ts`: resolve published metadata for arbitrary service slugs.
- `src/features/website-cms/services/landingPageApi.ts`: return the created service/SEO identifiers and start non-blocking draft generation.
- `src/pages/editor/Services.tsx`: show `Edit SEO` for every dynamic row and report generation status.
- `src/pages/editor/LandingPageEditor.tsx`: trigger generation after first save without blocking navigation or later retries.
- `src/pages/editor/ServiceSeoEditor.tsx`: database-resolved dynamic target, AEO fields, generation retry, validation, save, and publish.
- `src/pages/ServiceDetail.tsx` and `src/pages/LocalServicePage.tsx`: emit approved structured data.
- `supabase/functions/generate-service-seo/validation.ts`: accept validated dynamic paths and strictly parse bilingual SEO+AEO output.
- `supabase/functions/generate-service-seo/index.ts`: prompt and return SEO+AEO without unsupported medical claims.
- A CLI-generated `supabase/migrations/*_dynamic_service_seo_aeo.sql`: registry link, backfill, guarded mutation updates, cleanup, grants, and indexes.
- Focused tests under `src/test/` and `supabase/functions/generate-service-seo/` cover each boundary.

### Task 1: Generalize the SEO+AEO domain

**Files:**
- Modify: `src/features/website-cms/service-seo/domain.ts`
- Create: `src/features/website-cms/service-seo/structuredData.ts`
- Modify: `src/test/service-seo-domain.test.ts`
- Create: `src/test/service-seo-structured-data.test.ts`

**Interfaces:**
- Produces: `ServiceSeoPath`, `serviceSeoPathSchema`, `ServiceAeoLanguage`, `ServiceSeoPayload`, `createEmptyServiceSeoPayload(path)`, `resolveServiceSeoPath(pathname)`, and `buildServiceStructuredData(record, language)`.
- `ServiceSeoPayload` adds `schemaVersion: 2`, `aeoMs`, and `aeoEn`; each AEO language contains `answerSummary` plus at most 12 `{ question, answer }` FAQ entries.

- [ ] **Step 1: Write failing domain tests** proving `/services/rawatan-telinga-microsuction-kuantan/` normalizes successfully, malformed/nested service paths fail, AEO entries enforce bounded non-empty strings, and empty payloads include version 2 AEO fields.
- [ ] **Step 2: Run `npm test -- --run src/test/service-seo-domain.test.ts src/test/service-seo-structured-data.test.ts`** and confirm failures identify the hardcoded path enum and missing structured-data builder.
- [ ] **Step 3: Replace the hardcoded-only payload path with a constrained schema** equivalent to `z.string().regex(/^\/services\/[a-z0-9]+(?:-[a-z0-9]+)*\/$/).max(120)`, retain the fixed target array only as a fallback registry, and define strict bilingual AEO schemas.
- [ ] **Step 4: Implement `buildServiceStructuredData`** to return sanitized `FAQPage` and `MedicalWebPage`/`Service` JSON-LD using only the canonical URL, approved labels, summary, and validated FAQ entries; return no FAQ object when there are no approved FAQs.
- [ ] **Step 5: Re-run the focused tests** and expect all to pass.
- [ ] **Step 6: Commit** with `git commit -m "feat: model dynamic service SEO and AEO"`.

### Task 2: Add the dynamic registry link and guarded lifecycle

**Files:**
- Create via `npx supabase migration new dynamic_service_seo_aeo`: the generated `supabase/migrations/*_dynamic_service_seo_aeo.sql`
- Modify: `src/test/service-seo-migration.test.ts`
- Modify: `src/test/service-seo-registry-sync.test.ts`
- Modify: `src/test/landing-page-mutations.test.tsx`

**Interfaces:**
- Produces database column `website_service_seo.service_id uuid references public.clinic_services(id) on delete cascade`, a unique partial index on non-null `service_id`, and RPC result `{ service_id uuid, seo_id uuid, created boolean }` from `save_clinic_landing_page`.
- `delete_clinic_landing_page(uuid)` deletes associated `website_content_drafts` before deleting the dynamic service; registry deletion follows the foreign-key cascade.

- [ ] **Step 1: Run `npx supabase --help`, `npx supabase migration --help`, and `npx supabase migration new dynamic_service_seo_aeo`** so the migration filename is generated by the installed CLI rather than invented.
- [ ] **Step 2: Write failing migration assertions** for the nullable FK, unique partial index, idempotent dynamic-page backfill, transactionally created registry row, explicit draft cleanup, server-side admin check, protected core slugs, `revoke all ... from public`, and authenticated-only execute grants.
- [ ] **Step 3: Run `npm test -- --run src/test/service-seo-migration.test.ts src/test/service-seo-registry-sync.test.ts src/test/landing-page-mutations.test.tsx`** and confirm the new assertions fail.
- [ ] **Step 4: Implement the migration** by linking dynamic rows, backfilling `clinic_services` paths as `/services/<slug>/`, preserving the three canonical aliases, extending published payloads with empty version-2 AEO fields, replacing the save RPC return type safely, and cleaning drafts on deletion.
- [ ] **Step 5: Keep RLS enabled and direct mutations revoked**; ensure any `security definer` function has `set search_path = pg_catalog`, checks `auth.uid()` plus `public.is_admin`, and has execute revoked from `PUBLIC`, `anon`, and `authenticated` before granting only the intended authenticated signature.
- [ ] **Step 6: Apply the migration to the local/test database or a disposable branch, then query** that every `clinic_services` row has exactly one registry row and that the microsuction page is present.
- [ ] **Step 7: Run the focused migration tests** and expect all to pass.
- [ ] **Step 8: Commit** with `git commit -m "feat: register SEO for dynamic service pages"`.

### Task 3: Extend and secure the AI generator

**Files:**
- Modify: `supabase/functions/generate-service-seo/validation.ts`
- Modify: `supabase/functions/generate-service-seo/index.ts`
- Create: `supabase/functions/generate-service-seo/validation.test.ts`
- Modify: `src/test/service-seo-editor.test.tsx`

**Interfaces:**
- Consumes: `ServiceSeoPath` semantics and the version-2 AEO contract from Task 1.
- Produces: `GeneratedServiceSeo` containing `ms`, `en`, `aeoMs`, and `aeoEn` with strict exact-key parsing.

- [ ] **Step 1: Write failing Deno validation tests** for a valid dynamic slug, nested/uppercase/oversized paths, unknown response keys, more than 12 FAQs, empty answers, and valid bilingual SEO+AEO output.
- [ ] **Step 2: Run `npx supabase functions serve --help` and the repository's Deno test command** (or `deno test supabase/functions/generate-service-seo/validation.test.ts`) and confirm failures.
- [ ] **Step 3: Replace `SERVICE_PATHS` membership with strict service-path syntax validation** and keep request length limits for titles and source content.
- [ ] **Step 4: Extend the prompt** to request exact JSON keys for both languages, direct answers, FAQs, local intent, and explicit prohibitions on invented prices, guarantees, outcomes, availability, accreditation, and patient suitability.
- [ ] **Step 5: Strictly parse and bound every returned field**; reject prose wrappers, unexpected keys, malformed JSON, duplicate/empty FAQ entries, or excessive arrays with a 502 provider-content error.
- [ ] **Step 6: Run generator validation and editor tests** and expect all to pass.
- [ ] **Step 7: Commit** with `git commit -m "feat: generate bilingual service SEO and AEO"`.

### Task 4: Make registry and generation APIs dynamic

**Files:**
- Modify: `src/features/website-cms/service-seo/api.ts`
- Modify: `src/features/website-cms/services/landingPageApi.ts`
- Modify: `src/test/service-seo-api.test.ts`
- Modify: `src/test/landing-page-mutations.test.tsx`

**Interfaces:**
- Produces: `LandingPageSaveResult { serviceId: string; seoId: string; created: boolean }`, `fetchServiceSeoTarget(id)`, and `generateAndSaveServiceSeoDraft(input): Promise<{ baseRevision: number }>`.
- Generation orchestration invokes `generate-service-seo`, merges output into a validated version-2 payload, and calls `saveServiceSeoDraft`; it never publishes.

- [ ] **Step 1: Write failing API tests** for mapping the structured RPC result, fetching a dynamic target by UUID, generating and saving a draft, preserving existing focus phrases, and leaving the page saved when generation rejects.
- [ ] **Step 2: Run `npm test -- --run src/test/service-seo-api.test.ts src/test/landing-page-mutations.test.tsx`** and confirm failures.
- [ ] **Step 3: Change `saveLandingPage` to return `LandingPageSaveResult`** and map/validate the RPC response instead of discarding it.
- [ ] **Step 4: Move Edge Function invocation out of `ServiceSeoEditor.tsx` into `generateAndSaveServiceSeoDraft`** so creation and retry use one validated implementation.
- [ ] **Step 5: Resolve editor targets from `website_service_seo` by ID** and use the dynamic `clinic_services` content as generator context when `service_id` is present; retain category/local fallbacks for fixed rows.
- [ ] **Step 6: Run focused API tests** and expect all to pass.
- [ ] **Step 7: Commit** with `git commit -m "feat: orchestrate dynamic service SEO drafts"`.

### Task 5: Update Website Editor creation and SEO/AEO editing

**Files:**
- Modify: `src/pages/editor/Services.tsx`
- Modify: `src/pages/editor/LandingPageEditor.tsx`
- Modify: `src/pages/editor/ServiceSeoEditor.tsx`
- Modify: `src/test/website-services-editor.test.tsx`
- Modify: `src/test/service-seo-editor.test.tsx`

**Interfaces:**
- Consumes: `LandingPageSaveResult`, `fetchServiceSeoTarget`, and `generateAndSaveServiceSeoDraft` from Task 4.
- Produces: immediate dynamic `Edit SEO` navigation and an editor covering SEO, direct-answer summaries, FAQs, draft/retry status, preview, and publish.

- [ ] **Step 1: Write failing UI tests** showing every dynamic row has `Edit SEO`, a new page navigates successfully even when AI fails, AI success saves but does not publish, retry works, FAQ add/remove honors 12 entries, and dynamic IDs load without the fixed target array.
- [ ] **Step 2: Run `npm test -- --run src/test/website-services-editor.test.tsx src/test/service-seo-editor.test.tsx`** and confirm failures.
- [ ] **Step 3: Render `Edit SEO` for dynamic rows using their registry UUID** returned/fetched with the service list.
- [ ] **Step 4: After first page save, trigger `generateAndSaveServiceSeoDraft` non-blockingly**; show success or warning feedback while keeping the service and editor usable.
- [ ] **Step 5: Replace the fixed-target guard in `ServiceSeoEditor` with asynchronous database target loading** and render bilingual answer-summary and FAQ controls with validation messages.
- [ ] **Step 6: Keep `Save draft` and `Publish` separate**; publish must first persist the validated draft and then invoke the existing revision-checked publish RPC.
- [ ] **Step 7: Run focused UI tests** and expect all to pass.
- [ ] **Step 8: Commit** with `git commit -m "feat: edit SEO and AEO for every service page"`.

### Task 6: Publish dynamic metadata and structured answers

**Files:**
- Modify: `src/features/website-cms/service-seo/useServiceSeoMetadata.ts`
- Modify: `src/pages/ServiceDetail.tsx`
- Modify: `src/pages/LocalServicePage.tsx`
- Modify: `src/test/service-seo-metadata.test.tsx`
- Modify: `src/test/service-seo-runtime.test.tsx`
- Modify: `src/test/local-service-pages.test.tsx`

**Interfaces:**
- Consumes: dynamic path resolution and `buildServiceStructuredData` from Task 1.
- Produces: public title/meta/social tags and JSON-LD from the currently published record only.

- [ ] **Step 1: Write failing runtime tests** for dynamic metadata fetch, Malay/English answer selection, approved FAQ JSON-LD, no draft leakage, no FAQ schema for empty FAQs, and fallback content when the registry request fails.
- [ ] **Step 2: Run `npm test -- --run src/test/service-seo-metadata.test.tsx src/test/service-seo-runtime.test.tsx src/test/local-service-pages.test.tsx`** and confirm failures.
- [ ] **Step 3: Allow `useServiceSeoMetadata` to query any valid normalized service path** and preserve aliases for fixed canonical pages.
- [ ] **Step 4: Render structured data through the existing safe SEO component/mechanism** from validated published payloads only; never inject editor drafts or raw generated HTML.
- [ ] **Step 5: Run focused runtime tests** and expect all to pass.
- [ ] **Step 6: Commit** with `git commit -m "feat: publish service AEO structured data"`.

### Task 7: End-to-end verification and deployment

**Files:**
- Modify if required by generated types: `src/integrations/supabase/types.ts`
- Verify: all files changed in Tasks 1-6

**Interfaces:**
- Produces: applied production migration, deployed `generate-service-seo`, pushed application build, and live smoke-test evidence.

- [ ] **Step 1: Regenerate or minimally update Supabase TypeScript types** so the new column and RPC result match runtime code, then run `npm run typecheck` if available or `npx tsc --noEmit`.
- [ ] **Step 2: Run focused tests** for domain, API, migration, generator, editor, metadata, landing-page mutations, and runtime pages.
- [ ] **Step 3: Run `npm test -- --run` with the repository's practical timeout and record any unrelated pre-existing failures separately.**
- [ ] **Step 4: Run `npm run build` and `git diff --check`**; both must pass.
- [ ] **Step 5: Run `npx supabase --version`, `npx supabase migration list --help`, and migration status checks** before applying the generated migration to project `nhjbqdiyptjqherdfbqk`.
- [ ] **Step 6: Apply the pending migration and query production** for one registry row per dynamic service, unique paths, linked service IDs, RLS enabled, direct table mutations revoked, and no orphan drafts.
- [ ] **Step 7: Run Supabase database advisors** using the supported CLI/MCP command and resolve any new security or performance findings caused by this migration.
- [ ] **Step 8: Deploy `generate-service-seo` with JWT verification enabled** and invoke it once as an authorized editor using a harmless dynamic service request; confirm a valid bilingual SEO+AEO response and no automatic publication.
- [ ] **Step 9: Commit any generated type or verification fixes** with `git commit -m "chore: verify dynamic service SEO deployment"`.
- [ ] **Step 10: Push the tested commits to `main`** only after confirming the diff contains no unrelated `.superpowers/brainstorm`, `deno.lock`, or `supabase/.temp` files.
- [ ] **Step 11: Smoke-test production** by creating a temporary dynamic service, confirming `Edit SEO`, reviewing the generated draft, publishing it, inspecting metadata and JSON-LD, then deleting the temporary page and confirming registry/draft cleanup.
- [ ] **Step 12: Report the deployed commit, migration, Edge Function version, focused/full test results, build result, and live smoke-test outcome.**

---

## Self-review record

- Spec coverage: creation, backfill, dynamic editor, bilingual generation, draft-only workflow, retry behavior, deletion cleanup, fixed-page compatibility, AEO summaries/FAQs/JSON-LD, authorization, validation, and deployment verification are each assigned to a task.
- Placeholder scan: no deferred implementation markers or unspecified error-handling steps remain. The migration filename is intentionally CLI-generated per current Supabase requirements.
- Type consistency: `LandingPageSaveResult`, `ServiceSeoPayload`, `GeneratedServiceSeo`, `fetchServiceSeoTarget`, `generateAndSaveServiceSeoDraft`, and `buildServiceStructuredData` are defined before their consumers.
