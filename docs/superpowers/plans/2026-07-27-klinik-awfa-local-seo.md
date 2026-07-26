# Klinik Awfa Local SEO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `klinikawfa.com` the authoritative result for Klinik Awfa and establish useful, indexable local service pages for the approved KotaSAS and Kuantan searches.

**Architecture:** Keep the authenticated clinic application unchanged and build SEO around the existing public React/CMS layer. Centralize route metadata, index policy, structured data and sitemap entries in small pure modules; render five medically responsible Malay-first service hubs through the existing public layout; verify the deployed domain and hand off Google Search Console and Business Profile actions.

**Tech Stack:** React 18, TypeScript, React Router, React Helmet Async, Vite, Vitest, static `public/robots.txt` and `public/sitemap.xml`.

## Global Constraints

- Canonical production origin is exactly `https://klinikawfa.com`.
- Malay is the primary search language; English phrases are supporting terms, not duplicate pages.
- Do not keyword-stuff or create one thin page per keyword variation.
- Do not guarantee Google rankings, treatment outcomes, weight loss or immediate procedural suitability.
- Do not fabricate ratings, clinician qualifications, prices, accreditations or emergency capability.
- Protected clinic, staff, editor, authentication, TV/caller and preview routes must not enter the sitemap and must carry `noindex, nofollow`.
- Public pages must remain accessible without authentication.
- Existing unrelated working-tree changes must be preserved.

---

## File Structure

**Create**

- `src/lib/website/seoRoutes.ts` — canonical origin, route metadata and public/indexability rules.
- `src/lib/website/clinicSchema.ts` — pure builders for MedicalClinic, WebSite, WebPage, Service and BreadcrumbList JSON-LD.
- `src/content/localServicePages.ts` — typed Malay-first content for the five approved service hubs.
- `src/pages/LocalServicePage.tsx` — shared renderer for local service hubs.
- `src/test/seo-routes.test.ts` — metadata, canonical and route-index policy tests.
- `src/test/clinic-schema.test.ts` — structured-data contract tests.
- `src/test/local-service-pages.test.tsx` — page content, headings, links and safety-copy tests.
- `src/test/seo-static-files.test.ts` — robots and sitemap domain/inclusion/exclusion tests.
- `docs/seo/google-search-console-handoff.md` — non-technical post-deployment setup checklist.

**Modify**

- `src/App.tsx` — register the five stable local service routes and global route index guard.
- `src/components/seo/SEOHead.tsx` — consume centralized canonical/index policy safely.
- `src/components/seo/SchemaMarkup.tsx` — render centralized clinic/page/service schema.
- `src/pages/Index.tsx` — strengthen homepage entity metadata/schema and link to service hubs.
- `src/pages/Services.tsx` — expose crawlable links to service hubs.
- `src/components/layout/Footer.tsx` — add location/entity text and public service links without overloading navigation.
- `index.html` — use homepage-safe static metadata and canonical fallbacks.
- `public/robots.txt` — point to the production sitemap and block operational route families.
- `public/sitemap.xml` — replace the obsolete Lovable host with canonical public URLs.

---

### Task 1: Centralize route metadata and index policy

**Files:**

- Create: `src/lib/website/seoRoutes.ts`
- Create: `src/test/seo-routes.test.ts`
- Modify: `src/components/seo/SEOHead.tsx`
- Modify: `src/App.tsx`

**Interfaces:**

- Produces:
  - `SITE_ORIGIN: "https://klinikawfa.com"`
  - `type SeoRouteDefinition = { path: string; title: string; description: string; index: boolean; follow: boolean }`
  - `getSeoRoute(pathname: string): SeoRouteDefinition`
  - `canonicalUrl(pathname: string): string`
  - `isProtectedFromIndex(pathname: string): boolean`
- Consumes: `SEOHead` props and `react-router-dom` location.

- [ ] **Step 1: Write failing route-policy tests**

