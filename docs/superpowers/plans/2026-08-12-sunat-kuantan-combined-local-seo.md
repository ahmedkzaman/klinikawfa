# Sunat Kuantan Combined Local SEO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Klinik Awfa's canonical Sunat page easier for Google to crawl and understand, strengthen its local relevance, and provide an owner checklist and measurement baseline for Google Business Profile and Search Console.

**Architecture:** Keep `/services/sunat-kuantan/` as the single canonical hub. Extend the existing build-time public SEO generator so the route ships meaningful fallback HTML as well as metadata, strengthen visible content and internal links in React, and centralise sitemap dates in a generated public-route manifest. Business Profile and Search Console actions remain explicit owner-operated launch steps rather than unsafe automated account mutations.

**Tech Stack:** React 18, TypeScript, Vite, React Router, React Helmet Async, Vitest, Node.js build scripts, schema.org JSON-LD, GitHub Pages, Google Search Console, Google Business Profile.

## Global Constraints

- Keep one canonical Sunat hub at `https://klinikawfa.com/services/sunat-kuantan/`; do not create thin keyword-variant pages.
- Malay remains the primary language, with medically responsible wording for babies, children, and adults.
- Do not publish unverified prices, techniques, anaesthesia details, availability, outcomes, credentials, or ratings.
- The Google Business Profile name must remain the clinic's verified real-world name without keyword stuffing.
- Review requests must ask for honest feedback without incentives, gating, or pre-written positive text.
- No authenticated clinic data may be emitted into public HTML.
- Ranking position cannot be guaranteed; evaluate Search Console and Business Profile trends over 4 and 12 weeks.

## File Structure

- Create `src/content/publicSeoRoutes.json`: build-safe source of truth for public-route metadata and update dates.
- Create `src/content/publicSeoRoutes.ts`: typed wrapper that validates and exports the JSON manifest to the application.
- Create `scripts/public-seo-fallbacks.mjs`: build-safe, escaped fallback markup for selected public routes.
- Modify `scripts/prepare-public-seo-pages.mjs`: inject route metadata and meaningful fallback HTML into generated route files.
- Modify `src/content/localServicePages.ts`: refine the Sunat hub copy and link labels without adding unsupported claims.
- Modify `src/pages/LocalServicePage.tsx`: render explicit clinic, appointment, doctor, and related-service links.
- Modify `src/pages/Services.tsx`: make the Sunat internal link explicit and descriptive.
- Modify `src/pages/Doctors.tsx`: add a contextual Sunat link only beside verified circumcision expertise.
- Modify `src/lib/seo/serviceStructuredData.ts`: ensure the Sunat schema graph references the stable clinic entity and visible FAQ content.
- Create `scripts/generate-sitemap.mjs`: generate `public/sitemap.xml` from the JSON public-route manifest.
- Modify `.github/workflows/deploy-pages.yml`: generate and verify the sitemap and route snapshots during deployment.
- Create `docs/seo/sunat-kuantan-launch-checklist.md`: owner steps for Business Profile, Search Console, reviews, and measurement.
- Test with `src/test/sunat-kuantan-seo.test.tsx`, `src/test/public-seo-fallback.test.ts`, `src/test/public-sitemap-generation.test.ts`, and existing SEO regression tests.

---

### Task 1: Establish the canonical Sunat SEO contract

**Files:**
- Create: `src/content/publicSeoRoutes.ts`
- Create: `src/content/publicSeoRoutes.json`
- Modify: `src/content/localServicePages.ts`
- Test: `src/test/sunat-kuantan-seo.test.tsx`

**Interfaces:**
- Produces: `PUBLIC_SEO_ROUTES: readonly PublicSeoRoute[]` from validated JSON
- Produces: `PublicSeoRoute = { path: string; title: string; description: string; lastModified: string; changeFrequency: "daily" | "weekly" | "monthly"; priority: number }`
- Consumes: `LOCAL_SERVICE_PAGES['sunat-kuantan']`

- [ ] **Step 1: Write the failing contract test**

