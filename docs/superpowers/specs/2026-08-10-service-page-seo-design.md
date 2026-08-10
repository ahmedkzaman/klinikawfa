# Service Page SEO Management Design

Date: 2026-08-10
Status: Approved design, pending implementation

## Objective

Give authorized website editors one safe place to manage search and social metadata for every canonical public service page on klinikawfa.com. The feature must support separate Malay and English metadata, AI-assisted drafting, an explicit draft/publish workflow, correct canonicalization, and safe fallbacks when custom metadata is unavailable.

## Scope

The first release covers these eight canonical service pages:

1. `/services/rawatan-umum/`
2. `/services/prosedur-kecil/`
3. `/services/pemeriksaan-kesihatan/`
4. `/services/rawatan-telinga-kuantan/`
5. `/services/minor-surgery-kutil-kuantan/`
6. `/services/swab-test-demam-kuantan/`
7. `/services/pengurusan-berat-badan-kuantan/`
8. `/services/sunat-kuantan/`

Service aliases that resolve to one of the first three category pages will not receive independent SEO records. They will continue to declare the canonical category URL so Google does not treat identical content as separate pages.

This project does not create separate indexable `/en/` URLs. The existing site uses one URL for both languages, with Malay as its default crawlable presentation. English metadata will be applied when the visitor selects English. A future multilingual URL and `hreflang` project can make both language versions independently indexable.

## Recommended Architecture

### Published SEO registry

Create `public.website_service_seo`, with one row per canonical service path. Each row has:

- UUID primary key;
- unique canonical path;
- editor-facing Malay and English labels;
- Malay and English focus phrases;
- validated Malay and English SEO JSON;
- website revision;
- created, updated, published, and publishing-actor metadata.

The SEO JSON follows the existing `SeoFields` contract:

- search title;
- search description;
- social title;
- social description;
- social image media ID and resolved public path;
- index flag;
- follow flag.

The canonical URL is derived from the registry path rather than accepted as an arbitrary editor value. This prevents accidental cross-page canonicalization.

### Draft and publication lifecycle

Add `service_seo` as a supported website resource type in the existing website CMS draft, version, audit, and publication system.

- **Save draft** writes only to `website_content_drafts`.
- **Publish SEO** validates the expected revision and updates `website_service_seo` atomically.
- Published revisions are retained in the existing version history.
- Stale revisions fail without overwriting a newer edit.
- AI generation changes only the client-side draft until the editor explicitly saves or publishes.

### Access control

- Public and anonymous visitors may select published SEO rows only.
- Drafts, versions, media references, and audit records remain private.
- Save and publish functions reuse the existing website-manager authorization path.
- RLS is enabled on every exposed table.
- Update policies include both `USING` and `WITH CHECK` where direct updates are allowed; publication should use the existing guarded publishing RPC rather than broad table update access.
- Authorization must not rely on user-editable `user_metadata`.
- AI generation validates the authenticated user server-side before calling OpenAI.

## Editor Experience

`/editor/services` will list all eight canonical pages. The three CMS-backed category pages retain their content-edit action; the five local landing pages receive an SEO-edit action. Every row shows whether custom SEO is published and the current revision.

The SEO workspace contains language tabs for Malay and English and provides:

- target search phrase;
- search title with character guidance;
- search description with character guidance;
- social title and description;
- social image selection;
- index and follow controls;
- a read-only canonical URL;
- Google search preview;
- social-sharing preview;
- **Generate SEO with AI**;
- **Save draft** and **Publish SEO**.

AI generation uses the registered page content, service title, headings, KotaSAS/Kuantan context, and optional focus phrase. It returns both language variants as validated structured data. Generated text is never published automatically and current form values remain unchanged when generation fails or returns incomplete data.

Google ignores the legacy `meta keywords` tag, so the focus phrase is an editorial and AI-generation input rather than a `meta name="keywords"` output.

## Runtime Metadata Flow

Both `ServiceDetail` and `LocalServicePage` resolve their canonical path and request its published SEO row.

1. Select the Malay or English SEO object according to the current language.
2. Derive a fallback title and description from the existing page content.
3. Merge custom SEO over the fallback.
4. Pass the result to `SEOHead` for title, description, robots, canonical, Open Graph, Twitter, and social image tags.
5. Pass the same resolved title and description to WebPage and Service structured data so visible metadata and JSON-LD do not contradict each other.
6. If the SEO request fails or no published record exists, render the current automatic metadata without blocking the page.

