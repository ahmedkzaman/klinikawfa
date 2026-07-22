# Trusted Family Clinic Public Website Redesign

**Status:** Approved design specification  
**Date:** 2026-07-23  
**Product:** Klinik Awfa public website  
**Release model:** One coordinated public-frontend release

## Objective

Redesign the Klinik Awfa public website so it feels calm, credible, warm, and recognisably tied to the clinic rather than to a generic wellness template. The approved direction is **Trusted Family Clinic**.

The redesign changes presentation only. It must preserve all existing wording, content order, bilingual content, URLs, routes, forms, calls to action, CMS data, database connections, authentication behaviour, analytics consent, sanitisation, publishing workflows, and security boundaries.

## Audience and primary job

The primary audience is families and individual patients in and around KotaSAS who need to understand the clinic, assess its credibility, find a suitable service, and contact or book the clinic quickly.

The public website's primary job is to move a visitor from trust and understanding to an appropriate next action: book an appointment, contact the clinic, or use WhatsApp.

## Scope

### Included

- Shared public layout: header, navigation, footer, page container, section headers, closing calls to action, and mobile CTA bar.
- Homepage and all CMS-controlled homepage sections.
- Services listing and service-detail pages.
- Doctors and doctor-on-duty pages.
- Appointment booking.
- Gallery.
- Health-tips listing and article detail.
- General CMS pages under `/pages/:slug`.
- Public authentication, registration, and password-reset presentation where shared public styling applies.
- Public loading, empty, and error states used by those pages.
- Responsive behaviour, keyboard interaction, reduced motion, and visual accessibility.

### Excluded

- `/editor/**` WordPress-style website editor.
- `/staff/**`, `/clinic/**`, and redirected legacy admin screens.
- Operational video-call and queue-TV interfaces.
- Database schema, RLS, Edge Functions, Storage rules, secrets, content migrations, production-data edits, and role changes.
- Rewriting, translating, reordering, or inventing public content.

Operational screens may inherit safe global primitives such as font fallbacks, but they must not receive marketing layouts or structural changes.

## Design principles

1. **Medical credibility without institutional coldness.** Use disciplined spacing, high legibility, strong hierarchy, and restrained colour.
2. **The clinic itself is the visual anchor.** Preserve the existing clinic photograph and logo; do not replace them with generic stock imagery.
3. **Action clarity.** Appointment, WhatsApp, contact, and login actions must remain easy to distinguish and use.
4. **One memorable device.** Spend visual distinctiveness on the clinic-line motif and keep surrounding decoration quiet.
5. **Content remains authoritative.** Layout supports existing Malay and English content instead of changing it to fit the design.
6. **Accessibility is part of the aesthetic.** Focus visibility, contrast, readable line lengths, and generous touch targets are non-negotiable.

## Visual system

### Colour tokens

| Token | Value | Use |
|---|---:|---|
| Awfa Indigo | `#241C6B` | Brand anchor, headings, primary actions, active navigation, clinic line |
| Clinic Ink | `#172033` | Body copy and high-contrast neutral text |
| Clean White | `#F8FAFC` | Primary page surface |
| Mist Blue | `#E9EEF8` | Alternate sections, quiet panels, selected states |
| Restrained Coral | `#C83B4A` | Important or urgent emphasis only |
| WhatsApp Green | `#16A765` | WhatsApp actions only |

Semantic success, warning, destructive, input, border, and focus tokens remain available. Their public values must be aligned to the palette without changing their behavioural meaning.

### Typography

- **Headings and display:** Manrope, with a restrained weight range and intentional tracking.
- **Body and interface copy:** Atkinson Hyperlegible for highly readable Malay and English content.
- **Fallbacks:** local system sans-serif fallbacks must prevent layout failure when web fonts are unavailable.
- Headings use a controlled scale rather than globally oversized text.
- Body text should generally remain between 16px and 18px with comfortable line height and a readable maximum measure.
- Labels and utility copy use size, weight, and spacing consistently; uppercase text is limited to short section labels.

Fonts should be self-hosted where practical. If externally hosted, the existing CSP and privacy constraints must be reviewed before release.

