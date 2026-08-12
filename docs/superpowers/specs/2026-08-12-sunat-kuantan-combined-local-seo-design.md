# Sunat Kuantan Combined Local SEO Design

**Date:** 2026-08-12

**Status:** Approved

## Objective

Improve Klinik Awfa's visibility for searches such as `klinik sunat kuantan`, `sunat bayi kuantan`, `sunat kanak-kanak kuantan`, and `sunat dewasa kuantan` by aligning the public website, Google Business Profile, Google Search Console, and reputation signals.

Rankings cannot be guaranteed because Google also considers the searcher's location and competing businesses. Success means stronger indexation, relevance, prominence, qualified traffic, and appointment enquiries over an initial 8–12 week measurement period.

## Current Findings

- `https://klinikawfa.com/services/sunat-kuantan/` returns HTTP 200.
- The page permits indexing and has a self-referencing canonical URL.
- Its title and description already mention sunat services for babies, children, and adults in Kuantan.
- The canonical URL is present in `sitemap.xml`, and `robots.txt` does not block it.
- The initial server response contains metadata but an empty application root; the substantive service copy is rendered by JavaScript.
- Google search currently surfaces Klinik Awfa's homepage, including circumcision-related reviews, but the dedicated Sunat page is not visibly established for the target query.
- The sitemap entry for this page has not been refreshed to reflect the most recent content changes.
- The clinic has owner access to its Google Business Profile.

The technical foundation is therefore partially correct. The remaining work is to improve crawl confidence, page-level relevance, internal discovery, Business Profile alignment, and local prominence.

## Chosen Approach

Use one combined local SEO programme rather than treating the website and Google Business Profile separately:

1. Strengthen and prerender the canonical Sunat landing page.
2. Connect the page through prominent, contextual internal links.
3. Align the Google Business Profile's services, links, media, and posts with the page.
4. Introduce a policy-compliant review request workflow.
5. measure indexing, search visibility, and patient enquiries.

Do not create thin pages for every keyword variation. One substantial Sunat hub will cover babies, children, and adults in clearly separated sections.

## Website Design

### Search intent and content

The canonical page remains `/services/sunat-kuantan/` and targets the broad clinic-level query while serving three distinct intents:

- Sunat bayi in Kuantan
- Sunat kanak-kanak in Kuantan
- Sunat dewasa in Kuantan

The visible page will contain:

- A title and H1 that clearly combine Klinik Awfa, Sunat, and Kuantan without mechanical repetition.
- A concise introduction identifying the clinic's KotaSAS location.
- Separate baby, child, and adult sections.
- Doctor assessment, suitability, preparation, procedure-day expectations, aftercare, and warning signs.
- A visible clinic address, opening hours, telephone, WhatsApp, appointment action, and map link.
- A clinician/clinic review attribution and current review date.
- Medically responsible FAQs that do not guarantee a particular technique, recovery time, or outcome.
- Related links to doctors, appointment, location, minor procedures, and the Services overview.

Claims about price, anaesthesia, technique, clinician credentials, availability, or outcomes will only be published when verified by Klinik Awfa.

### Rendering and crawlability

The production build will emit meaningful HTML for the Sunat route, including the H1, introduction, main section headings, key clinic details, internal links, and structured data. Google will not have to execute the full clinic application merely to discover the primary content.

The existing client application remains responsible for interaction after hydration. Prerendering is restricted to public routes and does not expose authenticated clinic data.

### Metadata and structured data

The page will provide:

- A unique Malay-first title and description.
- Self-referencing canonical URL.
- Open Graph and social metadata.
- `MedicalClinic` referencing the same stable Klinik Awfa entity used elsewhere.
- `Service` for circumcision assessment and care in Kuantan.
- `WebPage` and `BreadcrumbList`.
- FAQ structured data only for questions visibly rendered on the page.

Schema will not contain fabricated ratings, prices, availability, medical outcomes, or credentials.

### Internal linking

