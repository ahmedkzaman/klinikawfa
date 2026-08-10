# Bilingual Service-Page AEO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every public service landing page bilingual, answer-focused, crawlable, and represented by accurate structured data for search and AI answer systems.

**Architecture:** Keep service copy in the existing declarative service content/CMS model. Add reusable rendering and schema helpers so visible sections and JSON-LD share the same bilingual values, while preserving existing routes and editor behavior. Keep sitemap and robots changes static and explicit, matching the current deployment model.

**Tech Stack:** React, TypeScript, React Router, existing SEOHead/SchemaMarkup helpers, Vitest, Vite, GitHub Pages.

## Global Constraints

- Cover main `/services/:slug` routes and existing local service landing pages.
- Provide Malay and English values for titles, descriptions, answer sections, FAQs, and calls to action.
- Keep content factual and free of unsupported promises, fabricated prices, credentials, or outcomes.
- FAQ JSON-LD is allowed only when the same FAQs are visibly rendered.
- Use absolute URLs in JSON-LD and do not expose private clinic or patient data.
- Preserve existing URL and trailing-slash behavior.
- Important content must be publicly discoverable without authentication or interaction.
- Verify tests, production build, and GitHub Actions before claiming deployment.

---

### Task 1: Map current service routes and SEO contracts

**Files:**
- Inspect: `src/App.tsx`
- Inspect: `src/content/localServicePages.ts`
- Inspect: `src/pages/ServiceDetail.tsx`
- Inspect: `src/components/seo/SEOHead.tsx`
- Inspect: `src/components/seo/SchemaMarkup.tsx`
- Inspect: `public/sitemap.xml`
- Inspect: `public/robots.txt`
- Test: existing service SEO tests under `src/test/`

**Interfaces:**
- Produces a route/content inventory and identifies existing helper signatures before code changes.

- [ ] **Step 1: Enumerate public service routes and current content fields**

Run:

```powershell
rg -n "path=\"/services|localServicePages|ServiceDetail|SchemaMarkup|SEOHead" src/App.tsx src/content src/pages src/components/seo
```

Record the actual route list, which routes are CMS-backed, and which are declarative local pages.

- [ ] **Step 2: Identify existing test conventions**

Run:

```powershell
Get-ChildItem src/test -Filter '*service*' -Recurse
rg -n "describe\(|it\(|test\(" src/test | Select-Object -First 80
```

Use the existing Vitest setup and naming conventions; do not add a new test framework.

- [ ] **Step 3: Commit the inventory notes if a durable map is needed**

Only commit a small documentation update if the route inventory reveals a missing source-of-truth document. Otherwise leave the repository unchanged for this task.

### Task 2: Add bilingual AEO content data

**Files:**
- Modify: `src/content/localServicePages.ts`
- Modify: `src/features/website-cms/service-seo/api.ts` and its existing service SEO draft type
- Test: new `src/test/service-aeo-content.test.ts`

**Interfaces:**
- Produces a normalized bilingual content shape:

```ts
type BilingualText = { ms: string; en: string };
type ServiceAeoContent = {
  intro: BilingualText;
  suitableFor: BilingualText;
  whatToExpect: BilingualText;
  preparation?: BilingualText;
  safetyNote?: BilingualText;
  bookingCta: BilingualText;
  faqs: Array<{ question: BilingualText; answer: BilingualText }>;
};
```

- [ ] **Step 1: Write failing content contract tests**

Test that every public service content record has non-empty Malay and English title/description/intro values, at least one useful FAQ where the page supports FAQs, and no placeholder markers or `lorem` text.

- [ ] **Step 2: Run the focused test and verify it fails for missing fields**

Run:

```powershell
npx vitest run src/test/service-aeo-content.test.ts
```

Expected: FAIL until all records satisfy the normalized shape.

- [ ] **Step 3: Add the normalized fields for every service landing page**

Write concise, medically responsible Malay and English copy for general treatment, ear care, minor surgery/warts, swab testing, weight management, circumcision, and all other routes found in Task 1. Keep prices and clinical outcomes out unless already verified in the existing source data.

- [ ] **Step 4: Run the focused test and verify it passes**

