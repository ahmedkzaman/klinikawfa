# Trusted Family Clinic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved Trusted Family Clinic visual system to every included public Klinik Awfa page without changing public content, routes, forms, CMS behaviour, database access, or security boundaries.

**Architecture:** Build a public-only token layer and small presentation primitives, then convert the shared public shell and route groups in bounded batches. Existing hooks, queries, sanitisation, mutation handlers, CMS projections, and protected operational applications remain downstream dependencies and are not moved into the new visual components.

**Tech Stack:** React 18, TypeScript 5.8, Vite 8, Tailwind CSS 3.4, shadcn/Radix primitives, Lucide icons, Vitest 3, Testing Library, GitHub Actions, GitHub Pages.

## Global Constraints

- Use Awfa Indigo `#241C6B`, Clinic Ink `#172033`, Clean White `#F8FAFC`, Mist Blue `#E9EEF8`, Restrained Coral `#C83B4A`, and WhatsApp Green `#16A765` with the semantic purposes defined in the approved specification.
- Use Manrope for headings/display and Atkinson Hyperlegible for body/interface copy, with system sans-serif fallbacks.
- Preserve every existing word, translation, route, slug, content order, CMS visibility rule, form field, validation rule, link destination, Supabase query, mutation, sanitisation boundary, authentication decision, consent gate, and role boundary.
- Do not modify `/editor/**`, `/staff/**`, `/clinic/**`, video-call, or queue-TV structure or behaviour.
- Do not add a migration, change a secret, mutate Storage, write production data, or broaden permissions.
- Use one structural indigo clinic-line motif; remove generic gradients, glow effects, floating decoration, and unnecessary pill labels from included public pages.
- Maintain WCAG 2.2 AA contrast, visible keyboard focus, one logical `h1`, 44px minimum touch targets, reduced-motion support, and no horizontal overflow from 320px upward.
- Do not submit production forms during browser verification.

---

## File Structure

### New public presentation units

- `src/components/public/PublicPageHeader.tsx` — interior-page title and supporting-copy structure.
- `src/components/public/PublicSectionHeader.tsx` — homepage/interior section label and heading structure.
- `src/components/public/PublicClosingCta.tsx` — shared appointment, WhatsApp, and phone close.
- `src/components/public/PublicStates.tsx` — public loading and empty states.
- `src/components/public/index.ts` — explicit public-component exports.
- `src/test/public-design-system.test.ts` — token, font, focus, and reduced-motion contract.
- `src/test/public-components.test.tsx` — component semantics and action preservation.
- `src/test/public-layout.test.tsx` — header, footer, mobile CTA, and navigation contract.
- `src/test/public-home-design.test.tsx` — CMS projection and homepage presentation contract.
- `src/test/public-route-design.test.tsx` — representative interior-route headings and preserved actions.

### Existing presentation files to modify

- `tailwind.config.ts`, `src/index.css` — public tokens, type roles, spacing, focus, motion, and reusable public utilities.
- `src/components/layout/{Header,Footer,MobileCTABar,MainLayout}.tsx` — shared public shell.
- `src/components/home/{HeroCarousel,WhySection,ServicesPreview,GalleryStrip,TestimonialsSection,VideoSection,MapSection}.tsx` — CMS-driven homepage sections.
- `src/pages/{Services,ServiceDetail,Doctors,DoctorOnDuty,Gallery,HealthTips,BlogPost,GeneralPage}.tsx` — public content routes.
- `src/pages/{AppointmentBooking,Auth,ResetPassword}.tsx` and `src/pages/auth/LocumRegister.tsx` — public forms and authentication presentation.
- Relevant gallery/content components under `src/components/gallery/**` and existing form subcomponents imported by the pages above.

---