```ts
import { describe, expect, it } from 'vitest';
import { canonicalUrl, getSeoRoute, isProtectedFromIndex } from '@/lib/website/seoRoutes';

describe('SEO route policy', () => {
  it('makes the homepage authoritative for Klinik Awfa KotaSAS', () => {
    expect(getSeoRoute('/')).toMatchObject({
      title: 'Klinik Awfa KotaSAS | Klinik Keluarga di Kuantan',
      index: true,
      follow: true,
    });
    expect(canonicalUrl('/')).toBe('https://klinikawfa.com/');
  });

  it.each(['/clinic/queue', '/staff/dashboard', '/editor/home', '/auth', '/tv'])(
    'keeps operational route %s out of search',
    (path) => {
      expect(isProtectedFromIndex(path)).toBe(true);
      expect(getSeoRoute(path)).toMatchObject({ index: false, follow: false });
    },
  );

  it('normalizes query strings and trailing slashes in canonicals', () => {
    expect(canonicalUrl('/services/telinga-kuantan/?from=home')).toBe(
      'https://klinikawfa.com/services/telinga-kuantan',
    );
  });
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```powershell
npm.cmd test -- --run src/test/seo-routes.test.ts
```

Expected: FAIL because `seoRoutes.ts` does not exist.

- [ ] **Step 3: Implement the minimal route registry and prefix guard**

Use exact protected prefixes:

```ts
const NOINDEX_PREFIXES = [
  '/clinic',
  '/staff',
  '/editor',
  '/auth',
  '/locum-register',
  '/reset-password',
  '/video-call',
  '/tv',
] as const;
```

Normalize paths by removing query/hash, collapsing repeated slashes and removing the trailing slash except for `/`. Define exact homepage and service-hub metadata in the registry. Unknown operational paths inherit `noindex,nofollow`; unknown public paths use a conservative public fallback only when they match an existing public route family.

- [ ] **Step 4: Make `SEOHead` use the centralized defaults**

Preserve explicit CMS metadata when valid, but force `noindex,nofollow` when `isProtectedFromIndex(location.pathname)` is true. Ensure each render emits one title, description, robots tag, canonical, Open Graph URL/title/description and Twitter title/description.

- [ ] **Step 5: Add a route-level index guard**

Render a small `RouteSeoGuard` inside `BrowserRouter` so operational routes receive noindex metadata even when their page components do not render `SEOHead`.

- [ ] **Step 6: Run focused and existing metadata tests**

Run:

```powershell
npm.cmd test -- --run src/test/seo-routes.test.ts src/test/general-pages.test.tsx src/test/website-cms-domain.test.ts
```

Expected: all selected tests PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/lib/website/seoRoutes.ts src/test/seo-routes.test.ts src/components/seo/SEOHead.tsx src/App.tsx
git commit -m "feat: centralize public SEO route policy"
```

---

### Task 2: Add trustworthy clinic and page structured data

**Files:**

- Create: `src/lib/website/clinicSchema.ts`
- Create: `src/test/clinic-schema.test.ts`
- Modify: `src/components/seo/SchemaMarkup.tsx`
- Modify: `src/pages/Index.tsx`

**Interfaces:**

- Produces:
  - `CLINIC_ENTITY_ID = "https://klinikawfa.com/#clinic"`
  - `buildClinicSchema(input: ClinicPublicFacts): Record<string, unknown>`
  - `buildWebPageSchema(input: PageSchemaInput): Record<string, unknown>`
  - `buildServiceSchema(input: ServiceSchemaInput): Record<string, unknown>`
  - `buildBreadcrumbSchema(items: BreadcrumbItem[]): Record<string, unknown>`
- Consumes clinic name, public phone, address, geo coordinates and opening hours already displayed by the public website.

- [ ] **Step 1: Write failing schema tests**

```ts
import { describe, expect, it } from 'vitest';
import { buildClinicSchema, CLINIC_ENTITY_ID } from '@/lib/website/clinicSchema';

describe('Klinik Awfa structured data', () => {
  it('identifies one stable medical clinic entity in KotaSAS, Kuantan', () => {
    const schema = buildClinicSchema({
      telephone: '09-5751312',
      streetAddress: 'Ground Floor B2 & B4, Jalan Pahang KS 1/12, KotaSAS',
      postalCode: '25200',
      latitude: 3.8077,
      longitude: 103.326,
      openingHours: ['Mo-Su 08:00-24:00'],
    });
    expect(schema).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'MedicalClinic',
      '@id': CLINIC_ENTITY_ID,
      name: 'Klinik Awfa',
      url: 'https://klinikawfa.com/',
      address: { addressLocality: 'Kuantan', addressRegion: 'Pahang', addressCountry: 'MY' },
    });
  });
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```powershell
npm.cmd test -- --run src/test/clinic-schema.test.ts
```

Expected: FAIL because the builder does not exist.

- [ ] **Step 3: Implement pure schema builders**

Build JSON-LD using only confirmed facts. Omit optional keys whose values are blank. Escape through `JSON.stringify`; never assemble JSON strings manually. Connect pages and services using `provider: { "@id": CLINIC_ENTITY_ID }`.

- [ ] **Step 4: Replace duplicate ad-hoc schema rendering**

Update `SchemaMarkup.tsx` to accept builder outputs and render one JSON-LD script per schema object. The homepage renders MedicalClinic + WebSite + WebPage. Service pages render WebPage + Service + BreadcrumbList.

- [ ] **Step 5: Run schema and homepage tests**

Run:

```powershell
npm.cmd test -- --run src/test/clinic-schema.test.ts src/test/home-defaults.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/lib/website/clinicSchema.ts src/test/clinic-schema.test.ts src/components/seo/SchemaMarkup.tsx src/pages/Index.tsx
git commit -m "feat: add Klinik Awfa medical clinic schema"
```

---

### Task 3: Publish five local service hubs

**Files:**

- Create: `src/content/localServicePages.ts`
- Create: `src/pages/LocalServicePage.tsx`
- Create: `src/test/local-service-pages.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**

