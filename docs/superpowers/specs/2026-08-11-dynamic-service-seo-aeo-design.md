# Dynamic Service SEO and AEO Design

## Objective

Ensure every service page created in the Website Editor automatically receives the same SEO editing capability as existing service pages, plus answer-engine optimization (AEO). Generated content remains a draft until an authorized editor reviews and publishes it.

## User experience

1. An authorized editor creates a service page.
2. The page and its SEO/AEO registry record are created together.
3. The system requests Malay and English SEO/AEO suggestions using the new page's title, description, service details, and URL.
4. Generated suggestions are saved as a draft; they do not alter public metadata until published.
5. The new service appears immediately in Website Editor > Services with both `Edit content` and `Edit SEO` actions.
6. `Edit SEO` opens the same editor and preview workflow used by existing service pages.
7. If generation fails, page creation still succeeds. The SEO editor remains available with blank/default fields and a retry action.

## SEO fields

Each dynamic service supports the existing bilingual search and social metadata:

- Malay and English SEO titles
- Malay and English meta descriptions
- canonical service URL
- search keywords and local intent
- Open Graph title, description, and image
- social preview data
- indexability and publication state

Existing canonical service pages retain their current identifiers, content, and behavior.

## AEO fields and behavior

AEO is generated from the same service content and reviewed in the same draft workflow. It includes:

- a concise Malay and English direct-answer summary suitable for search answer panels and AI assistants
- common patient questions and medically responsible answers in both languages
- local-intent questions where relevant, such as service availability in Kuantan or KotaSAS
- FAQ structured data derived only from approved FAQ entries
- MedicalClinic/MedicalProcedure or appropriate service structured data using verified clinic and service facts
- consistent service name, clinic name, location, canonical URL, and language signals

Generated answers must not invent prices, guarantees, clinical outcomes, doctor availability, accreditations, or treatment suitability. Medical wording must remain informational and direct patients to clinical assessment where appropriate.

On publication, the public service page emits valid JSON-LD for the approved FAQ and service data. Draft AEO content is never exposed publicly.

## Data model

`website_service_seo` becomes the registry for both fixed and dynamic service pages. Dynamic records link to `clinic_services` through a nullable `service_id` with a unique constraint and cascade deletion. Existing fixed records remain valid without requiring a service link.

The SEO payload schema is extended with versioned AEO fields rather than creating a second disconnected editor. Drafts continue to use the existing website-content draft mechanism. Published payloads remain independently recoverable from drafts.

A migration backfills registry rows for existing dynamic service pages that do not yet have one, including the current ear microsuction landing page. The backfill is idempotent.

## Creation and deletion consistency

The guarded landing-page save function creates the service and SEO registry row transactionally. AI generation happens after that transaction because it is an external operation. A generation failure therefore cannot remove or corrupt the service page.

Deleting a dynamic service removes its registry row and associated drafts. Protected core service pages keep their existing server-side deletion guard.

## Application changes

- Generalize service SEO paths to accept validated `/services/<slug>/` paths rather than only the hardcoded list.
- Resolve editor targets by database ID for dynamic pages, while retaining the fixed registry as a compatibility fallback.
- Merge fixed and dynamic entries in the Website Editor service list.
- Show `Edit SEO` for every dynamic service immediately after creation.
- Extract the existing AI generation call into a shared operation used by page creation and the editor retry action.
- Extend the generator contract and editor form for bilingual AEO summaries, FAQs, and structured-data previews.
- Resolve public metadata and structured data for arbitrary published dynamic service paths.

## Authorization and security

The feature uses the same Website Editor authorization as current service SEO management. Database functions verify the caller server-side. Row-level security continues to prevent unauthorized reads or writes to drafts and unpublished SEO/AEO data.

Only sanitized, schema-validated JSON-LD is rendered. User-entered or generated HTML is never inserted into structured data without validation. Canonical paths are normalized and constrained to the service namespace.

## Failure handling

- Page created, AI unavailable: keep page and registry; display a non-blocking generation warning and retry control.
- Invalid AI response: reject the response, retain the previous draft, and show field-level validation feedback.
- Draft save failure: do not publish partial data.
- Publish failure: retain the draft and current published version.
- Deleted page: prevent orphan registry rows and drafts through database cleanup.

## Verification

Automated coverage will verify:

- new dynamic pages receive a registry row and immediate `Edit SEO` action
- AI results are saved as drafts, never auto-published
- generation failure does not block page creation
- bilingual SEO and AEO payload validation
- FAQ and medical-service JSON-LD output only from published data
- dynamic metadata path resolution
- backfill behavior and idempotency
- guarded deletion and draft cleanup
- unchanged behavior for existing canonical pages

Before deployment, run focused unit/integration tests, migration tests, the production build, database lint/advisor checks where available, and a live Website Editor creation-to-publication smoke test.