Run the same Vitest command. Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/content src/features src/test/service-aeo-content.test.ts
git commit -m "feat: add bilingual service AEO content"
```

### Task 3: Render answer-focused sections consistently

**Files:**
- Create or modify: `src/components/seo/ServiceAeoSections.tsx`
- Modify: `src/pages/ServiceDetail.tsx`
- Modify: `src/pages/LocalServicePage.tsx`
- Test: `src/test/service-aeo-rendering.test.tsx`

**Interfaces:**
- `ServiceAeoSections` accepts `ServiceAeoContent` and the active language, then renders visible headings, answers, optional safety/preparation notes, FAQs, and CTA.

- [ ] **Step 1: Write a failing rendering test**

Render a representative page in Malay and English and assert that the intro, the answer-focused section headings, and every visible FAQ question/answer are present. Assert that missing optional preparation content does not crash rendering.

- [ ] **Step 2: Implement the shared section renderer**

Use existing typography, spacing, links, and language context. Render only sections with content. Keep the first answer concise and ensure FAQ text is visible in the DOM.

- [ ] **Step 3: Integrate it into both service page paths**

Pass the normalized data into `ServiceDetail` and `LocalServicePage` without changing route matching or existing CTA destinations.

- [ ] **Step 4: Run the focused test and build**

```powershell
npx vitest run src/test/service-aeo-rendering.test.tsx
npm run build
```

Expected: PASS and a successful production build.

- [ ] **Step 5: Commit**

```powershell
git add src/components/seo/ServiceAeoSections.tsx src/pages/ServiceDetail.tsx src/pages src/test/service-aeo-rendering.test.tsx
git commit -m "feat: render bilingual service answers and FAQs"
```

### Task 4: Generate aligned structured data

**Files:**
- Create or modify: `src/lib/seo/serviceStructuredData.ts`
- Modify: `src/pages/ServiceDetail.tsx`
- Modify: `src/pages/LocalServicePage.tsx` schema integration
- Test: `src/test/service-structured-data.test.ts`

**Interfaces:**
- Export `buildServiceStructuredData(input)` returning JSON-LD graph entities for `MedicalClinic`, `MedicalWebPage`, `Service`, `BreadcrumbList`, and visible `FAQPage` data.

- [ ] **Step 1: Write failing schema tests**

Assert absolute URLs, stable clinic identity, service name/description, breadcrumbs, and that FAQ questions/answers exactly match the visible bilingual FAQ values. Assert no FAQ entity is produced for an empty FAQ list.

- [ ] **Step 2: Implement the shared builder**

Reuse existing clinic constants and schema helpers. Use `@id` links to avoid duplicate conflicting entities. Include hero image data only when a valid absolute or resolvable image URL exists.

- [ ] **Step 3: Integrate without duplicate JSON-LD**

Replace only the service-page schema path that currently emits metadata. Preserve unrelated site-wide schema and ensure each page has one coherent graph.

- [ ] **Step 4: Run schema tests and production build**

```powershell
npx vitest run src/test/service-structured-data.test.ts
npm run build
```

Expected: PASS and successful build.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/seo/serviceStructuredData.ts src/pages src/test/service-structured-data.test.ts
git commit -m "feat: add service and FAQ structured data"
```

### Task 5: Complete crawlability and internal linking

**Files:**
- Modify: `public/sitemap.xml`
- Modify: `public/robots.txt` only if the audit finds a blocking rule
- Modify: `src/components/home/ServicesPreview.tsx` if links are incomplete
- Modify: `src/pages/Services.tsx` and `src/components/home/ServicesPreview.tsx` where links are incomplete
- Test: `src/test/service-discoverability.test.ts`

**Interfaces:**
- Produces a complete set of public service URLs that matches the sitemap and rendered internal links.

- [ ] **Step 1: Write failing discoverability tests**

Parse the sitemap and assert every indexable route from the route inventory appears exactly once, the sitemap points to the configured canonical origin, and no route is blocked by robots rules.

- [ ] **Step 2: Update sitemap and internal links**

Add missing service URLs, preserve the existing XML format, and ensure homepage/service-index links use descriptive service names and correct trailing-slash conventions.

- [ ] **Step 3: Run discoverability tests**

```powershell
npx vitest run src/test/service-discoverability.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add public/sitemap.xml public/robots.txt src/components/home src/pages src/test/service-discoverability.test.ts
git commit -m "feat: improve service page discoverability"
```

### Task 6: Full verification and deployment

**Files:**
- Inspect: all files changed in Tasks 2-5

- [ ] **Step 1: Run focused and regression tests**

```powershell
npx vitest run src/test/service-aeo-content.test.ts src/test/service-aeo-rendering.test.tsx src/test/service-structured-data.test.ts src/test/service-discoverability.test.ts
npm test -- --run
```

Expected: all selected tests pass. If the repository has no `npm test` script, use the existing package-script equivalent and record that fact.

- [ ] **Step 2: Run production build**

```powershell
npm run build
```

Expected: successful build with no TypeScript or bundler errors.

- [ ] **Step 3: Inspect representative routes**

Open the services index, one CMS-backed service, and two local landing pages at desktop and mobile widths. Confirm bilingual content, FAQ visibility, images, links, no overflow, and correct canonical/schema output.

- [ ] **Step 4: Rebase and push the approved changes**

```powershell
git fetch origin main
git rebase origin/main
git push origin deploy/patient-explorer:main
```

- [ ] **Step 5: Verify GitHub Actions**

```powershell
gh run list --repo ahmedkzaman/klinikawfa --branch main --limit 5
gh run watch <security-run-id> --repo ahmedkzaman/klinikawfa --exit-status
gh run watch <pages-run-id> --repo ahmedkzaman/klinikawfa --exit-status
```

Expected: security and Pages workflows complete successfully.

- [ ] **Step 6: Confirm live routes**

Request the representative public URLs and confirm HTTP success, page title, sitemap availability, and rendered JSON-LD. Report the exact commit and workflow result.
