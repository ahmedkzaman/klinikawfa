# Bilingual Service-Page AEO Design

## Goal

Make every public service landing page useful and understandable to patients and eligible for accurate discovery by search engines and AI answer systems. The implementation covers Malay and English content and reuses the existing service-page and local-landing-page architecture.

## Scope

- Main service routes under `/services/:slug`.
- Existing local landing pages for location- and procedure-focused services.
- Homepage service links and internal links between related public pages.
- Shared metadata and structured-data generation.
- Public sitemap and robots configuration.

Clinic editor workflows, clinical advice generation, paid advertising, and direct registration with individual AI providers are out of scope. No provider guarantees inclusion or citation.

## Content model

Each service page will expose validated Malay and English values for:

- Page title and meta description.
- Introductory answer describing the service and its purpose.
- Suitable patient/use cases.
- What to expect during the visit.
- Preparation and follow-up guidance when applicable.
- Safety/urgent-care note where clinically appropriate.
- Booking/contact call to action.
- Visible FAQs with question and answer pairs.

Content must be factual, clinic-specific, and free of unsupported promises, fabricated prices, credentials, or outcomes. The visible content and JSON-LD must be derived from the same source values.

## Page and SEO behavior

- Preserve the existing URL and trailing-slash behavior.
- Emit one descriptive H1 and ordered H2 sections.
- Keep important content in the initial public render; do not require authentication or an interaction to discover it.
- Generate canonical URL, language-aware title/description, Open Graph image, and descriptive image alt text.
- Link to the services index, relevant related services, contact/appointment path, and clinic identity pages.
- Include every indexable service URL in `public/sitemap.xml` and keep `public/robots.txt` pointed at it.

## Structured data

Use the existing schema components and extend them only where needed:

- `MedicalClinic` / `LocalBusiness` for clinic identity, address, phone, hours, and URL.
- `MedicalWebPage` for the page itself.
- `Service` for the specific offering and provider/clinic relationship.
- `FAQPage` only for FAQs visibly rendered on the page.
- `BreadcrumbList` for route context.
- `ImageObject` when a service hero image is present.

JSON-LD must be valid, use absolute URLs, avoid duplicate conflicting entities, and never expose private clinic or patient data.

## Implementation boundaries

Prefer shared helpers and existing CMS/content types over page-specific conditionals. The special local-page content should remain declarative. Service data fetching, rendering, metadata, schema generation, and sitemap entries should each have clear ownership so a content update cannot silently break routing.

## Error handling

- A missing optional FAQ or image must not prevent a page from rendering.
- A malformed service record must fall back to safe metadata and be visible in development/test diagnostics.
- Public pages must show a useful title and clinic contact path even when optional content is unavailable.

## Verification

- Unit-test content/schema generation for Malay and English pages.
- Check that FAQ schema matches visible FAQ text.
- Verify all service routes and sitemap URLs resolve.
- Run lint/type checks where configured and a production build.
- Inspect representative desktop and mobile pages for overflow, missing text, and image failures.
- Confirm the GitHub Actions security and Pages workflows complete successfully before reporting deployment.

## Acceptance criteria

1. Every existing public service landing page has bilingual, answer-focused content.
2. Every indexable page has accurate metadata, canonical URL, breadcrumbs, and service/clinic schema.
3. FAQ schema exists only where the FAQ is visible and matches it exactly.
4. All public service URLs are crawlable and listed in the sitemap.
5. Existing editor, routing, and service-page behavior remains functional.
6. Build/tests pass and production deployment is verified from GitHub Actions.