### Task 1: Public Design Tokens and Typography

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/main.tsx`
- Modify: `tailwind.config.ts`
- Modify: `src/index.css`
- Create: `src/test/public-design-system.test.ts`

**Interfaces:**
- Consumes: existing Tailwind semantic variables such as `--primary`, `--foreground`, and `--whatsapp`.
- Produces: `font-display`, `font-sans`, `.public-section`, `.public-clinic-line`, `.public-focus`, and the approved CSS colour values for later tasks.

- [ ] **Step 1: Write the failing design-system contract**

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/index.css", "utf8");
const tailwind = readFileSync("tailwind.config.ts", "utf8");

describe("Trusted Family Clinic design system", () => {
  it("defines the approved public palette", () => {
    expect(css).toContain("#241C6B");
    expect(css).toContain("#172033");
    expect(css).toContain("#F8FAFC");
    expect(css).toContain("#E9EEF8");
    expect(css).toContain("#C83B4A");
    expect(css).toContain("#16A765");
  });

  it("uses the approved display and body typefaces", () => {
    expect(css).toContain("Manrope");
    expect(css).toContain("Atkinson Hyperlegible");
    expect(tailwind).toContain('display: ["Manrope"');
    expect(tailwind).toContain('sans: ["Atkinson Hyperlegible"');
  });

  it("retains focus and reduced-motion safeguards", () => {
    expect(css).toContain(":focus-visible");
    expect(css).toContain("prefers-reduced-motion: reduce");
  });
});
```

- [ ] **Step 2: Run the contract and verify that it fails**

Run: `npx vitest run src/test/public-design-system.test.ts --pool=forks --fileParallelism=false`  
Expected: FAIL because the six hex values and approved typefaces are not yet present.

- [ ] **Step 3: Install and import self-hosted fonts**

Run: `npm install @fontsource/manrope @fontsource/atkinson-hyperlegible`  
Expected: `package.json` and `package-lock.json` contain both packages and `npm audit --omit=dev --audit-level=high` reports no high or critical finding introduced by them.

Add these imports at the top of `src/main.tsx` before application styles:

```ts
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
```

- [ ] **Step 4: Implement the public token and type foundation**

Map semantic variables without changing their names:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --awfa-indigo: #241C6B;
  --clinic-ink: #172033;
  --clean-white: #F8FAFC;
  --mist-blue: #E9EEF8;
  --restrained-coral: #C83B4A;
  --whatsapp-green: #16A765;
}

@layer base {
  :focus-visible {
    outline: 3px solid color-mix(in srgb, var(--awfa-indigo) 72%, white);
    outline-offset: 3px;
  }
}

