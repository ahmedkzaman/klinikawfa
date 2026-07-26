# Klinik Awfa Local SEO Design

**Date:** 2026-07-26  
**Status:** Approved direction; awaiting written-spec review

## Objective

Make `https://klinikawfa.com/` the clearest authoritative result for the Klinik Awfa brand and improve organic visibility for relevant KotaSAS and Kuantan clinic and treatment searches.

The initial keyword themes are:

- Klinik Awfa
- Klinik KotaSAS
- Klinik Kuantan
- Rawatan telinga Kuantan
- Surgery / minor surgery Kuantan
- Kutil Kuantan
- Swab test Kuantan
- Demam Kuantan
- Kurus / medical weight management Kuantan
- Circumcision / sunat bayi Kuantan
- Circumcision / sunat kanak-kanak Kuantan
- Circumcision / sunat dewasa Kuantan

Rankings cannot be guaranteed. Success means giving Google consistent, crawlable, medically responsible signals and measuring whether impressions, clicks, branded position, and local discovery improve.

## Current Findings

- Google already indexes `klinikawfa.com`, but a doctors page may surface instead of the homepage for the clinic name.
- Search results also contain an older Klinik Awfa Canva site and similarly named Klinik Aufa properties, diluting brand/entity clarity.
- The application already supports per-page metadata and has `robots.txt` and `sitemap.xml`.
- The static document currently contains homepage metadata, canonical and location tags, but the public website is a client-rendered React application and needs a complete crawlability audit.
- The same domain contains large authenticated clinic, staff and editor applications. These private routes must not compete with public pages in the search index.
- The clinic controls a Google Business Profile, but Search Console ownership is not yet confirmed.

## Chosen Approach

Use a combined technical and content strategy:

1. Strengthen the homepage as the canonical entity page for Klinik Awfa KotaSAS, Kuantan.
2. Publish a small set of substantial service hubs based on distinct patient intent.
3. Improve crawlability, indexing controls, structured data, sitemap coverage and internal linking.
4. Align the website with the clinic's Google Business Profile and Search Console.
5. Measure progress rather than creating thin pages for every keyword variation.

This avoids keyword-stuffed doorway pages while giving each genuinely different treatment enough focused, useful information.

## Information Architecture

### Homepage

The homepage targets the brand and broad local intent:

- Klinik Awfa
- Klinik Awfa KotaSAS
- Klinik KotaSAS
- Klinik Kuantan

Its title, main heading, introduction, address, phone, opening hours and structured data must all identify the same clinic and location consistently.

### Service hubs

Create or strengthen five public, indexable service pages:

1. **Ear treatment in Kuantan**
   - Ear assessment, wax-related care, ear irrigation or suction only where clinically offered, red flags and when referral may be required.
2. **Minor surgery and wart treatment in Kuantan**
   - Minor procedures, wart assessment/removal, suitability, consultation and aftercare. Avoid implying that all lesions are suitable for immediate removal.
3. **Fever and swab testing in Kuantan**
   - Fever assessment and available respiratory swab testing. Avoid guaranteeing a diagnosis from a test alone.
4. **Medical weight management in Kuantan**
   - Doctor-led assessment, eligibility, monitoring and realistic expectations. Avoid guaranteed weight-loss claims.
5. **Circumcision in Kuantan**
   - One authoritative hub with clearly separated sections for babies, children and adults, including suitability, preparation, procedure-day expectations, aftercare and warning signs.

Malay is the primary search language. Natural English equivalents may be included for bilingual users, without duplicating near-identical pages.

### Supporting public pages

Doctors, contact/location, services overview, gallery and clinically reviewed health articles should link naturally to the relevant service hubs. The old Canva site should be updated, redirected where possible, or clearly point to the canonical domain.

## Page Content Contract

Every indexable page must contain:

- A unique title and meta description.
- One clear H1 matching the page's actual purpose.
- A canonical URL on `https://klinikawfa.com`.
- Useful Malay-first copy written for patients rather than search engines.
- Klinik Awfa, KotaSAS and Kuantan references where contextually natural.
- Clear service scope and non-misleading medical wording.
- Doctor/clinic trust signals and a visible last-reviewed date where clinical content is present.
- Address, contact or appointment action.
- Links to the homepage, related services and doctor/location pages.
- Suitable social-sharing metadata.
- Structured data that matches visible content.