### Layout and spacing

- Use an 8px-derived spacing rhythm.
- Public content containers use consistent maximum widths and responsive gutters.
- Section spacing is generous but not oversized: clear transitions without long empty expanses.
- Use restrained corner radii and quieter shadows.
- Avoid glassmorphism, decorative gradients, floating orbs, glow effects, and repeated pill-shaped labels unless they encode a real state or category.
- Reduce visual duplication by introducing shared public primitives instead of page-specific copies.

### Signature: the clinic line

A precise indigo line connects selected section labels, headings, active navigation, and important card edges. It echoes the geometry and colour of the Klinik Awfa identity without tracing or imitating the logo.

The line is structural, not ornamental. It may indicate active location, connect a label to a heading, or establish alignment. It must not appear around every component.

## Shared component architecture

The redesign should create or consolidate the following bounded public components:

- `PublicHeader`: desktop and mobile navigation, language switcher, user state, and prioritised actions.
- `PublicPageHeader`: consistent interior-page title, optional eyebrow, supporting text, and clinic-line treatment.
- `PublicSectionHeader`: section label, heading, and optional supporting copy.
- `PublicCard`: restrained shared surface variants for service, doctor, article, review, and information cards.
- `PublicClosingCta`: shared contact/appointment close for content pages.
- `PublicEmptyState` and `PublicLoadingState`: calm, directional states without invented content.
- `PublicFooter`: grouped contact details, hours, navigation, and secondary information.
- Existing `MobileCTABar`: visually aligned with the new system while preserving its actions and behaviour.

Each component must expose presentation-oriented props and consume existing data shapes. It must not own Supabase queries, CMS mutations, authentication decisions, or business rules.

## Page composition

### Header and navigation

- Use a compact white header with measured spacing and a visible indigo active-state line.
- Preserve all managed-navigation data and language behaviour.
- Desktop action priority: Appointment, WhatsApp, Contact, then Login/user menu.
- Mobile navigation uses a simple sheet or drawer, clear grouping, and minimum 44px targets.
- The header remains sticky only if it does not obscure focus targets or content anchors.

### Homepage

- Keep the clinic photograph as the hero anchor with the approved low-opacity treatment and sufficient foreground contrast.
- Strengthen the relationship among clinic label, headline, supporting text, and primary actions.
- Reduce carousel controls to the minimum required for orientation and control.
- Preserve all CMS section ordering and visibility settings.
- Standardise section headers and vertical rhythm across reasons-to-choose, services, team, gallery, testimonials, video, location, and other configured sections.
- Service cards should scan quickly and feel clinical rather than promotional.
- Testimonials use an editorial quotation treatment rather than oversized decorative cards.
- Gallery presentation should foreground real clinic imagery.
- Location/contact information should finish the page with practical details and clear actions.

### Services

- Use the shared page header.
- Present service cards with strong names, concise supporting copy, clear link affordance, and restrained icon treatment.
- Preserve every public slug, alias mapping, sanitised rich-text description, approved service list, and appointment CTA.

### Doctors and doctor-on-duty

- Present clinical qualifications, role, expertise, and availability with clear hierarchy.
- Remove generic gradient-heavy framing and excessive badge decoration.
- Preserve fallback behaviour and all current data sources.

### Appointment, authentication, and public forms

- Keep field names, validation, submission flows, consent text, and backend operations unchanged.
- Improve focus, grouping, progress, validation visibility, and responsive spacing.
- Destructive, account, and medical actions must remain semantically distinct.

### Gallery, health tips, and general pages

- Apply shared page headers, content widths, filters, cards, and empty states.
- Preserve media URLs, lazy loading, sanitisation, article rendering, and CMS order.
- Rich content keeps a readable line length and safe responsive media styling.

### Footer

- Group clinic identity, contact methods, opening hours, primary navigation, and secondary links deliberately.
- Keep important operational information visible without turning the footer into a dense portal.

## Interaction and motion

- Use one restrained entrance sequence for the initial page or hero.
- Use subtle hover and pressed feedback for interactive elements.
- Do not animate decorative objects continuously.
- Respect `prefers-reduced-motion` by removing or shortening non-essential transitions.
- Do not hide information exclusively behind hover.
- Preserve carousel keyboard, pointer, and automatic-rotation controls; automatic movement must remain pausable where required.