```tsx
import { describe, expect, it } from 'vitest';
import { LOCAL_SERVICE_PAGES } from '@/content/localServicePages';
import { PUBLIC_SEO_ROUTES } from '@/content/publicSeoRoutes';

describe('Sunat Kuantan SEO contract', () => {
  it('uses one canonical hub for all three patient intents', () => {
    const page = LOCAL_SERVICE_PAGES['sunat-kuantan'];
    expect(page.heading).toMatch(/Sunat.*Kuantan/i);
    expect(page.sections.map((section) => section.heading)).toEqual(
      expect.arrayContaining(['Sunat bayi', 'Sunat kanak-kanak', 'Sunat dewasa']),
    );
    expect(PUBLIC_SEO_ROUTES.filter((route) => route.path.includes('sunat'))).toEqual([
      expect.objectContaining({
        path: '/services/sunat-kuantan/',
        title: expect.stringMatching(/Sunat.*Kuantan.*Klinik Awfa/i),
      }),
    ]);
  });
});
```

- [ ] **Step 2: Run the test and verify the missing manifest failure**

Run: `npx vitest run src/test/sunat-kuantan-seo.test.tsx --pool=forks --fileParallelism=false --maxWorkers=1`

Expected: FAIL because `@/content/publicSeoRoutes` does not exist.

- [ ] **Step 3: Add the typed route manifest and refine the Sunat metadata**

```ts
import routeData from './publicSeoRoutes.json';

export interface PublicSeoRoute {
  path: string;
  title: string;
  description: string;
  lastModified: string;
  changeFrequency: 'daily' | 'weekly' | 'monthly';
  priority: number;
}

export const PUBLIC_SEO_ROUTES = routeData satisfies PublicSeoRoute[];
```

Store the actual route data in `publicSeoRoutes.json`:

```json
[
  {
    "path": "/services/sunat-kuantan/",
    "title": "Klinik Sunat Kuantan untuk Bayi, Kanak-kanak & Dewasa | Klinik Awfa",
    "description": "Penilaian dan perkhidmatan sunat bayi, kanak-kanak dan dewasa di Klinik Awfa, KotaSAS, Kuantan, termasuk persediaan dan penjagaan selepas prosedur.",
    "lastModified": "2026-08-12",
    "changeFrequency": "monthly",
    "priority": 0.9
  }
]
```

Add the other existing canonical public routes to the same manifest, preserving their current priorities and truthful update dates. Keep the visible Sunat content split into baby, child, adult, preparation, aftercare, and warning-sign sections.

- [ ] **Step 4: Run the focused test**

Run: `npx vitest run src/test/sunat-kuantan-seo.test.tsx --pool=forks --fileParallelism=false --maxWorkers=1`

Expected: PASS.

- [ ] **Step 5: Commit the contract**

```bash
git add src/content/publicSeoRoutes.json src/content/publicSeoRoutes.ts src/content/localServicePages.ts src/test/sunat-kuantan-seo.test.tsx
git commit -m "seo: define canonical Sunat Kuantan contract"
```

### Task 2: Ship meaningful crawler fallback HTML

**Files:**
- Create: `scripts/public-seo-fallbacks.mjs`
- Modify: `scripts/prepare-public-seo-pages.mjs`
- Test: `src/test/public-seo-fallback.test.ts`
- Test: `src/test/github-pages-hosting.test.ts`

**Interfaces:**
- Produces: `buildPublicSeoFallback(route: string): string | undefined`
- Consumes: route strings without leading or trailing slash, such as `services/sunat-kuantan`
- Injects: escaped semantic markup inside `<div id="root">...</div>` in generated public route HTML

- [ ] **Step 1: Write a failing build-output test**

```ts
it('ships meaningful Sunat content before JavaScript executes', () => {
  const html = readFileSync(resolve(distFixture, 'services/sunat-kuantan/index.html'), 'utf8');
  expect(html).toContain('<h1>Sunat di Kuantan untuk bayi, kanak-kanak dan dewasa</h1>');
  expect(html).toContain('<h2>Sunat bayi</h2>');
  expect(html).toContain('<h2>Sunat kanak-kanak</h2>');
  expect(html).toContain('<h2>Sunat dewasa</h2>');
  expect(html).toContain('href="/appointment"');
  expect(html).not.toContain('clinic_queue');
});
```

