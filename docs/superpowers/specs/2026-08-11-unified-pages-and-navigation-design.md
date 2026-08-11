# Unified Pages Catalogue and Navigation Destination Picker

## Problem

The Website Editor's Pages screen reads only `website_pages`. Production currently has no generic page rows, while public content is distributed across fixed application routes, `clinic_services`, blog resources, team profiles, gallery content, and reviews. Navigation accepts a manually typed URL and has no catalogue of valid destinations. As a result, Pages appears empty and editors cannot reliably choose what a menu item should link to.

## Goals

- Show every useful public destination in one Pages catalogue without moving or duplicating content.
- Open each destination in its existing specialised editor.
- Let an editor choose a destination in Navigation instead of memorising URLs.
- Preserve existing public URLs, canonical tags, SEO/AEO data, drafts, and publishing workflows.
- Keep safe custom HTTPS and approved internal URLs available.

## Unified Catalogue

Pages will aggregate read-only summaries from these sources:

1. Fixed public routes such as Home, Services, Doctors, Doctor On Duty, Appointment, Gallery, and Health Tips.
2. Generic CMS pages from `website_pages`.
3. Service landing pages from the service catalogue and lifecycle data.
4. Published or draft blog posts from website resources.

Each item contains a stable catalogue key, bilingual title when available, destination URL, content type, lifecycle status, updated time, and edit URL. Selecting or editing an item routes to its existing editor. Fixed routes without a dedicated editor show their relevant specialised editor where one exists and otherwise provide an open/preview action.

The catalogue supports search, type filtering, status filtering, and sorting. Existing generic-page creation remains available through Add page. Service creation remains in Services and post creation remains in Posts.

## Navigation Destination Picker

Every navigation row keeps its editable URL field and gains a searchable destination selector. The selector uses the same unified catalogue and groups options by Fixed page, Service, Page, and Post. Choosing an option fills the URL and suggested Malay/English labels, but does not overwrite non-empty labels without explicit confirmation. Editors may still type a validated custom internal path or HTTPS URL.

Draft, scheduled, and trashed destinations remain visible with status labels. A navigation draft cannot be published when a visible item targets trashed content. Draft or scheduled targets produce a clear warning because the menu may lead to unavailable content. Existing validation continues to block clinic, staff, JavaScript, protocol-relative, and malformed destinations.

## Data Flow and Boundaries

- A new catalogue API composes summaries from existing APIs and database tables; it does not become a new source of truth.
- Pages renders catalogue summaries but delegates editing and lifecycle actions to the owning content system.
- Navigation stores only its current `href` and labels, so published navigation remains backward compatible.
- Catalogue failures are reported by source. One failing source does not hide otherwise available destinations.

## Testing

- Catalogue unit tests cover aggregation, deduplication, stable URLs, types, statuses, filtering, and edit routes.
- Pages UI tests verify services, posts, fixed routes, and generic pages appear together.
- Navigation tests verify searchable selection, URL/label population, custom URL support, and draft/trash warnings.
- Existing service routing, SEO/AEO, generic page, navigation-schema, build, and security tests must continue to pass.

## Deployment and Verification

No content migration or schema rewrite is required. Deploy the frontend/API composition changes through the existing Security Gate and GitHub Pages workflow, then verify the production Pages catalogue and Navigation picker using the authenticated Website Editor.