Add contextual links to the Sunat page from:

- Homepage services or minor-procedure content.
- Services overview.
- Relevant doctor profile content where the service is genuinely offered.
- Minor-procedure page.
- Suitable health content published later.

Link wording should be descriptive, such as `Perkhidmatan sunat di Kuantan`, rather than generic `Read more` text.

### Sitemap

The sitemap generator will use the service record's publication or update timestamp. Publishing Sunat content or SEO changes must refresh its `lastmod` value automatically.

## Google Business Profile Design

The clinic owner will update or verify:

- Exact business name: `Klinik Awfa` or the verified official listing name, without keyword stuffing.
- Website: `https://klinikawfa.com/`.
- Appointment link: the canonical appointment page.
- Address, map pin, telephone, and opening hours matching the website exactly.
- The most accurate available clinic categories.
- A dedicated Sunat/circumcision service entry using factual wording and linking to `/services/sunat-kuantan/` when Google permits a service URL.
- Current, authentic photos of the clinic and appropriate service environment, without exposing patients or private information.
- Periodic factual posts about consultation, preparation, appointment availability, and aftercare education.

The business name will not be changed to include search keywords unless they form part of the clinic's real-world registered and displayed name.

## Review Workflow

After an eligible completed circumcision visit, authorised staff may send the clinic's standard Google review link. The request must:

- Ask for an honest review, not specifically a positive review.
- Avoid incentives, gifts, discounts, or review gating.
- Never disclose the patient's treatment publicly.
- Avoid pre-written keyword-heavy review text.
- Be sent only through approved clinic communication channels.

Existing genuine reviews may naturally help Google understand the service, but the website will not create fabricated review markup.

## Search Console and Measurement

### Launch checks

- Confirm the live URL returns HTTP 200 and is not blocked or marked `noindex`.
- Validate the self-canonical and rendered HTML.
- Submit the refreshed sitemap.
- Inspect the canonical Sunat URL and request indexing once after deployment.
- Confirm Google-selected canonical when crawl data becomes available.

### Baseline and reporting

Record a baseline before changes and report monthly:

- Indexed status of `/services/sunat-kuantan/`.
- Impressions, clicks, CTR, and average position for the four target query groups.
- Queries and pages that lead to the Sunat page.
- Google Business Profile calls, website clicks, direction requests, and appointment actions.
- Organic appointment and WhatsApp actions attributed to this landing page where consented analytics permit measurement.
- Review count, rating, and review recency, without setting a target that encourages policy violations.

Search Console data should be treated as trend data. Daily personalized searches are not an authoritative ranking report.

## Error Handling and Safety

- Missing CMS SEO fields fall back to approved route-specific metadata.
- Invalid canonical or social URLs fall back to the canonical Sunat route.
- Draft or unpublished pages never enter the sitemap.
- Missing structured-data fields are omitted rather than guessed.
- Failed analytics or Business Profile integrations must not block the public page.
- Medical copy must remain educational and must direct urgent or unsuitable cases to appropriate assessment.

## Testing and Verification

Automated tests will verify:

- Correct title, description, canonical, and index directives.
- Meaningful prerendered page content.
- Schema consistency with visible content.
- Internal links to and from the Sunat page.
- Sitemap inclusion and current `lastmod` behaviour.
- No duplicate Sunat canonical pages.
- No private clinic data included in generated public HTML.

Production verification will include:

- HTTP and metadata inspection.
- Mobile and desktop rendering checks.
- Structured-data validation.
- Sitemap fetch and URL inspection.
- Link checks from the homepage, Services, doctor, and minor-procedure pages.
- A four-week and twelve-week performance review.

## Delivery Boundaries

Included: repository changes, deployment, public-page technical SEO, Google Business Profile checklist, Search Console validation workflow, and measurement design.

Excluded: paid advertising, purchasing backlinks, fake or incentivised reviews, changing the real business name for keywords, guaranteed ranking positions, and unverified medical or commercial claims.