- Produces:
  - `type LocalServicePageContent`
  - `LOCAL_SERVICE_PAGES: Record<string, LocalServicePageContent>`
  - Routes:
    - `/services/rawatan-telinga-kuantan`
    - `/services/minor-surgery-kutil-kuantan`
    - `/services/swab-test-demam-kuantan`
    - `/services/pengurusan-berat-badan-kuantan`
    - `/services/sunat-kuantan`
- Consumes: `SEOHead`, schema builders, `MainLayout` and existing appointment/WhatsApp link helpers.

- [ ] **Step 1: Write failing content-contract tests**

```tsx
import { describe, expect, it } from 'vitest';
import { LOCAL_SERVICE_PAGES } from '@/content/localServicePages';

describe('local SEO service pages', () => {
  it('publishes exactly five substantial service hubs', () => {
    expect(Object.keys(LOCAL_SERVICE_PAGES)).toEqual([
      'rawatan-telinga-kuantan',
      'minor-surgery-kutil-kuantan',
      'swab-test-demam-kuantan',
      'pengurusan-berat-badan-kuantan',
      'sunat-kuantan',
    ]);
  });

  it('separates baby, child and adult circumcision intents on one hub', () => {
    const page = LOCAL_SERVICE_PAGES['sunat-kuantan'];
    expect(page.sections.map((section) => section.heading)).toEqual(
      expect.arrayContaining(['Sunat bayi', 'Sunat kanak-kanak', 'Sunat dewasa']),
    );
  });

  it('uses medical safeguards rather than guaranteed outcomes', () => {
    const allCopy = JSON.stringify(LOCAL_SERVICE_PAGES).toLowerCase();
    expect(allCopy).not.toMatch(/dijamin|guaranteed|100% berkesan/);
    expect(allCopy).toContain('penilaian doktor');
  });
});
```

- [ ] **Step 2: Run the content test and confirm RED**

Run:

```powershell
npm.cmd test -- --run src/test/local-service-pages.test.tsx
```

Expected: FAIL because the content registry does not exist.

- [ ] **Step 3: Define the content model and Malay-first copy**

Each page includes:

```ts
interface LocalServicePageContent {
  slug: string;
  title: string;
  metaDescription: string;
  eyebrow: string;
  heading: string;
  introduction: string;
  sections: Array<{ id: string; heading: string; paragraphs: string[]; bullets?: string[] }>;
  faqs: Array<{ question: string; answer: string }>;
  relatedSlugs: string[];
  reviewedByLabel: string;
}
```

Write unique patient-focused copy for each approved hub. Use “pembedahan kecil” alongside “minor surgery.” Describe weight management as doctor-led assessment and monitoring. State that procedure/test suitability depends on clinical assessment.

- [ ] **Step 4: Implement the shared renderer**

Render semantic breadcrumbs, one H1, section H2s, visible FAQs, review label, clinic/location block, appointment and WhatsApp actions, and related-service links. Feed the exact title, description, canonical and visible content into metadata/schema components.

- [ ] **Step 5: Register all five routes**

Add explicit static routes before `/services/:slug` so CMS slug handling cannot shadow them.

- [ ] **Step 6: Add component assertions**

Render `/services/sunat-kuantan` in the test router and assert:

```tsx
expect(screen.getByRole('heading', { level: 1, name: /sunat di kuantan/i })).toBeInTheDocument();
expect(screen.getByRole('heading', { name: 'Sunat bayi' })).toBeInTheDocument();
expect(screen.getByRole('heading', { name: 'Sunat kanak-kanak' })).toBeInTheDocument();
expect(screen.getByRole('heading', { name: 'Sunat dewasa' })).toBeInTheDocument();
expect(screen.getByRole('link', { name: /buat temujanji/i })).toHaveAttribute('href', '/appointment');
```

