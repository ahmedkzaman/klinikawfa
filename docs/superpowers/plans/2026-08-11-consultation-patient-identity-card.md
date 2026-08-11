# Consultation Patient Identity Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the complete patient name and address in the consultation demographics card without overflow.

**Architecture:** Reuse the complete patient object already returned by the consultation queue query. Change only the demographics markup in `ConsultationDetail`, and extend the existing rendered-page test harness to protect name and address presentation.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Vitest, Testing Library

## Global Constraints

- Do not add a database migration or a second patient request.
- Keep the queue badge fixed-size while allowing the patient identity column to wrap.
- Render address as plain text and use an em dash for a blank address.
- Preserve all existing patient details and styling outside the requested layout change.

---

### Task 1: Full Patient Identity in Consultation Card

**Files:**
- Modify: `src/test/offline-consultation-pages.test.tsx`
- Modify: `src/pages/clinic/ConsultationDetail.tsx`

**Interfaces:**
- Consumes: the existing `entry.patients` relation selected by `useConsultationQueueEntries`.
- Produces: visible full-name text and an `Address` field sourced from `patient.address`.

- [ ] **Step 1: Write the failing regression tests**

Add `address: '12, Jalan Awfa\nBandar Kotasas, 25200 Kuantan, Pahang'` to the patient fixture and add a test that renders `ConsultationDetail`, finds the complete patient name and address, verifies the name lacks the `truncate` class, and verifies the address uses `whitespace-pre-wrap` and safe word wrapping. Add a second render with a whitespace-only address and assert that the Address field displays `—`.

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```powershell
npm test -- src/test/offline-consultation-pages.test.tsx
```

Expected: the address assertion fails because the card does not render an Address field, and the name-class assertion fails because the heading still uses `truncate`.

- [ ] **Step 3: Implement the minimal responsive markup**

In the demographics card:

```tsx
<h2 className="text-base font-semibold leading-snug text-slate-800 whitespace-normal break-words">
  {toMalayTitleCase(patient.name)}
</h2>
```

Below the IC/Gender grid, render:

```tsx
<div className="text-sm text-slate-600">
  <span className="text-xs text-slate-400 block">Address</span>
  <p className="mt-0.5 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
    {patient.address?.trim() || '—'}
  </p>
</div>
```

- [ ] **Step 4: Run focused and related tests and confirm GREEN**

Run:

```powershell
npm test -- src/test/offline-consultation-pages.test.tsx src/test/offline-consultation-review.test.tsx src/test/cross-doctor-consultation-detail.test.ts src/test/consultation-post-dispensary-notes.test.ts
```

Expected: all selected tests pass with zero failures.

- [ ] **Step 5: Run production verification**

Run:

```powershell
npx tsc --noEmit
npm run build
git diff --check
```

Expected: all commands exit with code 0.

- [ ] **Step 6: Commit and deploy**

```powershell
git add src/test/offline-consultation-pages.test.tsx src/pages/clinic/ConsultationDetail.tsx docs/superpowers/plans/2026-08-11-consultation-patient-identity-card.md
git commit -m "feat: show full patient identity in consultation"
git push origin HEAD:main
```

Then verify the GitHub security and Pages deployment workflows complete successfully and confirm the production bundle is updated.

