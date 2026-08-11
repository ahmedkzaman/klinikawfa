# Bilingual Service AEO Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated editor button that generates and privately saves Malay and English AEO while preserving all SEO fields.

**Architecture:** Extend the existing authenticated `generate-service-seo` function with an explicit `mode: "aeo"` request and a strict bilingual AEO response. Add an AEO-only client merge/save function, then connect it to the Answer Engine Content panel with independent loading and notices.

**Tech Stack:** React 18, TypeScript, Supabase Edge Functions, Deno, Zod, Vitest, Testing Library

## Global Constraints

- Preserve every existing SEO, focus phrase, canonical, robots, social, and media field.
- Generate Malay and English AEO together in one authenticated request.
- Save generated AEO only as a private draft; never publish automatically.
- Retain the existing combined `Generate SEO with AI` behaviour.
- Do not add a database migration or weaken existing authorization.

---

### Task 1: Strict AEO-Only Edge Function Contract

**Files:**
- Modify: `supabase/functions/tests/service-seo.test.ts`
- Modify: `supabase/functions/generate-service-seo/validation.ts`
- Modify: `supabase/functions/generate-service-seo/index.ts`

**Interfaces:**
- Produces: `validateServiceSeoRequest()` accepting optional `mode: "seo_and_aeo" | "aeo"` and `parseGeneratedServiceAeo()` returning `{ aeoMs, aeoEn }`.

- [ ] **Step 1: Add failing Deno tests** for accepting `mode: "aeo"`, rejecting unknown modes, accepting exactly `{ aeoMs, aeoEn }`, and rejecting extra or malformed AEO response fields.
- [ ] **Step 2: Run `deno test supabase/functions/tests/service-seo.test.ts`** and confirm failures come from the missing mode and parser.
- [ ] **Step 3: Implement the request mode and strict AEO parser**, defaulting omitted mode to `seo_and_aeo` for backward compatibility.
- [ ] **Step 4: Select an AEO-only system prompt and parser in the handler** while retaining current medical-claim safeguards and authenticated role checks.
- [ ] **Step 5: Rerun the Deno test** and confirm all cases pass.

### Task 2: AEO-Only Draft Merge API

**Files:**
- Create: `src/test/service-seo-aeo-api.test.ts`
- Modify: `src/features/website-cms/service-seo/api.ts`

**Interfaces:**
- Produces: `generateAndSaveServiceAeoDraft(input: { resourceId: string; record: ServiceSeoEditorRecord })`.

- [ ] **Step 1: Add a failing API test** that supplies distinctive values for every SEO and focus field, mocks a bilingual AEO response, and asserts the saved payload changes only `aeoMs` and `aeoEn`.
- [ ] **Step 2: Run `npm test -- src/test/service-seo-aeo-api.test.ts`** and confirm failure because the new function is absent.
- [ ] **Step 3: Implement the AEO request** with `mode: "aeo"`, strict Zod parsing, complete-payload validation, and the existing optimistic private-draft save path.
- [ ] **Step 4: Rerun the API test** and confirm it passes.

### Task 3: Bilingual AEO Editor Button

**Files:**
- Modify: `src/test/service-seo-editor.test.tsx`
- Modify: `src/pages/editor/ServiceSeoEditor.tsx`

**Interfaces:**
- Consumes: `generateAndSaveServiceAeoDraft()` from Task 2.

- [ ] **Step 1: Add failing editor tests** for the `Generate AEO (Malay & English)` button, the `Generating AEO…` disabled state, successful draft replacement, and failure preserving current fields.
- [ ] **Step 2: Run `npm test -- src/test/service-seo-editor.test.tsx`** and confirm failure because the control does not exist.
- [ ] **Step 3: Add an independent `generate-aeo` busy state and handler**, place the button in the Answer Engine Content header, update both AEO languages from the saved draft, retain the selected tab, and display draft-review success/error notices.
- [ ] **Step 4: Rerun the editor test** and confirm it passes.

### Task 4: Verification and Deployment

**Files:**
- Verify all files modified in Tasks 1–3.

- [ ] **Step 1: Run focused tests**:

```powershell
npm test -- src/test/service-seo-aeo-api.test.ts src/test/service-seo-editor.test.tsx src/test/service-seo-api.test.ts
deno test supabase/functions/tests/service-seo.test.ts
```

- [ ] **Step 2: Run production verification**:

```powershell
npx tsc --noEmit
npm run build
git diff --check
```

- [ ] **Step 3: Commit and push**:

```powershell
git add src supabase/functions docs/superpowers/plans/2026-08-11-bilingual-service-aeo-generation.md
git commit -m "feat: generate bilingual service AEO"
git push origin HEAD:main
```

- [ ] **Step 4: Deploy `generate-service-seo`** to project `nhjbqdiyptjqherdfbqk`, then verify GitHub Security Gate and Pages deployment succeed and the production bundle contains the new button label.