## Responsive behaviour

- Validate at 320px, 390px, 768px, 1024px, and wide desktop widths.
- Prevent horizontal overflow at every public route.
- Keep touch targets at least 44px.
- Shorten hero height on small screens and prevent text or actions from being cropped.
- Stack actions in a clear priority order where horizontal space is insufficient.
- Preserve the mobile CTA bar without covering form controls, cookie consent, or footer actions.
- Cards collapse to one column with appropriate edge spacing.

## Accessibility requirements

- Meet WCAG 2.2 AA contrast targets for normal text and interactive states.
- Provide visible `:focus-visible` treatment with sufficient offset and contrast.
- Maintain one logical `h1` and a consistent heading hierarchy on every public page.
- Preserve skip-link behaviour.
- Maintain descriptive accessible names for icon-only and mobile controls.
- Ensure status, validation, loading, and error information is available without relying on colour alone.
- Avoid unjustified uppercase copy and overly long lines.
- Preserve language metadata and bilingual switching.

## Data flow and security boundaries

The redesign is downstream of existing data and security logic:

1. Existing hooks, Supabase queries, CMS projections, and route loaders obtain data.
2. Existing sanitisation and mapping logic prepares public content.
3. Shared public presentation components render that content.
4. Existing links, forms, and mutation handlers perform actions.

The redesign must not move database queries into visual primitives, bypass sanitisation, introduce fallback credentials, broaden access, alter RLS, or change consent gating. The website editor, clinical application, and staff application remain separate design and permission surfaces.

## Loading, empty, and error states

- Loading states should preserve approximate layout and avoid disruptive shifts.
- Empty states explain what is unavailable and, only when an existing action exists, provide that action.
- Errors retain existing behaviour and messages unless a presentation-only wrapper can improve legibility safely.
- Do not replace real errors with sample data or silently hide failed content.

## Testing and acceptance criteria

### Automated

- TypeScript passes with no errors.
- Existing unit and security tests remain green.
- Add regression tests for shared public components and critical responsive states.
- Verify keyboard focus and accessible names for navigation and primary actions.
- Verify reduced-motion behaviour.
- Verify sanitised rich-text sinks remain unchanged.
- Production and development builds pass.
- Dependency and security gates remain green under the existing policy.

### Visual and browser validation

- Capture desktop and mobile screenshots for the homepage and representative interior pages.
- Inspect all included public routes in Malay and representative English layouts.
- Verify direct-route loading under GitHub Pages.
- Verify no horizontal overflow at the required widths.
- Verify no new browser console errors.
- Verify homepage background and public media load correctly.
- Verify header, mobile menu, language switcher, appointment links, phone links, WhatsApp links, authentication navigation, and mobile CTA bar.
- Do not submit production forms or create production data during read-only smoke testing.

### Content and behaviour preservation

- No wording or CMS content is changed.
- No route is added, removed, or renamed.
- No form field, validation rule, destination, or backend handler is changed.
- No database migration, secret modification, storage mutation, or production-data write is part of this redesign.
- The editor, staff, clinic, video-call, and queue-TV workflows continue to behave as before.

## Release strategy

1. Create an isolated design implementation branch from current `main`.
2. Implement the public token system and shared primitives first.
3. Convert shared layout, homepage, and interior pages in bounded batches.
4. Run focused tests after each batch and the complete gate before review.
5. Produce desktop/mobile visual evidence and perform an accessibility review.
6. Open one review PR covering the coordinated public redesign.
7. Merge only after the exact head passes GitHub Actions.
8. Allow the existing GitHub Pages workflow to deploy the validated commit.
9. Perform read-only live verification; retain the prior deployment as the rollback point.

## Approved decisions

- Direction: Trusted Family Clinic.
- Scope: every included public page in one coordinated release.
- Approach: shared design system first, followed by page adaptation.
- Public content and behaviour: preserved exactly.
- Editor and operational applications: excluded from the public visual redesign.