@layer components {
  .public-section { @apply py-14 md:py-20 lg:py-24; }
  .public-clinic-line { @apply block h-0.5 w-12 bg-primary; }
}
```

Update `tailwind.config.ts`:

```ts
fontFamily: {
  sans: ["Atkinson Hyperlegible", "ui-sans-serif", "system-ui", "sans-serif"],
  display: ["Manrope", "ui-sans-serif", "system-ui", "sans-serif"],
},
```

Translate the six hex values to the existing semantic HSL variables so `primary`, `foreground`, `background`, `muted`, `accent`, and `whatsapp` retain their established API. Remove unused public glow/orb animation usage only after confirming no operational screen depends on the removed utility. The font packages are bundled by Vite, so the redesign introduces no third-party font request or CSP expansion.

- [ ] **Step 5: Run design and existing foundation tests**

Run: `npx vitest run src/test/public-design-system.test.ts src/test/hero-background.test.tsx src/test/home-defaults.test.ts --pool=forks --fileParallelism=false`  
Expected: PASS with no snapshot or content changes.

- [ ] **Step 6: Type-check and commit**

Run: `npx tsc --noEmit`  
Expected: exit 0.

```bash
git add package.json package-lock.json src/main.tsx tailwind.config.ts src/index.css src/test/public-design-system.test.ts
git commit -m "feat: add Trusted Family Clinic design tokens"
```

---

### Task 2: Shared Public Components

**Files:**
- Create: `src/components/public/PublicPageHeader.tsx`
- Create: `src/components/public/PublicSectionHeader.tsx`
- Create: `src/components/public/PublicClosingCta.tsx`
- Create: `src/components/public/PublicStates.tsx`
- Create: `src/components/public/index.ts`
- Create: `src/test/public-components.test.tsx`

**Interfaces:**
- Consumes: `CLINIC_INFO`, `Button`, approved public tokens.
- Produces:
  - `PublicPageHeader({ title, description, eyebrow? }: PublicPageHeaderProps)`
  - `PublicSectionHeader({ title, description?, eyebrow?, align? }: PublicSectionHeaderProps)`
  - `PublicClosingCta({ title, description }: PublicClosingCtaProps)`
  - `PublicLoadingState({ label }: { label: string })`
  - `PublicEmptyState({ title, description }: PublicEmptyStateProps)`

- [ ] **Step 1: Write failing semantic tests**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  PublicClosingCta,
  PublicPageHeader,
  PublicSectionHeader,
} from "@/components/public";

describe("public presentation components", () => {
  it("renders one page heading with supporting copy", () => {
    render(<PublicPageHeader eyebrow="Klinik Awfa" title="Perkhidmatan" description="Rawatan untuk keluarga." />);
    expect(screen.getByRole("heading", { level: 1, name: "Perkhidmatan" })).toBeVisible();
    expect(screen.getByText("Rawatan untuk keluarga.")).toBeVisible();
  });

  it("uses an h2 for section headings", () => {
    render(<PublicSectionHeader title="Doktor Kami" />);
    expect(screen.getByRole("heading", { level: 2, name: "Doktor Kami" })).toBeVisible();
  });

  it("preserves appointment, WhatsApp, and phone actions", () => {
    render(<PublicClosingCta title="Kami di sini" description="Hubungi klinik." />);
    expect(screen.getByRole("link", { name: /appointment|temujanji/i })).toHaveAttribute("href", "/appointment");
    expect(screen.getByRole("link", { name: /whatsapp/i })).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: /phone|hubungi/i }).getAttribute("href")).toMatch(/^tel:/);
  });
});
```

- [ ] **Step 2: Verify the tests fail on missing exports**

Run: `npx vitest run src/test/public-components.test.tsx --pool=forks --fileParallelism=false`  
Expected: FAIL because `@/components/public` does not exist.

- [ ] **Step 3: Implement the shared interfaces**

Use this structure for the page header:

```tsx
export interface PublicPageHeaderProps {
  title: string;
  description?: string;
  eyebrow?: string;
}

export function PublicPageHeader({ title, description, eyebrow }: PublicPageHeaderProps) {
  return (
    <header className="border-b border-border/70 bg-background">
      <div className="container py-14 md:py-20">
        <div className="max-w-3xl">
          <span className="public-clinic-line mb-5" aria-hidden="true" />
          {eyebrow && <p className="mb-3 text-sm font-bold uppercase tracking-[0.14em] text-primary">{eyebrow}</p>}
          <h1 className="font-display text-4xl font-semibold leading-tight text-foreground md:text-5xl">{title}</h1>
          {description && <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">{description}</p>}
        </div>
      </div>
    </header>
  );
}
```

Implement section alignment as `"left" | "center"`, implement the CTA with existing `CLINIC_INFO` values, and implement states with `role="status"` only for loading—not for static empty content. Export all interfaces from `src/components/public/index.ts`.

- [ ] **Step 4: Run component tests and accessibility queries**

Run: `npx vitest run src/test/public-components.test.tsx --pool=forks --fileParallelism=false`  
Expected: PASS; only one `h1` is produced by `PublicPageHeader` and CTA URLs match existing constants.

- [ ] **Step 5: Commit**

```bash
git add src/components/public src/test/public-components.test.tsx
git commit -m "feat: add shared public website components"
```

---

### Task 3: Public Header, Footer, and Mobile Actions

**Files:**
- Modify: `src/components/layout/Header.tsx`
- Modify: `src/components/layout/Footer.tsx`
- Modify: `src/components/layout/MobileCTABar.tsx`
- Modify: `src/components/layout/MainLayout.tsx`
- Create: `src/test/public-layout.test.tsx`