- [ ] **Step 2: Run the test and verify the empty-root failure**

Run: `npx vitest run src/test/public-seo-fallback.test.ts src/test/github-pages-hosting.test.ts --pool=forks --fileParallelism=false --maxWorkers=1`

Expected: FAIL because the generated file currently contains `<div id="root"></div>`.

- [ ] **Step 3: Implement a safely escaped fallback builder**

```js
const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

export function buildPublicSeoFallback(route) {
  const page = fallbacks[route];
  if (!page) return undefined;
  return `<main data-public-seo-fallback="${escapeHtml(route)}">
    <h1>${escapeHtml(page.heading)}</h1>
    <p>${escapeHtml(page.introduction)}</p>
    ${page.sections.map((section) => `<section><h2>${escapeHtml(section.heading)}</h2><p>${escapeHtml(section.summary)}</p></section>`).join('')}
    <p><a href="/appointment">Buat temujanji</a> · <a href="/services/">Lihat perkhidmatan Klinik Awfa</a></p>
  </main>`;
}
```

Use only approved public copy. Do not query Supabase patient, consultation, billing, or staff tables.

- [ ] **Step 4: Inject the fallback into each supported generated route**

```js
const fallback = buildPublicSeoFallback(route);
if (fallback) {
  html = html.replace('<div id="root"></div>', `<div id="root">${fallback}</div>`);
}
```

The existing `createRoot` client boot will replace the fallback after JavaScript loads. The fallback must be visible, semantic, and content-equivalent—not hidden or stuffed with keywords.

- [ ] **Step 5: Build and run the focused tests**

Run: `npm run build`

Run: `npx vitest run src/test/public-seo-fallback.test.ts src/test/github-pages-hosting.test.ts --pool=forks --fileParallelism=false --maxWorkers=1`

Expected: build succeeds and both test files pass.

- [ ] **Step 6: Commit the crawler fallback**

```bash
git add scripts/public-seo-fallbacks.mjs scripts/prepare-public-seo-pages.mjs src/test/public-seo-fallback.test.ts src/test/github-pages-hosting.test.ts
git commit -m "seo: prerender public Sunat page fallback"
```

### Task 3: Strengthen visible internal discovery and trust links

**Files:**
- Modify: `src/pages/LocalServicePage.tsx`
- Modify: `src/pages/Services.tsx`
- Modify: `src/pages/Doctors.tsx`
- Test: `src/test/local-service-pages.test.tsx`
- Test: `src/test/public-service-links.test.tsx`

**Interfaces:**
- Consumes: canonical route `/services/sunat-kuantan`
- Produces: descriptive React Router links from Services and relevant doctor content
- Produces: visible links from the Sunat page to `/appointment`, `/doctors`, `/services`, and `/services/minor-surgery-kutil-kuantan`

- [ ] **Step 1: Write failing link assertions**

```tsx
expect(screen.getByRole('link', { name: /perkhidmatan sunat di kuantan/i })).toHaveAttribute(
  'href',
  '/services/sunat-kuantan',
);
expect(screen.getByRole('link', { name: /lihat doktor klinik awfa/i })).toHaveAttribute('href', '/doctors');
expect(screen.getByRole('link', { name: /buat temujanji/i })).toHaveAttribute('href', '/appointment');
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `npx vitest run src/test/local-service-pages.test.tsx src/test/public-service-links.test.tsx --pool=forks --fileParallelism=false --maxWorkers=1`

Expected: FAIL because the descriptive doctor and Sunat-specific links are absent.

- [ ] **Step 3: Add explicit contextual links**

In `Services.tsx`, use `Perkhidmatan sunat di Kuantan` for the Sunat hub rather than only the generic card title. In `LocalServicePage.tsx`, add the Doctors and Services overview links beside the existing appointment and WhatsApp actions. In `Doctors.tsx`, render a Sunat link only for doctor records whose verified expertise arrays include `Khatan` or `Circumcision`.

```tsx
const offersCircumcision = [...(doctor.expertise_ms ?? []), ...(doctor.expertise_en ?? [])]
  .some((expertise) => /khatan|circumcision/i.test(expertise));
