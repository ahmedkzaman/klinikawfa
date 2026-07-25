# Dispensary Payer and Price Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow every authenticated clinic role except locum to edit prices and switch a dispensary visit between self pay and panel.

**Architecture:** Extract pure permission and payer-update helpers so status and payload behavior can be regression-tested. The checkout page will use these helpers, persist payer changes through the existing queue-entry mutation, and derive panel calculations from the saved queue entry.

**Tech Stack:** React, TypeScript, TanStack Query, Supabase, Vitest

## Global Constraints

- Both `sent_to_dispensary` and `dispensing_payment` are editable dispensary stages.
- Locum cannot edit dispensary prices or payer details.
- Panel selection requires an active provider.
- Completed historical visits and inventory master prices are out of scope.

---

### Task 1: Dispensary Permission Helper

**Files:**
- Create: `src/lib/clinic/dispensaryPermissions.ts`
- Test: `src/test/dispensary-permissions.test.ts`
- Modify: `src/pages/clinic/DispenseCheckout.tsx`

**Interfaces:**
- Produces: `canEditDispensary(roleIsLocum: boolean, clinicStatus: string | null | undefined, consultationCanEdit: boolean): boolean`

- [ ] **Step 1: Write a failing test**

Test that non-locum users can edit at both dispensary statuses despite a stale consultation lock, locum cannot edit, and other statuses still honor the lock.

- [ ] **Step 2: Run the focused test and verify the expected failure**

Run: `npm test -- --run src/test/dispensary-permissions.test.ts`

- [ ] **Step 3: Implement the pure helper and use it in checkout**

Replace the exact `dispensing_payment` comparison with `canEditDispensary`.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `npm test -- --run src/test/dispensary-permissions.test.ts`

- [ ] **Step 5: Commit the permission fix**

Commit message: `fix: unlock active dispensary stages`

### Task 2: Payer Update Helper and Checkout Control

**Files:**
- Create: `src/lib/clinic/dispensaryPayer.ts`
- Test: `src/test/dispensary-payer.test.ts`
- Modify: `src/pages/clinic/DispenseCheckout.tsx`

**Interfaces:**
- Produces: `buildDispensaryPayerUpdate(payerType: 'self' | 'panel', panelId?: string | null): { panel_id: string | null; payment_method: 'cash' | 'panel' }`

- [ ] **Step 1: Write failing payload tests**

Test that self pay clears `panel_id` and sets `cash`, panel saves its provider and sets `panel`, and panel without a provider is rejected.

- [ ] **Step 2: Run the focused test and verify the expected failure**

Run: `npm test -- --run src/test/dispensary-payer.test.ts`

- [ ] **Step 3: Implement the helper**

Return the exact queue-entry update fields and throw `Select a panel provider.` when panel has no provider.

- [ ] **Step 4: Add checkout payer controls**

Load active providers, show Self Pay/Panel and provider selects, persist with `useUpdateQueueEntry`, disable for locum or while saving, and show success/error feedback. Let the existing invalidation refresh prices and totals from the saved queue entry.

- [ ] **Step 5: Run both focused tests**

Run: `npm test -- --run src/test/dispensary-permissions.test.ts src/test/dispensary-payer.test.ts`

- [ ] **Step 6: Commit the payer control**

Commit message: `feat: allow dispensary payer changes`

### Task 3: Verification and Deployment

**Files:**
- Verify all modified source, tests, and documentation.

**Interfaces:**
- Consumes: completed Tasks 1 and 2.
- Produces: deployed production build.

- [ ] **Step 1: Run the full test suite**

Run: `npm test -- --run`

- [ ] **Step 2: Run the production build**

Run: `npm run build`

- [ ] **Step 3: Review the final diff and repository status**

Confirm only intended files are committed; leave `supabase/.temp/` untracked.

- [ ] **Step 4: Push the branch to GitHub**

Push the tested commits without force.

- [ ] **Step 5: Deploy using the repository's production workflow**

Confirm the deployment workflow finishes successfully and the live site serves the new build.