- [ ] **Step 7: Run focused tests**

Run:

```powershell
npm.cmd test -- --run src/test/local-service-pages.test.tsx src/test/serviceSlugMap.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add src/content/localServicePages.ts src/pages/LocalServicePage.tsx src/test/local-service-pages.test.tsx src/App.tsx
git commit -m "feat: add Kuantan local service hubs"
```

---

### Task 4: Strengthen homepage and internal linking

**Files:**

- Modify: `src/pages/Index.tsx`
- Modify: `src/pages/Services.tsx`
- Modify: `src/components/layout/Footer.tsx`
- Modify: `index.html`
- Test: `src/test/local-service-pages.test.tsx`
- Test: `src/test/home-defaults.test.ts`

**Interfaces:**

- Consumes: `LOCAL_SERVICE_PAGES`, route metadata and clinic schema from earlier tasks.
- Produces: crawlable `<a>` links from homepage, services overview and footer to every service hub.

- [ ] **Step 1: Extend tests to require discoverable links**

Add assertions that the homepage/services/footer route models contain all five canonical service paths and that the homepage title is:

```text
Klinik Awfa KotaSAS | Klinik Keluarga di Kuantan
```

- [ ] **Step 2: Run tests and confirm RED**

Run:

```powershell
npm.cmd test -- --run src/test/local-service-pages.test.tsx src/test/home-defaults.test.ts
```

Expected: FAIL because the links/entity copy are missing.

- [ ] **Step 3: Update homepage entity signals**

Ensure visible homepage copy naturally includes “Klinik Awfa KotaSAS, Kuantan,” the exact public address, telephone and operating hours. Add a compact “Rawatan di Klinik Awfa” section linking to the five hubs. Preserve the current visual hierarchy and bilingual CMS content.

- [ ] **Step 4: Add services and footer links**

Add descriptive link text such as “Rawatan telinga di Kuantan,” not generic “Learn more.” Keep footer links limited to the five hubs plus core public pages.

- [ ] **Step 5: Repair static document fallbacks**

Set static homepage title/description/Open Graph/Twitter values to the approved homepage metadata. Use a local, stable social image URL on `klinikawfa.com`, not the current external upload URL containing spaces. Keep the homepage canonical as a fallback; client metadata must replace it on route navigation.

- [ ] **Step 6: Run focused tests**

Run:

```powershell
npm.cmd test -- --run src/test/local-service-pages.test.tsx src/test/home-defaults.test.ts src/test/general-pages.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/pages/Index.tsx src/pages/Services.tsx src/components/layout/Footer.tsx index.html src/test/local-service-pages.test.tsx src/test/home-defaults.test.ts
git commit -m "feat: strengthen Klinik Awfa homepage entity signals"
```

---

### Task 5: Repair robots and sitemap production signals

**Files:**

- Modify: `public/robots.txt`
- Modify: `public/sitemap.xml`
- Create: `src/test/seo-static-files.test.ts`

**Interfaces:**

- Consumes exact public routes from Tasks 1 and 3.
- Produces production crawl directives and a sitemap containing only canonical public URLs.

- [ ] **Step 1: Write failing static-file tests**

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const robots = readFileSync('public/robots.txt', 'utf8');
const sitemap = readFileSync('public/sitemap.xml', 'utf8');