Keyword variants must not be repeated mechanically. “Surgery Kuantan” will be addressed using the locally meaningful phrase “minor surgery / pembedahan kecil di Kuantan.”

## Technical SEO Design

### Crawl and index controls

- Audit `robots.txt` and explicitly disallow crawling of authenticated application areas where appropriate.
- Apply `noindex, nofollow` metadata to authentication, staff, clinic, editor, TV/caller and other operational routes.
- Ensure public pages remain indexable.
- Ensure unknown or removed public URLs produce a true not-found experience and are not treated as valid duplicate pages.

### Canonicals and metadata

- Make the homepage self-canonical.
- Generate route-appropriate canonicals for all public pages.
- Prevent the static homepage canonical from remaining on client-side public routes after navigation.
- Use stable titles that lead with the clinic/service and location, not generic marketing copy.

### Sitemap

- Include only canonical, indexable public URLs.
- Include service hubs, doctors, core location/contact pages and published health articles.
- Exclude protected, preview, draft, authentication and operational routes.
- Use trustworthy last-modified values where available.

### Structured data

- Add one canonical `MedicalClinic`/`LocalBusiness` entity for Klinik Awfa with the clinic's exact public name, canonical URL, telephone, address, geo coordinates and opening hours.
- Connect the homepage and service pages to that entity using stable identifiers.
- Add `WebSite`, `WebPage`, breadcrumbs and service data where applicable.
- Add FAQ structured data only when the same questions and answers are visibly rendered and eligible under Google's current policies.
- Do not add fabricated ratings, prices, accreditations or medical claims.

### Rendering and discoverability

- Verify the production HTML and Google's rendered view expose meaningful public content and links.
- If important public content is not reliably discoverable from the client-rendered application, introduce a build-time prerender for the limited public route set rather than rewriting the operational application.

## Local Entity Alignment

The Google Business Profile must use:

- The exact clinic name used on the website.
- `https://klinikawfa.com/` as its website.
- The same address, phone and opening hours as the homepage.
- The most accurate primary and secondary categories.
- Relevant service entries and appointment link.

The implementation handoff will include steps to verify Search Console, submit the sitemap, inspect the homepage, request indexing after deployment and monitor indexing issues.

## Measurement

Baseline and monitor:

- Homepage indexed status and Google-selected canonical.
- Branded query position for “Klinik Awfa.”
- Impressions, clicks, CTR and average position for each approved keyword theme.
- Google Business Profile website actions, calls and direction requests.
- Indexed public page count versus submitted sitemap count.
- Organic appointment/WhatsApp conversions where consented analytics support them.

Evaluate technical indexing within days to weeks and ranking trends over several weeks to months. Avoid reacting to daily fluctuations.

## Error Handling and Safety

- Missing CMS SEO fields fall back to approved route-specific metadata, not blank or generic values.
- Invalid canonical URLs fall back to the domain's canonical route.
- Draft/unpublished resources never enter the sitemap.
- Missing structured-data fields are omitted rather than guessed.
- Medical pages must not promise outcomes, misrepresent clinician qualifications or imply emergency capability beyond the clinic's actual service.

## Testing and Verification

Automated checks will cover:

- Homepage and service metadata.
- Correct canonical generation.
- `noindex` behavior for protected and operational routes.
- Sitemap inclusion/exclusion rules.
- Structured-data schema shape and consistency with visible clinic data.
- Internal links to every service hub.
- No duplicate titles across the targeted public pages.

Production verification will cover:

- `robots.txt` and `sitemap.xml` returning successfully.
- Public pages loading without authentication.
- Protected routes excluded from the sitemap and carrying noindex protection.
- Rich Results/schema validation where applicable.
- Search Console URL inspection and sitemap submission.
- A post-deployment crawl of the public route set.

## Delivery Boundaries

This project includes repository changes, deployment-ready SEO content architecture and a Search Console/Business Profile checklist. It does not include paid search advertising, purchasing backlinks, fake reviews, guaranteed rankings or medical claims not confirmed by Klinik Awfa.

