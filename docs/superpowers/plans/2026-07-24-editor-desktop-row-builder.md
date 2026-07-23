# Editor Desktop Row Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a row-by-row desktop grid composer with explicit block assignments while preserving the existing freeform canvas and persisted layout schema.

**Architecture:** A pure row-layout module derives editable rows from `WebsiteLayout` and converts completed rows back into validated 12-column placements. A focused `DesktopRowBuilder` renders row controls and delegates completed changes to `LayoutEditor`, which continues to own history and status.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, Zod, Tailwind CSS, shadcn/ui, lucide-react.

## Global Constraints

- Keep `WebsiteLayout` version 1 backward-compatible.
- Visible blocks must be assigned exactly once; hidden blocks are excluded.
- Preserve the existing advanced canvas and mobile reading-order panel.
- Use existing editor colors, controls, icons, and accessibility patterns.

---

### Task 1: Row-layout conversion and validation

**Files:**
- Create: `src/features/website-cms/layout/rows.ts`
- Test: `src/test/website-layout-rows.test.ts`

**Interfaces:**
- Produces: `DesktopRowPreset`, `DesktopLayoutRow`, `deriveDesktopRows(layout)`, `setDesktopRowPreset(rows, rowId, preset)`, `assignDesktopRowSlot(rows, rowId, slotIndex, blockId)`, `reorderDesktopRow(rows, rowId, nextIndex)`, `validateDesktopRows(layout, rows)`, and `applyDesktopRows(layout, rows)`.

- [ ] **Step 1: Write failing tests**

Cover deriving existing equal/custom rows, exact preset widths, assignment
preservation, displaced assignments, duplicate and missing blocks, row
reordering, and reading-order normalization.

- [ ] **Step 2: Verify the tests fail**

Run: `npx vitest run src/test/website-layout-rows.test.ts --reporter=verbose`

Expected: FAIL because `rows.ts` does not exist.

- [ ] **Step 3: Implement the pure row utilities**

Use the existing 12-column placements. Generate stable row IDs from source row
numbers, retain block heights, and return a typed validation result rather than
throwing for incomplete editor state.

- [ ] **Step 4: Verify the tests pass**

Run: `npx vitest run src/test/website-layout-rows.test.ts --reporter=verbose`

Expected: all row-layout tests pass.

- [ ] **Step 5: Commit**

Commit message: `Add desktop row layout utilities`

### Task 2: Desktop row-builder interface

**Files:**
- Create: `src/components/editor/layout/DesktopRowBuilder.tsx`
- Test: `src/test/desktop-row-builder.test.tsx`

**Interfaces:**
- Consumes: row utilities from Task 1 and the existing `blockLabels`.
- Produces: `DesktopRowBuilder` with `layout`, `blockLabels`, and `onApply` props.

- [ ] **Step 1: Write failing component tests**

Cover rendering derived rows, changing a row preset, assigning a unique block,
showing unassigned content, adding/deleting/reordering rows, and refusing to
apply incomplete assignments.

- [ ] **Step 2: Verify the tests fail**

Run: `npx vitest run src/test/desktop-row-builder.test.tsx --reporter=verbose`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the row builder**

Render compact unframed row bands with icon reorder/delete buttons, a preset
select, and one block select per slot. Use tooltips for icon-only controls and
plain status copy for unassigned blocks.

- [ ] **Step 4: Verify the tests pass**

Run: `npx vitest run src/test/desktop-row-builder.test.tsx --reporter=verbose`

Expected: all component tests pass.

- [ ] **Step 5: Commit**

Commit message: `Add desktop row builder controls`

### Task 3: Layout editor integration

**Files:**
- Modify: `src/components/editor/layout/LayoutEditor.tsx`
- Modify: `src/components/editor/layout/GridCanvas.tsx`
- Test: `src/test/layout-editor.test.tsx`

**Interfaces:**
- Consumes: `DesktopRowBuilder`.
- Produces: row changes committed through the existing undo/redo history.

- [ ] **Step 1: Write failing integration tests**

Verify the row builder appears before the canvas, applying rows updates the
layout callback, undo restores the previous arrangement, and canvas changes
remain supported.

- [ ] **Step 2: Verify the tests fail**

Run: `npx vitest run src/test/layout-editor.test.tsx --reporter=verbose`

Expected: FAIL because the row builder is not integrated.

- [ ] **Step 3: Integrate through the existing commit path**

Place the row builder above the canvas. Route successful row layouts through
`commit`, retain presets and canvas controls, and avoid a second history owner.

- [ ] **Step 4: Verify focused and existing layout tests**

Run: `npx vitest run src/test/layout-editor.test.tsx src/test/website-layout-commands.test.ts src/test/website-layout-schema.test.ts --reporter=verbose`

Expected: all tests pass.

- [ ] **Step 5: Commit**

Commit message: `Integrate row builder with layout editor`

### Task 4: Full verification and visual QA

**Files:**
- Modify only if verification identifies a scoped defect.

- [ ] **Step 1: Run static and production checks**

Run: `npm run lint:changed`, `npx tsc --noEmit`, and `npm run build`.

Expected: exit code 0 for every command.

- [ ] **Step 2: Run the full relevant test suite**

Run: `npx vitest run src/test/website-layout-rows.test.ts src/test/desktop-row-builder.test.tsx src/test/layout-editor.test.tsx src/test/website-layout-commands.test.ts src/test/website-layout-schema.test.ts --reporter=verbose`.

Expected: all tests pass.

- [ ] **Step 3: Verify desktop and mobile visually**

Open the editor locally, configure `1 / 3 / 2` rows, confirm assignments and
canvas synchronization, save a draft, and inspect desktop and mobile preview
screenshots for clipping or overlap.

- [ ] **Step 4: Commit any verification-only fixes**

Commit only scoped fixes with message: `Polish desktop row builder`.