**Interfaces:**
- Consumes: managed navigation, `LanguageContext`, `AuthContext`, `CLINIC_INFO`, existing `MainLayout` children.
- Produces: the unchanged `Header`, `Footer`, `MobileCTABar`, and `MainLayout` exports with new public presentation.

- [ ] **Step 1: Write failing layout contracts**

Mock the existing contexts and assert these exact behaviours:

```tsx
expect(screen.getByRole("navigation", { name: /main|utama/i })).toBeVisible();
expect(screen.getByRole("link", { name: /appointment|temujanji/i })).toHaveAttribute("href", "/appointment");
expect(screen.getByRole("link", { name: /whatsapp/i })).toHaveAttribute("target", "_blank");
expect(screen.getByRole("button", { name: /menu/i })).toHaveClass("min-h-11", "min-w-11");
expect(screen.getByRole("contentinfo")).toBeVisible();
```

Also assert both language controls and the existing login/user-menu branch remain present.

- [ ] **Step 2: Run the test and verify the new hierarchy fails**

Run: `npx vitest run src/test/public-layout.test.tsx --pool=forks --fileParallelism=false`  
Expected: FAIL on the missing header appointment action, accessible navigation label, and 44px menu classes.

- [ ] **Step 3: Convert the shared shell**

Use a white sticky header with a border, remove generic glow/gradient classes, and render actions in this desktop order:

```tsx
<Button size="sm" asChild>
  <Link to="/appointment">{language === "ms" ? "Buat Temujanji" : "Book Appointment"}</Link>
</Button>
<Button size="sm" className="bg-whatsapp text-whatsapp-foreground hover:bg-whatsapp/90" asChild>
  <a href={CLINIC_INFO.whatsapp} target="_blank" rel="noopener noreferrer">WhatsApp</a>
</Button>
<Button size="sm" variant="outline" asChild>
  <a href={CLINIC_INFO.phoneLink}>{CLINIC_INFO.phone}</a>
</Button>
```

Preserve managed navigation order and existing active-route logic. Represent the active route with a two-pixel indigo line. Keep the mobile menu as a sheet, use `min-h-11 min-w-11`, and preserve all account branches.

Group the footer into clinic identity, contact/opening hours, and navigation. Update only layout and classes; reuse current strings and constants. Keep `MobileCTABar` fixed, ensure each action is at least 44px tall, and add bottom padding in `MainLayout` so it never covers content.

- [ ] **Step 4: Run layout and auth regressions**

Run: `npx vitest run src/test/public-layout.test.tsx src/test/auth-guards.test.tsx src/test/auth-login-form.test.tsx --pool=forks --fileParallelism=false`  
Expected: PASS with unchanged login and protected-route behaviour.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout src/test/public-layout.test.tsx
git commit -m "feat: redesign public navigation and footer"
```

---

### Task 4: CMS-Driven Homepage

**Files:**
- Modify: `src/components/home/HeroCarousel.tsx`
- Modify: `src/components/home/WhySection.tsx`
- Modify: `src/components/home/ServicesPreview.tsx`
- Modify: `src/components/home/GalleryStrip.tsx`
- Modify: `src/components/home/TestimonialsSection.tsx`
- Modify: `src/components/home/VideoSection.tsx`
- Modify: `src/components/home/MapSection.tsx`
- Create: `src/test/public-home-design.test.tsx`

**Interfaces:**
- Consumes: existing `HomeContent`, section content props, `preview` flags, CMS order from `HomeRenderer`.
- Produces: unchanged named exports and data flow with Trusted Family Clinic presentation.

- [ ] **Step 1: Write preservation-first homepage tests**

```tsx
it("keeps the clinic image decorative and low opacity", () => {
  render(<HeroCarousel content={homeContent.hero} />);
  const image = screen.getByRole("img", { hidden: true });
  expect(image).toHaveAttribute("alt", "");
  expect(image).toHaveClass("opacity-[0.13]");
});