Malay remains the default for static pre-rendering and crawler-facing HTML. English metadata updates when English mode is active.

### GitHub Pages static metadata synchronization

GitHub Pages serves copied static HTML files before the React application runs. The current deployment script stamps hard-coded metadata into those files, so runtime database changes alone would not reliably update search and social crawlers.

The deployment SEO preparation script will therefore read the public published service SEO registry during a Pages build and stamp its Malay title, description, robots, canonical, and social metadata into each canonical service HTML file. Existing checked-in metadata remains the fail-safe when the registry is empty or Supabase is temporarily unavailable.

The Pages workflow will continue to deploy after validated code changes and will also run on an hourly schedule. Publishing SEO updates the JavaScript-rendered metadata immediately; the crawler/social static HTML refreshes on the next successful scheduled deployment, normally within one hour. The editor will display this expectation after publication.

## Sitemap and Canonical Rules

- Include all eight canonical service URLs in `public/sitemap.xml`.
- Exclude category aliases and other duplicate URLs.
- Continue emitting trailing-slash production canonicals.
- Ensure each sitemap URL returns HTTP 200, allows indexing by default, and emits a self-referencing canonical.
- A newly coded canonical service page must also register an SEO row and sitemap entry. Tests will fail if the maintained canonical service-page registry and sitemap diverge.

## AI Edge Function

Add a protected Supabase Edge Function dedicated to service SEO generation.

Input:

- canonical path;
- Malay and English titles/content extracts;
- focus phrases;
- clinic location and brand context.

Output:

- Malay and English search titles;
- Malay and English search descriptions;
- Malay and English social titles;
- Malay and English social descriptions.

The function must:

- authenticate and authorize the caller;
- use the existing server-side OpenAI secret;
- request strict JSON output;
- validate lengths and required fields;
- return a non-2xx response with a safe message on authorization, provider, or validation failure;
- avoid logging patient data or secrets;
- never write or publish SEO records.

## Failure Handling

- SEO load failure: use existing automatic metadata and keep the page available.
- Draft conflict: show a stale-revision message and require reload before retrying.
- AI failure: retain form state and display an actionable error.
- Invalid title, description, media, canonical path, or robots values: block save/publish with field-level validation.
- Missing social image: fall back to the service hero image, then the clinic-wide default image.
- Missing English fields: use Malay metadata as the final fallback.

## Testing and Verification

### Unit and component tests

- SEO payload schema accepts valid bilingual records and rejects unknown or unsafe fields.
- Editor lists exactly the maintained canonical service pages.
- Canonical URL is read-only and derived from the registered path.
- AI suggestions populate the draft only.
- AI failure preserves existing form values.
- Malay/English switching selects the correct metadata.
- Runtime fallback preserves current metadata when no SEO record exists.
- SEO tags are deduplicated during client-side navigation.
- JSON-LD uses the resolved SEO description.

### Database and security tests

- RLS allows anonymous published reads but rejects anonymous/authenticated direct writes.
- Unauthorized users cannot save, publish, or invoke AI generation.
- Draft saves do not change published rows.
- Publication is revision-checked and atomic.
- Media references are validated and kept in sync.
- Database advisors show no new security or performance findings caused by the migration.

### Build and deployment checks

- Every canonical service URL appears once in the sitemap.
- Alias URLs do not appear in the sitemap and emit the correct canonical.
- Pre-rendered HTML contains the published Malay title, description, robots, canonical, social tags, and JSON-LD.
- The build-time metadata loader uses published registry values when available and checked-in fallbacks when the public registry cannot be reached.
- The Pages workflow has an hourly scheduled trigger so published SEO reaches static crawler/social HTML without requiring a code commit.
- All eight canonical URLs return HTTP 200 after deployment.
- Live inspection confirms the expected metadata in both language modes.

## Acceptance Criteria

The work is complete when an authorized editor can open any of the eight service pages in the editor, generate bilingual SEO suggestions, modify and preview them, save without affecting production, publish intentionally, and observe matching search, social, canonical, robots, sitemap, and structured-data output on the live page. Unauthorized users cannot alter SEO or invoke paid AI generation, and the public page retains safe automatic metadata whenever custom SEO is unavailable.
