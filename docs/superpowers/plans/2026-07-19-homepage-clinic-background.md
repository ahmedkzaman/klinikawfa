# Homepage Clinic Background Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the supplied Klinik Awfa exterior photograph as a very faint, accessible, responsive background in the existing homepage hero.

**Architecture:** Keep the change inside `HeroCarousel`: import one optimized local WebP asset and render it as a non-interactive decorative layer between the hero's solid background and its content. Protect the behavior with one focused component test, then validate the unchanged carousel and homepage at desktop and mobile sizes.

**Tech Stack:** React 18, TypeScript, Vite 8, Tailwind CSS 3, Framer Motion, Vitest, React Testing Library, sharp-cli for one-time local WebP conversion.

## Global Constraints

- Change only the homepage hero presentation; do not change public wording, translations, routes, actions, section order, database access, migrations, secrets, or edge functions.
- Keep the photograph at approximately 12–14% opacity in light mode and no stronger than 8% in dark mode.
- Treat the photograph as decorative with empty alternative text, `aria-hidden="true"`, and no pointer interaction.
- Preserve all existing carousel timing, buttons, labels, focus behavior, motion, typography, colours, and spacing.
- Use an optimized local WebP asset; do not add a runtime dependency or external image URL.
- Maintain WCAG 2.2 AA contrast: at least 4.5:1 for normal text and 3:1 for large text.

---

### Task 1: Add the decorative hero photograph test-first

**Files:**
- Create: `src/test/hero-background.test.tsx`
- Create: `src/assets/klinik-awfa-exterior.webp`
- Modify: `src/components/home/HeroCarousel.tsx`

**Interfaces:**
- Consumes: the supplied source image at `C:\Users\ahmed\AppData\Local\Temp\codex-clipboard-a31b6da5-6eed-41de-96ef-5de8cd3f0c04.png` and the existing `HeroCarousel({ autoPlayInterval?: number })` component.
- Produces: a bundled `clinicExterior` asset URL and one decorative `<img>` layer rendered by `HeroCarousel`.

- [ ] **Step 1: Write the failing component test**

Create `src/test/hero-background.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { HeroCarousel } from "@/components/home/HeroCarousel";
import { LanguageProvider } from "@/contexts/LanguageContext";

describe("HeroCarousel clinic background", () => {
  it("renders the clinic photograph as a faint decorative image", () => {
    const { container } = render(
      <MemoryRouter>
        <LanguageProvider>
          <HeroCarousel autoPlayInterval={60_000} />
        </LanguageProvider>
      </MemoryRouter>,
    );

    const background = container.querySelector(
      'img[alt=""][aria-hidden="true"]',
    );

    expect(background).toBeInstanceOf(HTMLImageElement);
    expect(background?.getAttribute("src")).toContain(
      "klinik-awfa-exterior",
    );
    expect(background).toHaveAttribute("decoding", "async");
    expect(background).toHaveAttribute("loading", "eager");
    expect(background).toHaveAttribute("draggable", "false");
    expect(background).toHaveClass(
      "pointer-events-none",
      "object-cover",
      "opacity-[0.13]",
      "md:object-center",
    );
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npx vitest run src/test/hero-background.test.tsx
```

Expected: FAIL at `toBeInstanceOf(HTMLImageElement)` because the decorative image does not exist yet.

- [ ] **Step 3: Convert the supplied image to a local WebP asset**

Run the one-time converter without changing `package.json` or the lockfile:

```powershell
npx --yes sharp-cli@5.2.0 `
  -i "C:\Users\ahmed\AppData\Local\Temp\codex-clipboard-a31b6da5-6eed-41de-96ef-5de8cd3f0c04.png" `
  -o "src/assets/klinik-awfa-exterior.webp" `
  --format webp `
  --quality 82 `
  --smartSubsample
```

Verify that the asset exists, remains 1060×703, and is smaller than the 1,204,135-byte PNG source:

```powershell
Get-Item src/assets/klinik-awfa-exterior.webp | Select-Object Name, Length
```

Expected: `klinik-awfa-exterior.webp` with a size below 1,204,135 bytes.

- [ ] **Step 4: Add the minimal decorative layer**

Add this import to `src/components/home/HeroCarousel.tsx`:

```tsx
import clinicExterior from '@/assets/klinik-awfa-exterior.webp';
```

Inside the existing `<div className="absolute inset-0 gradient-section">`, before the motion-orb elements, add:

```tsx
<img
  src={clinicExterior}
  alt=""
  aria-hidden="true"
  decoding="async"
  loading="eager"
  fetchPriority="high"
  draggable={false}
  className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover object-[68%_center] opacity-[0.13] md:object-center dark:opacity-[0.08]"