it("keeps CMS section order and preview-safe links", () => {
  render(<HomeRenderer content={homeContent} preview />);
  expect(screen.getAllByRole("heading").map((heading) => heading.textContent)).toEqual(
    expect.arrayContaining(expectedCmsHeadings),
  );
  expect(screen.queryByRole("link", { name: /book|temujanji/i })).not.toBeInTheDocument();
});
```

Use the existing fixture builders from `home-defaults.test.ts` and `home-preview-safety.test.tsx` rather than creating alternate content.

- [ ] **Step 2: Verify the new structural expectations fail**

Run: `npx vitest run src/test/public-home-design.test.tsx src/test/hero-background.test.tsx src/test/home-preview-safety.test.tsx --pool=forks --fileParallelism=false`  
Expected: the existing safety tests pass; the new clinic-line/section structure assertions fail.

- [ ] **Step 3: Apply the approved homepage composition**

- Hero: keep the existing image source, opacity, CMS copy, carousel state, and preview guards; use a shorter responsive height, stronger foreground panel/contrast, two dominant actions, and restrained controls.
- Why/services/team content: replace generic pill/gradient/glow treatments with `PublicSectionHeader`, quiet borders, consistent icon frames, and measured hover translation no greater than two pixels.
- Testimonials: use a quotation-led editorial layout with speaker attribution; do not alter quotation content.
- Gallery: use clean image edges and the existing link/lightbox behaviour.
- Video: preserve player source, consent and preview behaviour; change only framing and section typography.
- Map/location: prioritise address, opening/contact information, and existing actions; preserve map source and links.

Every section must continue receiving only its current `content` and `preview` props. Do not add data fetching to these components.

- [ ] **Step 4: Run all homepage and CMS safety tests**

Run: `npx vitest run src/test/public-home-design.test.tsx src/test/hero-background.test.tsx src/test/home-defaults.test.ts src/test/home-preview-safety.test.tsx src/test/home-editor.test.tsx --pool=forks --fileParallelism=false`  
Expected: PASS, including Home editor preview and upload regressions.

- [ ] **Step 5: Commit**

```bash
git add src/components/home src/test/public-home-design.test.tsx
git commit -m "feat: redesign CMS-driven homepage"
```

---

### Task 5: Services and Service Detail

**Files:**
- Modify: `src/pages/Services.tsx`
- Modify: `src/pages/ServiceDetail.tsx`
- Modify: `src/index.css` only for `.service-rich-content` presentation
- Create or extend: `src/test/public-route-design.test.tsx`

**Interfaces:**
- Consumes: `SERVICES`, `resolveServiceCategorySlug`, `clinic_services`, `sanitizeRichHtml`, existing language strings.
- Produces: unchanged `/services` and `/services/:slug` behaviour.

- [ ] **Step 1: Add service-route regression tests**

Assert the listing has one `h1`, every existing service link retains its current `href`, the three canonical aliases still resolve, unknown slugs remain 404, and the detail description still passes through `sanitizeRichHtml`.

```tsx
expect(screen.getByRole("heading", { level: 1, name: /services|perkhidmatan/i })).toBeVisible();
for (const service of SERVICES) {
  expect(screen.getByRole("link", { name: new RegExp(service.titleMs, "i") })).toHaveAttribute("href", `/services/${service.slug}`);
}
expect(source).toContain("sanitizeRichHtml(service.description || \"\")");
```

- [ ] **Step 2: Run and confirm presentation assertions fail**

Run: `npx vitest run src/test/public-route-design.test.tsx src/test/serviceSlugMap.test.ts src/test/sanitize-rich-html.test.ts --pool=forks --fileParallelism=false`  
Expected: existing mapping/sanitisation tests pass; new page-header and CTA assertions fail.

- [ ] **Step 3: Convert listing and detail presentation**

Use `PublicPageHeader` for both routes, use restrained service cards with a left clinic-line edge, preserve icon selection and link text, and replace duplicated closing sections with `PublicClosingCta`. Keep the Supabase query and alias resolution byte-for-byte except for import movement required by formatting. Limit rich content to a readable measure while preserving the sanitizer and responsive media rules.

- [ ] **Step 4: Run service tests and type-check**

Run: `npx vitest run src/test/public-route-design.test.tsx src/test/serviceSlugMap.test.ts src/test/sanitize-rich-html.test.ts --pool=forks --fileParallelism=false && npx tsc --noEmit`  
Expected: PASS and exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Services.tsx src/pages/ServiceDetail.tsx src/index.css src/test/public-route-design.test.tsx
git commit -m "feat: redesign public service pages"
```