```

- [ ] **Step 4: Run focused and regression tests**

Run: `npx vitest run src/test/local-service-pages.test.tsx src/test/public-service-links.test.tsx src/test/seo-head-deduplication.test.tsx --pool=forks --fileParallelism=false --maxWorkers=1`

Expected: PASS.

- [ ] **Step 5: Commit internal discovery changes**

```bash
git add src/pages/LocalServicePage.tsx src/pages/Services.tsx src/pages/Doctors.tsx src/test/local-service-pages.test.tsx src/test/public-service-links.test.tsx
git commit -m "seo: strengthen Sunat service internal links"
```

### Task 4: Validate the Sunat schema graph

**Files:**
- Modify: `src/lib/seo/serviceStructuredData.ts`
- Modify: `scripts/public-seo-fallbacks.mjs`
- Modify: `scripts/prepare-public-seo-pages.mjs`
- Test: `src/test/service-structured-data.test.ts`
- Test: `src/test/local-service-pages.test.tsx`
- Test: `src/test/public-seo-fallback.test.ts`

**Interfaces:**
- Consumes: `{ path, name, breadcrumbName, description, faqs }`
- Produces: a JSON-LD graph containing `MedicalClinic`, `Service`, `WebPage`, `BreadcrumbList`, and visible `FAQPage` entries
- Produces: `buildPublicSeoSchemas(route: string): Record<string, unknown>[] | undefined` for build-time crawler HTML
- References: stable clinic entity `https://klinikawfa.com/#clinic`

- [ ] **Step 1: Write failing schema assertions**

```ts
const graph = buildServiceStructuredData(input);
expect(graph).toEqual(expect.arrayContaining([
  expect.objectContaining({ '@type': 'MedicalClinic', '@id': 'https://klinikawfa.com/#clinic' }),
  expect.objectContaining({
    '@type': 'Service',
    url: 'https://klinikawfa.com/services/sunat-kuantan/',
    provider: { '@id': 'https://klinikawfa.com/#clinic' },
  }),
  expect.objectContaining({ '@type': 'FAQPage' }),
]));
```

- [ ] **Step 2: Run the schema tests and inspect the exact mismatch**

Run: `npx vitest run src/test/service-structured-data.test.ts src/test/local-service-pages.test.tsx src/test/public-seo-fallback.test.ts --pool=forks --fileParallelism=false --maxWorkers=1`

Expected: FAIL if any entity, canonical, or FAQ-visible-content relationship is missing.

- [ ] **Step 3: Make the minimal schema correction**

Reuse `buildClinicSchema`, `buildServiceSchema`, `buildWebPageSchema`, and `buildBreadcrumbSchema` in the React application. Add a content-equivalent, public-facts-only schema graph to `scripts/public-seo-fallbacks.mjs`, and inject it into the generated `<head>`:

```js
const schemas = buildPublicSeoSchemas(route);
if (schemas?.length) {
  const json = JSON.stringify(schemas).replaceAll('<', '\\u003c');
  html = html.replace('</head>', `<script type="application/ld+json">${json}</script>\n</head>`);
}
```

Include FAQ schema only when the same questions and answers exist in the visible fallback and React page. Omit empty optional fields instead of guessing them.

- [ ] **Step 4: Run schema and metadata regressions**

Run: `npx vitest run src/test/service-structured-data.test.ts src/test/local-service-pages.test.tsx src/test/public-seo-fallback.test.ts src/test/service-seo-runtime.test.tsx --pool=forks --fileParallelism=false --maxWorkers=1`

Expected: PASS.

- [ ] **Step 5: Commit schema changes**

```bash
git add src/lib/seo/serviceStructuredData.ts scripts/public-seo-fallbacks.mjs scripts/prepare-public-seo-pages.mjs src/test/service-structured-data.test.ts src/test/local-service-pages.test.tsx src/test/public-seo-fallback.test.ts
git commit -m "seo: validate Sunat structured data graph"
```

