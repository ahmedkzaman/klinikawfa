# All Dispensary Item Price Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show visit-specific inline price editing for every dispensary item to every clinic account except locum.

**Architecture:** Reuse the existing dispensary edit gate, inline `PriceInput`, and guarded consultation-item RPC. Remove only the catalog-type rendering restriction; do not change inventory defaults or database authorization.

**Tech Stack:** React, TypeScript, Vitest, Supabase

## Global Constraints

- Locum accounts must never receive dispensary edit controls.
- Price changes affect only the selected `consultation_items` row.
- Existing guarded RPC authorization remains unchanged.

---

### Task 1: Render Price Editing For Every Dispensary Item

**Files:**
- Modify: `src/components/clinic/visit/VisitDetailsColumn.tsx`
- Test: `src/test/dispensary-all-item-price-editing.test.ts`

**Interfaces:**
- Consumes: `PriceInput`, `onPrice(id: string, nextPrice: number)`, and `canEdit`
- Produces: Inline price control for each rendered consultation item

- [ ] **Step 1: Write the failing regression test**

Create a source-level test that reads `VisitDetailsColumn.tsx`, verifies the
inline price control exists, and rejects the current `item_id`, `service_id`,
and `package_id` null condition around it.

- [ ] **Step 2: Verify the test fails**

Run:

```bash
npm test -- src/test/dispensary-all-item-price-editing.test.ts
```

Expected: failure because catalog foreign-key checks still wrap `PriceInput`.

- [ ] **Step 3: Implement the minimal UI change**

Render the existing price label and `PriceInput` directly inside the `canEdit`
controls for every row:

```tsx
<label className="flex items-center gap-1 text-[11px] text-muted-foreground">
  RM
  <PriceInput
    value={Number(item.price ?? 0)}
    onCommit={(value) => onPrice(item.id, value)}
  />
</label>
```

- [ ] **Step 4: Verify focused and related tests**

Run:

```bash
npm test -- src/test/dispensary-all-item-price-editing.test.ts src/test/dispensary-permissions.test.ts src/test/guarded-dispensary-item-update.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Run the release gate and deploy**

Push to `main`. Require lint, type check, unit tests, build, Deno tests,
dependency audit, and GitHub Pages deployment to pass before reporting live.