---

### Task 6: Doctors and Duty Roster

**Files:**
- Modify: `src/pages/Doctors.tsx`
- Modify: `src/pages/DoctorOnDuty.tsx`
- Extend: `src/test/public-route-design.test.tsx`

**Interfaces:**
- Consumes: existing `team_members` query, duty-roster data, language context, fallback behaviour.
- Produces: unchanged `/doctors` and `/doctor-on-duty` data and actions.

- [ ] **Step 1: Add doctor-page contracts**

Test one `h1`, preserved doctor names/qualifications, visible loading state, fallback notice semantics, duty date/navigation controls, and unchanged contact links. Assert image `alt` uses the selected language name.

- [ ] **Step 2: Run and confirm new layout contracts fail**

Run: `npx vitest run src/test/public-route-design.test.tsx --pool=forks --fileParallelism=false`  
Expected: FAIL on `PublicPageHeader` and the new card structure.

- [ ] **Step 3: Implement clinical-profile presentation**

Use `PublicPageHeader`; replace gradient-heavy profile frames with white cards, thin borders, indigo qualification hierarchy, and calm expertise lists. Keep every query, fallback branch, role label, schedule calculation, and action unchanged. Do not remove the existing sample-data notice; restyle it as a readable warning using text and icon, not colour alone.

- [ ] **Step 4: Run tests and commit**

Run: `npx vitest run src/test/public-route-design.test.tsx --pool=forks --fileParallelism=false && npx tsc --noEmit`  
Expected: PASS.

```bash
git add src/pages/Doctors.tsx src/pages/DoctorOnDuty.tsx src/test/public-route-design.test.tsx
git commit -m "feat: redesign doctor and duty pages"
```

---

### Task 7: Gallery, Health Tips, Articles, and General Pages

**Files:**
- Modify: `src/pages/Gallery.tsx`
- Modify: `src/components/gallery/GalleryGrid.tsx`
- Modify: `src/components/gallery/GalleryLightbox.tsx`
- Modify: `src/pages/HealthTips.tsx`
- Modify: `src/pages/BlogPost.tsx`
- Modify: `src/pages/GeneralPage.tsx`
- Modify: `src/pages/NotFound.tsx`
- Extend: `src/test/public-route-design.test.tsx`
- Preserve: `src/test/general-pages.test.tsx`, `src/test/sanitize-rich-html.test.ts`

**Interfaces:**
- Consumes: existing gallery hooks, blog queries, CMS page projections, sanitised renderers.
- Produces: unchanged public media, articles, lightbox, filters, and general-page routing.

- [ ] **Step 1: Add route-group preservation tests**

Assert shared `h1` presentation, gallery filter accessible names, lightbox close control, article dates/titles, general-page 404 behaviour, the catch-all Not Found route action, and unchanged sanitised content rendering.

- [ ] **Step 2: Verify new presentation tests fail**

Run: `npx vitest run src/test/public-route-design.test.tsx src/test/general-pages.test.tsx src/test/sanitize-rich-html.test.ts --pool=forks --fileParallelism=false`  
Expected: existing safety tests pass; new shared-header/empty-state assertions fail.

- [ ] **Step 3: Convert the content routes**