### Task 5: Generate the sitemap from one public-route manifest

**Files:**
- Create: `scripts/generate-sitemap.mjs`
- Modify: `public/sitemap.xml`
- Modify: `.github/workflows/deploy-pages.yml`
- Test: `src/test/public-sitemap-generation.test.ts`

**Interfaces:**
- Consumes: `src/content/publicSeoRoutes.json` using `readFileSync` and `JSON.parse`
- Produces: deterministic `public/sitemap.xml`
- Enforces: canonical trailing slashes for service routes and truthful ISO `lastmod` dates

- [ ] **Step 1: Write a failing sitemap-generation test**

```ts
expect(sitemap).toContain('<loc>https://klinikawfa.com/services/sunat-kuantan/</loc>');
expect(sitemap).toContain('<lastmod>2026-08-12</lastmod>');
expect((sitemap.match(/services\/sunat-kuantan\//g) ?? [])).toHaveLength(1);
expect(sitemap).not.toMatch(/\/clinic|\/staff|\/editor|\/admin/);
```

- [ ] **Step 2: Run the test and verify the stale date failure**

Run: `npx vitest run src/test/public-sitemap-generation.test.ts --pool=forks --fileParallelism=false --maxWorkers=1`

Expected: FAIL because the checked-in sitemap still reports `2026-07-27` for the Sunat route.

- [ ] **Step 3: Implement deterministic sitemap generation**

```js
const routes = JSON.parse(readFileSync(new URL('../src/content/publicSeoRoutes.json', import.meta.url), 'utf8'));
const url = (route) => `https://klinikawfa.com${route.path}`;
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${routes.map((route) => `  <url>\n    <loc>${url(route)}</loc>\n    <lastmod>${route.lastModified}</lastmod>\n    <changefreq>${route.changeFrequency}</changefreq>\n    <priority>${route.priority.toFixed(1)}</priority>\n  </url>`).join('\n')}\n</urlset>\n`;
```

Add `node scripts/generate-sitemap.mjs` before the production build in the deployment workflow and fail the workflow if the Sunat canonical is absent or duplicated.

- [ ] **Step 4: Generate and test the sitemap**

Run: `node scripts/generate-sitemap.mjs`

Run: `npx vitest run src/test/public-sitemap-generation.test.ts src/test/seo-static-files.test.ts --pool=forks --fileParallelism=false --maxWorkers=1`

Expected: PASS.

- [ ] **Step 5: Commit sitemap automation**

```bash
git add scripts/generate-sitemap.mjs public/sitemap.xml .github/workflows/deploy-pages.yml src/test/public-sitemap-generation.test.ts
git commit -m "seo: generate canonical public sitemap"
```

### Task 6: Create the owner launch and measurement checklist

**Files:**
- Create: `docs/seo/sunat-kuantan-launch-checklist.md`
- Modify: `docs/seo/google-search-console-handoff.md`

**Interfaces:**
- Produces: a manual launch checklist for Google Business Profile and Search Console
- Records: baseline date, URL inspection result, sitemap result, target query groups, 4-week review, and 12-week review

- [ ] **Step 1: Write the checklist with exact owner actions**

Include these Google Business Profile actions:

```markdown
- [ ] Confirm the verified business name remains the exact real-world clinic name.
- [ ] Confirm address, map pin, telephone, regular hours, and special hours match klinikawfa.com.
- [ ] Set the website to https://klinikawfa.com/ and appointment link to https://klinikawfa.com/appointment.
- [ ] Add a factual Sunat/circumcision service description and use the canonical Sunat URL where a service URL is supported.
- [ ] Upload current clinic/service-environment photos with no patient-identifying information.
- [ ] Publish one factual Sunat preparation or aftercare post linking to the canonical page.
```

Include these Search Console actions:

