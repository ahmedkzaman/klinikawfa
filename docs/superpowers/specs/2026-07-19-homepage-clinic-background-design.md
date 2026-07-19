# Homepage Clinic Background Design

## Objective

Add the supplied Klinik Awfa exterior photograph as a subtle background in the homepage hero without changing any wording, routes, actions, carousel behavior, database access, or other homepage sections.

## Approved Direction

Use the photograph only in the existing `HeroCarousel`. The image is the hero's single signature element: it makes the page recognizably Klinik Awfa while the surrounding layout remains restrained and clinical.

The alternatives considered were:

1. Hero-only decorative image — selected because it adds identity without reducing readability elsewhere.
2. Full-homepage background — rejected because repeated photographic texture would compete with service cards, testimonials, and location content.

## Visual Treatment

- Place the photograph as an absolutely positioned decorative image behind the existing hero content.
- Keep the photograph very faint, targeting approximately 12–14% visual opacity over the current background.
- Preserve the existing solid background beneath the image and add a quiet background-coloured veil if needed so text and controls remain consistently legible across the photograph.
- Use `object-fit: cover` with a desktop focal point near the centre of the building.
- On narrow screens, shift the focal point toward the right so the Klinik Awfa signage remains visible after cropping.
- Keep the existing typography, colours, CTA buttons, carousel timing, navigation arrows, spacing, and animations unchanged.
- Add no gradients, glass panels, decorative badges, or additional motion beyond what already exists.

## Accessibility

- Treat the photograph as decorative: empty alternative text, `aria-hidden="true"`, and no pointer interaction.
- Maintain WCAG 2.2 AA contrast: normal text must remain at least 4.5:1 and large text at least 3:1 against the effective background.
- Retain visible keyboard focus, existing control labels, reduced-motion behavior, and carousel interactions.
- The image must not contain information that is required to understand or operate the page.

## Performance

- Store an optimized local WebP derivative of the supplied image in `src/assets` so the website does not depend on a third-party image URL.
- Preserve the photograph's natural aspect ratio and avoid upscaling beyond its useful source resolution.
- Render it as a real decorative image layer with asynchronous decoding; because it appears immediately in the hero, do not lazy-load it.
- Do not add a new package.

## Implementation Boundary

Expected production changes:

- One optimized image asset under `src/assets`.
- A small background-layer addition in `src/components/home/HeroCarousel.tsx`.
- A focused regression test for the decorative hero image and its accessibility attributes.

Explicitly unchanged:

- All public wording and translations.
- Homepage section order and content.
- Routes, forms, CTAs, Supabase configuration, database, migrations, secrets, and edge functions.

## Validation

1. Write a focused test first and confirm it fails because the hero image is absent.
2. Add the minimal image layer and confirm the focused test passes.
3. Run the full frontend test suite, TypeScript, changed-file lint, production build, and development build.
4. Inspect desktop and mobile hero screenshots for crop, readability, CTA visibility, and absence of horizontal overflow.
5. Confirm the Git diff contains only the approved hero presentation, test, specification, and image asset.

## References

- Anthropic `frontend-design` skill: restrained composition, one memorable signature element, and deliberate self-critique.
- W3C WCAG 2.2, Success Criterion 1.4.3: text/background contrast of 4.5:1 for normal text and 3:1 for large text.