Use `PublicPageHeader`, `PublicSectionHeader`, `PublicEmptyState`, and `PublicClosingCta`. Preserve gallery image URLs, lazy loading, ordering, category filtering, and lightbox state. Preserve blog/general-page queries, date values, author values, sanitized HTML/Markdown flow, and not-found branches. Apply the same public error-state treatment to `NotFound.tsx` without changing its route or recovery link. Keep article text within a readable measure and make images responsive without adding inline styles to sanitised content.

- [ ] **Step 4: Run tests and commit**

Run: `npx vitest run src/test/public-route-design.test.tsx src/test/general-pages.test.tsx src/test/sanitize-rich-html.test.ts --pool=forks --fileParallelism=false && npx tsc --noEmit`  
Expected: PASS.

```bash
git add src/pages/Gallery.tsx src/components/gallery src/pages/HealthTips.tsx src/pages/BlogPost.tsx src/pages/GeneralPage.tsx src/pages/NotFound.tsx src/test/public-route-design.test.tsx
git commit -m "feat: redesign public content pages"
```

---

### Task 8: Appointment and Public Authentication Forms

**Files:**
- Modify: `src/pages/AppointmentBooking.tsx`
- Modify: `src/pages/Auth.tsx`
- Modify: `src/pages/ResetPassword.tsx`
- Modify: `src/pages/auth/LocumRegister.tsx`
- Extend: `src/test/public-route-design.test.tsx`
- Preserve: `src/test/auth-login-form.test.tsx`, `src/test/reset-password-session.test.ts`

**Interfaces:**
- Consumes: existing form state, validators, Supabase Auth calls, appointment handlers, consent and recovery-session logic.
- Produces: identical submissions and validation with improved grouping/focus presentation.

- [ ] **Step 1: Add form-preservation tests**

Assert existing labels, required fields, progress text, submit names, password recovery behaviour, and visible error region. Verify all controls are associated with labels and primary buttons include `min-h-11`.

```tsx
expect(screen.getByLabelText(/email/i)).toBeRequired();
expect(screen.getByLabelText(/password|kata laluan/i)).toBeRequired();
expect(screen.getByRole("button", { name: /log masuk|sign in/i })).toHaveClass("min-h-11");
```

- [ ] **Step 2: Run the form tests and verify the touch-target assertion fails**

Run: `npx vitest run src/test/public-route-design.test.tsx src/test/auth-login-form.test.tsx src/test/reset-password-session.test.ts --pool=forks --fileParallelism=false`  
Expected: authentication behaviour tests pass; new presentation assertion fails.

- [ ] **Step 3: Apply the public form system**

Use the shared public header where appropriate, a quiet two-column desktop composition only when existing content supports it, single-column mobile forms, 44px controls, visible focus, clear progress, and readable error panels. Do not rename inputs, alter schemas, change calls, change redirect URLs, or submit any form during implementation verification.

- [ ] **Step 4: Run form and auth regressions**

Run: `npx vitest run src/test/public-route-design.test.tsx src/test/auth-login-form.test.tsx src/test/reset-password-session.test.ts src/test/auth-guards.test.tsx --pool=forks --fileParallelism=false`  
Expected: PASS with unchanged Auth and recovery outcomes.

- [ ] **Step 5: Commit**

```bash
git add src/pages/AppointmentBooking.tsx src/pages/Auth.tsx src/pages/ResetPassword.tsx src/pages/auth/LocumRegister.tsx src/test/public-route-design.test.tsx
git commit -m "feat: redesign public booking and auth forms"
```

---

### Task 9: Responsive, Motion, and Accessibility Audit

**Files:**
- Modify only as findings require: included public files from Tasks 1–8
- Extend: `src/test/public-design-system.test.ts`
- Extend: `src/test/public-layout.test.tsx`
- Extend: `src/test/public-route-design.test.tsx`

**Interfaces:**
- Consumes: completed public design implementation.
- Produces: route-wide accessibility and responsive acceptance evidence without business-logic changes.

- [ ] **Step 1: Add automated accessibility contracts**

Add exact assertions for one `h1`, menu accessible name, skip link, language controls, reduced-motion CSS, no animation class on persistent decorative elements, and 44px primary actions.