```markdown
- [ ] Submit https://klinikawfa.com/sitemap.xml.
- [ ] Inspect https://klinikawfa.com/services/sunat-kuantan/.
- [ ] Run Test Live URL and confirm crawl/indexing allowed.
- [ ] Request indexing once after the deployed page passes the live test.
- [ ] Record impressions, clicks, CTR, and average position for the target query groups.
```

Include the honest-review request wording:

```text
Terima kasih kerana mendapatkan rawatan di Klinik Awfa. Jika anda selesa, kami menghargai ulasan jujur tentang pengalaman anda di klinik: [Google review link]
```

- [ ] **Step 2: Check the document for unsafe promises and prohibited review language**

Run: `rg -n -i "guaranteed rank|guarantee.*top|five.star|5.star|discount.*review|free.*review" docs/seo/sunat-kuantan-launch-checklist.md`

Expected: no matches.

- [ ] **Step 3: Commit the owner checklist**

```bash
git add docs/seo/sunat-kuantan-launch-checklist.md docs/seo/google-search-console-handoff.md
git commit -m "docs: add Sunat local SEO launch checklist"
```

### Task 7: Full verification, deployment, and canary checks

**Files:**
- Verify only; modify a file only if a test exposes a defect in the approved scope.

**Interfaces:**
- Consumes: all outputs from Tasks 1–6
- Produces: a deployed canonical Sunat page and recorded launch evidence

- [ ] **Step 1: Run focused SEO tests**

Run: `npx vitest run src/test/sunat-kuantan-seo.test.tsx src/test/public-seo-fallback.test.ts src/test/public-service-links.test.tsx src/test/service-structured-data.test.ts src/test/public-sitemap-generation.test.ts src/test/local-service-pages.test.tsx src/test/github-pages-hosting.test.ts src/test/seo-static-files.test.ts src/test/seo-head-deduplication.test.tsx src/test/service-seo-runtime.test.tsx --pool=forks --fileParallelism=false --maxWorkers=1`

Expected: all pass.

- [ ] **Step 2: Run production build and changed-file checks**

Run: `npm run build`

Run: `npm run lint:changed`

Run: `git diff --check`

Expected: all succeed with no whitespace errors.

- [ ] **Step 3: Inspect built Sunat HTML**

Run: `rg -n "Klinik Sunat Kuantan|Sunat bayi|Sunat kanak-kanak|Sunat dewasa|canonical|application/ld\+json" dist/services/sunat-kuantan/index.html`

Expected: metadata, visible fallback content, canonical, and structured-data output are present.

- [ ] **Step 4: Commit any verification-only correction**

If verification required an in-scope correction, stage the exact named files shown by `git status --short`, for example:

```bash
git add src/pages/LocalServicePage.tsx src/test/local-service-pages.test.tsx
git commit -m "fix: complete Sunat SEO verification"
```

If no correction was needed, do not create an empty commit.

- [ ] **Step 5: Push the verified commits to `main`**

Run: `git push origin HEAD:main`

Expected: push succeeds and the GitHub Pages deployment workflow starts.

- [ ] **Step 6: Run production canary checks after deployment**

Run:

```powershell
$page = Invoke-WebRequest 'https://klinikawfa.com/services/sunat-kuantan/' -UseBasicParsing
$sitemap = Invoke-WebRequest 'https://klinikawfa.com/sitemap.xml' -UseBasicParsing
if ($page.StatusCode -ne 200) { throw "Sunat page HTTP $($page.StatusCode)" }
if ($page.Content -notmatch 'Klinik Sunat Kuantan|Sunat di Kuantan') { throw 'Sunat heading missing' }
if ($page.Content -notmatch 'rel="canonical" href="https://klinikawfa.com/services/sunat-kuantan/"') { throw 'Canonical missing' }
if ($sitemap.Content -notmatch 'https://klinikawfa.com/services/sunat-kuantan/') { throw 'Sitemap URL missing' }
```

Expected: no exception.

- [ ] **Step 7: Complete owner-controlled Google steps**

Follow `docs/seo/sunat-kuantan-launch-checklist.md`. Record the Business Profile updates and Search Console live-test result. Do not repeatedly request indexing.