describe('production SEO static files', () => {
  it('uses only the canonical production host', () => {
    expect(robots).toContain('Sitemap: https://klinikawfa.com/sitemap.xml');
    expect(sitemap).not.toContain('lovable.app');
  });

  it.each(['/clinic', '/staff', '/editor', '/auth', '/tv'])(
    'keeps %s out of crawl targets',
    (prefix) => expect(robots).toContain(`Disallow: ${prefix}`),
  );

  it.each([
    '/services/rawatan-telinga-kuantan',
    '/services/minor-surgery-kutil-kuantan',
    '/services/swab-test-demam-kuantan',
    '/services/pengurusan-berat-badan-kuantan',
    '/services/sunat-kuantan',
  ])('submits %s in the sitemap', (path) => {
    expect(sitemap).toContain(`<loc>https://klinikawfa.com${path}</loc>`);
  });
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run:

```powershell
npm.cmd test -- --run src/test/seo-static-files.test.ts
```

Expected: FAIL because both files still point to `klinikawfa.lovable.app` and do not include the new hubs.

- [ ] **Step 3: Update `robots.txt`**

Allow public crawling, disallow operational prefixes, and use:

```text
Sitemap: https://klinikawfa.com/sitemap.xml
```

Do not rely on robots alone for privacy or deindexing; Task 1 supplies meta robots protection.

- [ ] **Step 4: Rebuild `sitemap.xml`**

Include only `/`, public overview pages, five service hubs, doctors, appointment, gallery, published health-tip index and other confirmed public canonical pages. Exclude all operational, auth, preview, draft and dynamic unpublished URLs. Use `2026-07-27` as `lastmod` for pages changed by this deployment.

- [ ] **Step 5: Run static-file tests**

Run:

```powershell
npm.cmd test -- --run src/test/seo-static-files.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add public/robots.txt public/sitemap.xml src/test/seo-static-files.test.ts
git commit -m "fix: point search crawlers to production SEO routes"
```

---

### Task 6: Full verification, Search Console handoff and deployment

**Files:**

- Create: `docs/seo/google-search-console-handoff.md`
- Modify only if verification finds a scoped SEO defect.

**Interfaces:**

- Consumes all earlier deliverables.
- Produces a verified GitHub deployment and non-technical owner checklist.

- [ ] **Step 1: Write the owner handoff**

Document these exact actions:

1. Open Google Search Console and check whether `https://klinikawfa.com/` or the domain property is verified.
2. If absent, add a Domain property and complete the DNS TXT verification at the domain host.
3. Submit `https://klinikawfa.com/sitemap.xml`.
4. Inspect and request indexing for `/` and each of the five service hubs after deployment.
5. Check the Google-selected canonical for `/`.
6. In Google Business Profile, set the website to `https://klinikawfa.com/`, align name/address/phone/hours, add the relevant services and use `/appointment` as the appointment link.
7. Update the old Canva site to link prominently to the canonical domain or retire it if ownership permits.
8. Record a baseline for the approved keyword themes and review at 2, 4, 8 and 12 weeks.

- [ ] **Step 2: Run the complete relevant test suite**

Run:

```powershell
npm.cmd test -- --run src/test/seo-routes.test.ts src/test/clinic-schema.test.ts src/test/local-service-pages.test.tsx src/test/seo-static-files.test.ts src/test/general-pages.test.tsx src/test/home-defaults.test.ts src/test/website-cms-domain.test.ts src/test/serviceSlugMap.test.ts
```

Expected: all selected test files PASS with zero failed tests.

- [ ] **Step 3: Run production build and diff checks**

Run:

```powershell
npm.cmd run build
git diff --check
git status --short
```

Expected: build exits 0; no whitespace errors; only intended SEO changes plus pre-existing unrelated user changes remain.

- [ ] **Step 4: Inspect built static files**

Run:

```powershell
Get-Content dist/robots.txt
Get-Content dist/sitemap.xml
Select-String -Path dist/index.html -Pattern 'Klinik Awfa KotaSAS|canonical|og:title'
```

Expected: production host only, corrected homepage fallbacks and all five hubs in the sitemap.

- [ ] **Step 5: Commit handoff documentation**

```powershell
git add docs/seo/google-search-console-handoff.md
git commit -m "docs: add Google Search Console SEO handoff"
```

- [ ] **Step 6: Push the verified branch**

```powershell
git push origin main
```

Expected: push succeeds and GitHub reports the new main commit.

- [ ] **Step 7: Verify production after deployment**

Check:

```text
https://klinikawfa.com/
https://klinikawfa.com/robots.txt
https://klinikawfa.com/sitemap.xml
https://klinikawfa.com/services/rawatan-telinga-kuantan
https://klinikawfa.com/services/minor-surgery-kutil-kuantan
https://klinikawfa.com/services/swab-test-demam-kuantan
https://klinikawfa.com/services/pengurusan-berat-badan-kuantan
https://klinikawfa.com/services/sunat-kuantan
```

Verify HTTP success, page title, description, canonical, robots meta, H1, internal links and JSON-LD on each public page. Verify `/clinic/queue`, `/staff/dashboard`, `/editor/home`, `/auth` and `/tv` carry `noindex,nofollow`.

- [ ] **Step 8: Report the deployment truthfully**

Report the pushed commit, tested routes, production deployment status, and any Search Console or Business Profile steps that still require the owner's Google account. Do not claim rankings have improved until Search Console data shows it.