- [ ] **Step 2: Run the focused public suite**

Run: `npx vitest run src/test/public-design-system.test.ts src/test/public-components.test.tsx src/test/public-layout.test.tsx src/test/public-home-design.test.tsx src/test/public-route-design.test.tsx --pool=forks --fileParallelism=false`  
Expected: PASS after fixing every concrete finding.

- [ ] **Step 3: Inspect responsive routes locally**

Run a production-like preview with the existing safe environment launcher. Inspect `/`, `/services`, `/services/rawatan-umum`, `/doctors`, `/doctor-on-duty`, `/appointment`, `/gallery`, `/health-tips`, `/auth`, and one `/pages/:slug` route at widths 320, 390, 768, 1024, and 1440.

For each route record:

```text
route | width | one h1 | no horizontal overflow | actions visible | console errors
```

Expected for every row: yes, yes, yes, none.

- [ ] **Step 4: Verify keyboard and reduced-motion behaviour**

Tab through header, language selection, page actions, forms, gallery controls, mobile menu, and footer. Emulate `prefers-reduced-motion: reduce`; confirm the page remains usable and non-essential movement stops.

- [ ] **Step 5: Commit audit fixes**

```bash
git add src tailwind.config.ts
git commit -m "fix: complete public accessibility and responsive audit"
```

---

### Task 10: Complete Validation, Visual Evidence, and Release

**Files:**
- Create: `docs/releases/trusted-family-clinic-release.md`
- Do not modify: migrations, Edge Functions, secrets, environment values, production data.

**Interfaces:**
- Consumes: the complete implementation branch.
- Produces: review evidence, a green PR, and read-only live verification.

- [ ] **Step 1: Run the full local gate**

```bash
npm ci
npm run lint:changed
npx tsc --noEmit
npm test
npm run build
npm run build:dev
```

Expected: all commands exit 0. Existing documented non-blocking bundle warnings may remain; no new warning is accepted without explanation.

- [ ] **Step 2: Run security-preservation tests explicitly**

```bash
npx vitest run \
  src/test/sanitize-rich-html.test.ts \
  src/test/security.test.ts \
  src/test/auth-guards.test.tsx \
  src/test/google-tracking-end-to-end.test.tsx \
  src/test/production-cutover-contract.test.ts \
  --pool=forks --fileParallelism=false
```

Expected: PASS; the redesign does not alter sanitisation, auth, tracking consent, or Supabase cutover identity.

- [ ] **Step 3: Capture review evidence**

Capture desktop and mobile screenshots for the homepage, services, service detail, doctors, appointment, gallery, health tips, and auth. Add the route/viewport matrix, test outputs, changed-file summary, and confirmation of zero migrations/secrets/data writes to `docs/releases/trusted-family-clinic-release.md`.

- [ ] **Step 4: Review the diff for scope**

Run:

```bash
git diff --check main...HEAD
git diff --name-only main...HEAD
git status --short
```

Expected: no whitespace errors; only public presentation, tests, and release documents are changed; working tree clean.

- [ ] **Step 5: Open a review PR and wait for the exact head**

Push the implementation branch and open one PR titled `feat: apply Trusted Family Clinic public redesign`. Include content-preservation, responsive, accessibility, and security evidence. Mark ready only after local gates pass. Wait for the Security Gate on the exact head SHA.

- [ ] **Step 6: Squash-merge and verify GitHub Pages**

Squash-merge only after GitHub Actions succeeds. Wait until `klinikawfa.com` serves the new exact build asset. Perform read-only live checks for the routes and viewport matrix above, verify no new console errors, verify homepage background/media, and verify `/editor/home` still enforces authentication. Do not submit forms.

- [ ] **Step 7: Record completion**

Update `docs/releases/trusted-family-clinic-release.md` with the PR, merge SHA, workflow result, deployed asset identifier, live-route results, and rollback commit. Commit the final evidence only if doing so does not trigger a second unverified production change; otherwise attach it to the merged PR conversation.