/>
```

Do not edit the carousel content, transitions, controls, or section spacing.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run:

```powershell
npx vitest run src/test/hero-background.test.tsx
```

Expected: 1 test passed.

- [ ] **Step 6: Commit the test, asset, and minimal implementation**

```powershell
git add src/test/hero-background.test.tsx src/assets/klinik-awfa-exterior.webp src/components/home/HeroCarousel.tsx
git commit -m "Add clinic photo to homepage hero"
```

---

### Task 2: Run full quality and visual validation

**Files:**
- Verify: `src/components/home/HeroCarousel.tsx`
- Verify: `src/test/hero-background.test.tsx`
- Verify: `src/assets/klinik-awfa-exterior.webp`

**Interfaces:**
- Consumes: the completed hero background layer from Task 1.
- Produces: a fully validated branch ready for review; no new application interface.

- [ ] **Step 1: Run changed-file lint**

```powershell
npm run lint:changed
```

Expected: exit 0 with no lint errors.

- [ ] **Step 2: Run TypeScript and the complete frontend suite**

```powershell
npx tsc --noEmit
npm test
```

Expected: TypeScript exits 0 and all tests pass, including `hero-background.test.tsx`.

- [ ] **Step 3: Run both build modes**

```powershell
npm run build
npm run build:dev
```

Expected: both builds exit 0. Existing bundle-size, Browserslist-age, `face-api.js`, or `dashjs` warnings may remain, but no new error is acceptable.

- [ ] **Step 4: Inspect the responsive result locally**

Start the preview:

```powershell
npm run preview -- --host 127.0.0.1 --port 4173
```

Inspect `/` at 1440×900 and 390×844. Confirm:

- The photograph is visible but subordinate to the existing text and CTAs.
- The building remains centred on desktop and the Klinik Awfa sign remains visible on mobile.
- Hero text and all three CTA buttons remain easy to read.
- Navigation arrows, dots, hover pause, and slide rotation still work.
- No horizontal overflow, console error, layout shift, or broken asset request occurs.

- [ ] **Step 5: Self-critique against the approved design**

Compare screenshots to `docs/superpowers/specs/2026-07-19-homepage-clinic-background-design.md`. If the image competes with text, reduce only its opacity; if the mobile crop loses the sign, adjust only `object-[68%_center]`. Do not add panels, gradients, new motion, new copy, or unrelated styling.

If any CSS-class adjustment is needed, rerun the focused test, TypeScript, and both builds, then commit only the refinement:

```powershell
git add src/components/home/HeroCarousel.tsx src/test/hero-background.test.tsx
git commit -m "Refine responsive clinic hero background"
```

- [ ] **Step 6: Review the final diff and repository safety**

```powershell
git diff origin/main...HEAD --check
git diff origin/main...HEAD --stat
git status --short
```

Expected: only the specification, plan, one test, one WebP asset, and `HeroCarousel.tsx` are changed; the worktree is clean after commits.

---

### Task 3: Publish the review branch, not the website

**Files:**
- No new files.

**Interfaces:**
- Consumes: the validated commits from Tasks 1–2.
- Produces: a GitHub pull request for human review; it does not deploy the standalone website.

- [ ] **Step 1: Push the isolated branch**

```powershell
git push -u origin agent/homepage-clinic-background
```

Expected: the branch is available on GitHub without changing `main`.

- [ ] **Step 2: Open the pull request**

```powershell
gh pr create `
  --repo ahmedkzaman/klinikawfa `
  --base main `
  --head agent/homepage-clinic-background `
  --title "Add subtle clinic photo to homepage hero" `
  --body "Adds the supplied Klinik Awfa exterior photograph as a faint, decorative, responsive hero background. Public wording, routes, data, and carousel behavior are unchanged. Includes focused accessibility regression coverage and full local validation."
```

Expected: a new PR URL.

- [ ] **Step 3: Wait for the Security Gate**

```powershell
gh pr checks --repo ahmedkzaman/klinikawfa --watch
```

Expected: Security Gate passes before merge. Stop after reporting the PR and check result; do not change DNS or attempt a production deployment from the unavailable Lovable editor.
