# Doctor Card Portrait Sizing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enlarge public Doctors-page portraits so they visually use the existing media-frame height while remaining circular, centered, and responsive.

**Architecture:** Keep the existing Doctors card markup and change only the portrait and fallback-avatar responsive sizing classes. Protect the layout with a focused source-level regression test, then verify the relevant page tests and production build.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest

## Global Constraints

- Keep the existing circular portrait, centered in the current `16:10` media frame.
- Use approximately 170px on small screens and 220px on medium screens and above.
- Preserve `object-cover`, shadow, accent ring, experience badge, alt text, and all content below the frame.
- Apply identical dimensions to the fallback avatar.
- Do not change staff-member thumbnails.

---

### Task 1: Enlarge doctor portraits with regression coverage

**Files:**
- Modify: `src/pages/Doctors.tsx:249-260`
- Create: `src/test/doctors-portrait-sizing.test.ts`

**Interfaces:**
- Consumes: Existing doctor `photo_url` rendering and Tailwind utility classes.
- Produces: Responsive `h-[170px] w-[170px] md:h-[220px] md:w-[220px]` portrait and fallback sizing.

- [ ] **Step 1: Write the failing regression test**

Read `src/pages/Doctors.tsx` and assert that both the image and fallback contain `h-[170px] w-[170px] md:h-[220px] md:w-[220px]`, while the staff thumbnail remains `h-14 w-14`.

- [ ] **Step 2: Run the regression test and verify RED**

Run: `npm.cmd test -- --run src/test/doctors-portrait-sizing.test.ts`

Expected: FAIL because the doctor portrait still uses `h-28 w-28 md:h-36 md:w-36`.

- [ ] **Step 3: Apply the minimal responsive sizing change**

In `src/pages/Doctors.tsx`, replace the doctor image and fallback size utilities with:

```tsx
h-[170px] w-[170px] md:h-[220px] md:w-[220px]
```

Keep all other classes unchanged.

- [ ] **Step 4: Verify focused regressions and build**

Run:

```powershell
npm.cmd test -- --run src/test/doctors-portrait-sizing.test.ts src/test/website-content-schemas.test.ts
npm.cmd run build
git diff --check
```

Expected: all tests pass, build exits 0, and diff check is clean.

- [ ] **Step 5: Commit and deploy**

```powershell
git add src/pages/Doctors.tsx src/test/doctors-portrait-sizing.test.ts
git commit -m "fix doctor portrait sizing"
git push origin HEAD:main
```

Wait for Security Gate and Deploy GitHub Pages to pass, then verify the production bundle contains the new responsive classes.
