# Dispensary Item Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide confirmed, audited dispensary item removal for every clinic account except locum.

**Architecture:** Replace the direct table update with a narrowly scoped security-definer RPC. Keep soft-delete semantics and add a confirmation dialog around the existing row action.

**Tech Stack:** React, TypeScript, Vitest, Supabase PostgreSQL

## Global Constraints

- Locum accounts remain denied.
- Removal must be reversible through the existing voided-record audit workflow.
- Reserved medicine stock must be released by the existing inventory trigger.
- Permanent SQL deletion is not permitted.

---

### Task 1: Guard Soft Deletion

**Files:**
- Create: `supabase/migrations/20260725180000_guard_dispensary_item_removal.sql`
- Modify: `src/hooks/clinic/useConsultationItems.ts`
- Test: `src/test/guarded-dispensary-item-removal.test.ts`

**Interfaces:**
- Produces: `remove_consultation_item_dispensary(p_item_id uuid, p_consultation_id uuid) returns uuid`
- Consumes: `can_edit_dispensary_prices(auth.uid())`

- [ ] Write a failing test requiring the RPC and authorization checks.
- [ ] Verify the test fails against the direct update.
- [ ] Add the function and route `useRemoveConsultationItem` through it.
- [ ] Verify focused tests pass.

### Task 2: Confirm Removal

**Files:**
- Modify: `src/components/clinic/visit/VisitDetailsColumn.tsx`
- Test: `src/test/dispensary-item-removal-confirmation.test.ts`

**Interfaces:**
- Consumes: `useRemoveConsultationItem`
- Produces: Named confirmation dialog before mutation

- [ ] Write a failing source regression test for the dialog.
- [ ] Verify the test fails.
- [ ] Add pending-item state and an `AlertDialog`.
- [ ] Confirm only the dialog action invokes removal.

### Task 3: Verify And Deploy

- [ ] Run focused source checks and inspect the diff.
- [ ] Push to `main`.
- [ ] Require the complete Security Gate to pass.
- [ ] Verify the GitHub Pages deployment and live bundle.
