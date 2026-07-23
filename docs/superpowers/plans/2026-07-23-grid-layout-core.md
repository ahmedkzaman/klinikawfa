# Website Grid Layout Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe WordPress-like 12-column layout editor and shared responsive renderer to Home and custom Pages without changing any published page until an editor explicitly publishes a saved draft.

**Architecture:** Store an optional, strictly validated versioned layout inside the existing Home and general-page content payloads. Pure layout commands power a keyboard-accessible grid canvas; the editor preview and public route use the same allowlisted renderer, while adapters preserve the current layouts whenever no saved layout exists.

**Tech Stack:** React 18, TypeScript 5.8, Zod 3, React Hook Form, Tailwind CSS, Vitest, Testing Library, PostgreSQL JSONB validation through the existing Supabase draft/publish triggers.

## Global Constraints

- Preserve every existing word, media item, route, form, database connection, CMS lifecycle, and public layout unless an editor deliberately publishes a layout draft.
- Only `admin`, `special_admin`, `doctor_admin`, and `website_editor` retain website-management access; do not expand clinic, finance, employee, or system permissions.
- Store numeric grid data only: no arbitrary CSS, classes, styles, JavaScript, HTML, or component names.
- Desktop uses 12 columns; tablet and mobile layouts are derived automatically.
- Semantic `order` is the DOM, keyboard, screen-reader, and mobile order.
- Live preview remains a separate section at the bottom and uses the exact public renderer.
- Invalid or absent layouts fall back to deterministic adapters matching the current production presentation.
- Follow test-driven development: each production change starts with a focused failing test.
- Do not add a drag-and-drop dependency; use pointer events and pure commands.
- Do not bulk-rewrite existing content or production data.

---

## File structure

### Shared layout domain

- Create `src/features/website-cms/layout/types.ts`: public layout types and constants.
- Create `src/features/website-cms/layout/schema.ts`: strict Zod schema, page-kind allowlists, overlap validation, and safe parsing.
- Create `src/features/website-cms/layout/commands.ts`: immutable add, move, resize, reorder, visibility, duplicate, delete, reset, undo, and redo primitives.
- Create `src/features/website-cms/layout/defaults.ts`: deterministic Home and general-page defaults.
- Create `src/features/website-cms/layout/jsonSchema.ts`: server-equivalent JSON Schema fragment.

### Rendering and editing

- Create `src/components/website/WebsiteGridRenderer.tsx`: shared public/preview grid wrapper.
- Create `src/components/editor/layout/GridCanvas.tsx`: pointer and keyboard canvas.
- Create `src/components/editor/layout/BlockOrderPanel.tsx`: semantic/mobile order and block controls.
- Create `src/components/editor/layout/LayoutPresets.tsx`: safe preset chooser.
- Create `src/components/editor/layout/LayoutEditor.tsx`: state/history orchestration and accessible status messages.

### Existing integration points

- Modify `src/features/website-cms/schemas/home.ts`: optional Home layout.
- Modify `src/features/website-cms/schemas/page.ts`: optional general-page layout.
- Modify `src/features/website-cms/schemas/jsonSchemas.ts`: server schemas accept the same optional layout.
- Modify `src/components/home/HomeRenderer.tsx`: render Home sections through the shared renderer.
- Modify `src/components/website/GeneralPageRenderer.tsx`: render general-page blocks through the shared renderer.
- Modify `src/pages/editor/HomeEditor.tsx`: add Layout section and bind it to form state.
- Modify `src/pages/editor/PageEditor.tsx`: add Layout section and bind it to form state.
- Modify `src/components/editor/LivePreview.tsx`: add tablet viewport.
- Create `supabase/migrations/20260723190000_add_website_page_layout_validation.sql`: replace the existing Home/general payload validators with the generated layout-aware schemas.

### Tests

- Create `src/test/website-layout-schema.test.ts`.
- Create `src/test/website-layout-commands.test.ts`.
- Create `src/test/website-layout-defaults.test.ts`.
- Create `src/test/website-grid-renderer.test.tsx`.
- Create `src/test/layout-editor.test.tsx`.
- Modify `src/test/home-editor.test.tsx`.
- Modify `src/test/general-pages.test.tsx`.
- Create `src/test/website-layout-migration.test.ts`.

---

### Task 1: Strict layout schema and allowlists

**Files:**
- Create: `src/features/website-cms/layout/types.ts`
- Create: `src/features/website-cms/layout/schema.ts`
- Test: `src/test/website-layout-schema.test.ts`

**Interfaces:**
- Produces: `WebsiteLayout`, `WebsiteLayoutBlock`, `WebsiteLayoutKind`, `HOME_LAYOUT_KINDS`, `GENERAL_PAGE_LAYOUT_KINDS`, `websiteLayoutSchema(kinds)`, and `parseWebsiteLayout(value, kinds)`.
- Consumers: defaults, commands, renderer, Home schema, page schema, and migration schema.

- [ ] **Step 1: Write the failing boundary tests**

Cover one valid layout and rejection of an unknown key, duplicate ID, duplicate `contentRef`, duplicate/non-contiguous `order`, column overflow, overlap, zero/oversized row or height, and a kind outside the supplied allowlist.

```ts
const kinds = ["hero", "body"] as const;
const valid = {
  version: 1,
  blocks: [
    {
      id: "hero",
      kind: "hero",
      contentRef: "hero",
      order: 0,
      hidden: false,
      desktop: { column: 1, width: 12, row: 1, height: 1 },
    },
    {
      id: "body",
      kind: "body",
      contentRef: "body",
      order: 1,
      hidden: false,
      desktop: { column: 1, width: 8, row: 2, height: 2 },
    },
  ],
};

expect(websiteLayoutSchema(kinds).parse(valid)).toEqual(valid);
expect(() =>
  websiteLayoutSchema(kinds).parse({
    ...valid,
    blocks: [{ ...valid.blocks[0], desktop: { column: 8, width: 6, row: 1, height: 1 } }],
  }),
).toThrow();
```

- [ ] **Step 2: Run the schema test and verify RED**

Run: `npm test -- src/test/website-layout-schema.test.ts`

Expected: FAIL because `@/features/website-cms/layout/schema` does not exist.

- [ ] **Step 3: Implement strict types and schema**

Use these exact limits and shapes:

```ts
export const WEBSITE_GRID_COLUMNS = 12;
export const WEBSITE_GRID_MAX_ROW = 100;
export const WEBSITE_GRID_MAX_HEIGHT = 24;

export interface WebsiteLayoutBlock<K extends string = string> {
  id: string;
  kind: K;
  contentRef: string;
  order: number;
  hidden: boolean;
  desktop: { column: number; width: number; row: number; height: number };
}

export interface WebsiteLayout<K extends string = string> {
  version: 1;
  blocks: WebsiteLayoutBlock<K>[];
}

export const HOME_LAYOUT_KINDS = [
  "hero", "why", "video", "services", "gallery", "testimonials", "map",
] as const;

export const GENERAL_PAGE_LAYOUT_KINDS = [
  "title", "hero", "body", "media", "cta",
] as const;
```

Build the block with `.strict()`. In `.superRefine()`, use occupied cell keys `${row}:${column}` for every cell covered by each block, and emit issues at the offending block. Require sorted orders to equal `[0, 1, ... blocks.length - 1]`.

- [ ] **Step 4: Run the schema test and verify GREEN**

Run: `npm test -- src/test/website-layout-schema.test.ts`

Expected: all schema tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/website-cms/layout/types.ts src/features/website-cms/layout/schema.ts src/test/website-layout-schema.test.ts
git commit -m "Add strict website layout schema"
```

### Task 2: Pure layout commands and history

**Files:**
- Create: `src/features/website-cms/layout/commands.ts`
- Test: `src/test/website-layout-commands.test.ts`

**Interfaces:**
- Consumes: `WebsiteLayout` and `WebsiteLayoutBlock`.
- Produces: `moveBlock`, `resizeBlock`, `reorderBlock`, `setBlockHidden`, `duplicateBlock`, `deleteBlock`, `applyLayoutPreset`, `createLayoutHistory`, `applyLayoutCommand`, `undoLayout`, and `redoLayout`.

- [ ] **Step 1: Write failing command tests**

Assert immutability, valid move/resize, rejected collision returning the original layout plus `{ ok: false, reason }`, semantic reorder normalization, hide/show, deterministic duplicate ID through an injected ID, protected delete rejection, and exact undo/redo round-trips.

```ts
const result = moveBlock(layout, "body", { column: 5, row: 2 });
expect(result.ok).toBe(true);
expect(result.layout.blocks.find((block) => block.id === "body")?.desktop.column).toBe(5);
expect(layout.blocks.find((block) => block.id === "body")?.desktop.column).toBe(1);
```

- [ ] **Step 2: Run the command tests and verify RED**

Run: `npm test -- src/test/website-layout-commands.test.ts`

Expected: FAIL because the command module does not exist.

- [ ] **Step 3: Implement minimal immutable commands**

Use a shared result:

```ts
export type LayoutCommandResult<K extends string = string> =
  | { ok: true; layout: WebsiteLayout<K> }
  | { ok: false; layout: WebsiteLayout<K>; reason: string };
```

Every command constructs a candidate, validates it with the supplied schema, and returns the original layout on failure. History is:

```ts
export interface LayoutHistory<K extends string = string> {
  past: WebsiteLayout<K>[];
  present: WebsiteLayout<K>;
  future: WebsiteLayout<K>[];
}
```

Cap `past` at 50 entries. New commands clear `future`.

- [ ] **Step 4: Run command tests and verify GREEN**

Run: `npm test -- src/test/website-layout-commands.test.ts`

Expected: all command/history tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/website-cms/layout/commands.ts src/test/website-layout-commands.test.ts
git commit -m "Add safe website layout commands"
```

### Task 3: Deterministic adapters and optional content fields

**Files:**
- Create: `src/features/website-cms/layout/defaults.ts`
- Modify: `src/features/website-cms/schemas/home.ts`
- Modify: `src/features/website-cms/schemas/page.ts`
- Test: `src/test/website-layout-defaults.test.ts`

**Interfaces:**
- Produces: `createDefaultHomeLayout(sectionOrder)`, `createDefaultGeneralPageLayout(content)`, optional `layout` in `HomeContent` and `GeneralPageContent`.
- Consumers: renderer and editors.

- [ ] **Step 1: Write failing default-layout tests**

Assert Home creates one full-width block per `sectionOrder`, preserving exact order; a general page creates title/body and only creates hero/media/CTA blocks when their existing content is present; schemas accept missing layout and reject invalid layout.

```ts
expect(createDefaultHomeLayout(["hero", "video", "map"]).blocks).toMatchObject([
  { kind: "hero", order: 0, desktop: { column: 1, width: 12, row: 1, height: 1 } },
  { kind: "video", order: 1, desktop: { column: 1, width: 12, row: 2, height: 1 } },
  { kind: "map", order: 2, desktop: { column: 1, width: 12, row: 3, height: 1 } },
]);
```

- [ ] **Step 2: Run defaults tests and verify RED**

Run: `npm test -- src/test/website-layout-defaults.test.ts`

Expected: FAIL because defaults and optional schema fields do not exist.

- [ ] **Step 3: Implement adapters and optional schema fields**

Each default block uses `id === kind`, `contentRef === kind`, `hidden: false`, `column: 1`, `width: 12`, sequential row, and `height: 1`. Extend content schemas with:

```ts
layout: websiteLayoutSchema(HOME_LAYOUT_KINDS).optional()
```

and:

```ts
layout: websiteLayoutSchema(GENERAL_PAGE_LAYOUT_KINDS).optional()
```

Do not add `layout` to existing default objects or seed content.

- [ ] **Step 4: Run defaults and existing content tests**

Run:
`npm test -- src/test/website-layout-defaults.test.ts src/test/home-defaults.test.ts src/test/website-content-schemas.test.ts`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/website-cms/layout/defaults.ts src/features/website-cms/schemas/home.ts src/features/website-cms/schemas/page.ts src/test/website-layout-defaults.test.ts
git commit -m "Add default layouts to website content"
```

### Task 4: Shared responsive renderer

**Files:**
- Create: `src/components/website/WebsiteGridRenderer.tsx`
- Modify: `src/components/home/HomeRenderer.tsx`
- Modify: `src/components/website/GeneralPageRenderer.tsx`
- Test: `src/test/website-grid-renderer.test.tsx`
- Modify: `src/test/general-pages.test.tsx`

**Interfaces:**
- Consumes: validated layout, default layout, and `Record<kind, () => ReactNode>`.
- Produces: `WebsiteGridRenderer<K>`.

- [ ] **Step 1: Write failing renderer tests**

Test DOM order, hidden omission, numeric CSS custom properties, invalid-layout fallback, Home without layout preserving section order, general page without layout preserving its current DOM, and mobile-safe classes.

```tsx
render(
  <WebsiteGridRenderer
    allowedKinds={["hero", "body"] as const}
    fallbackLayout={fallback}
    layout={layout}
    renderBlock={{ hero: () => <div>Hero</div>, body: () => <div>Body</div> }}
  />,
);
expect(screen.getByText("Hero").parentElement).toHaveStyle({
  "--website-grid-column": "1",
  "--website-grid-width": "12",
});
```

- [ ] **Step 2: Run renderer tests and verify RED**

Run: `npm test -- src/test/website-grid-renderer.test.tsx`

Expected: FAIL because the shared renderer does not exist.

- [ ] **Step 3: Implement the renderer**

Parse `layout`; on failure use the already validated fallback. Sort by `order`, skip `hidden`, and set numeric variables only:

```tsx
style={{
  "--website-grid-column": block.desktop.column,
  "--website-grid-width": block.desktop.width,
  "--website-grid-row": block.desktop.row,
  "--website-grid-height": block.desktop.height,
} as React.CSSProperties}
```

Use a single-column base. At `md`, derive at most two columns from semantic order. At `lg`, use the saved 12-column placement. Do not add wrappers that change spacing for default full-width layouts.

- [ ] **Step 4: Route existing renderers through the shared renderer**

Home maps its seven existing section components to the Home registry. General pages map title, hero, body, media, and CTA to existing sanitized/rendered fragments. Both pass deterministic defaults when `content.layout` is absent.

- [ ] **Step 5: Run renderer and public-page tests**

Run:
`npm test -- src/test/website-grid-renderer.test.tsx src/test/general-pages.test.tsx src/test/home-video-clarity.test.tsx src/test/hero-background.test.tsx`

Expected: all tests PASS and existing presentation assertions remain unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/components/website/WebsiteGridRenderer.tsx src/components/home/HomeRenderer.tsx src/components/website/GeneralPageRenderer.tsx src/test/website-grid-renderer.test.tsx src/test/general-pages.test.tsx
git commit -m "Render website pages through safe grids"
```

### Task 5: Accessible grid editor components

**Files:**
- Create: `src/components/editor/layout/GridCanvas.tsx`
- Create: `src/components/editor/layout/BlockOrderPanel.tsx`
- Create: `src/components/editor/layout/LayoutPresets.tsx`
- Create: `src/components/editor/layout/LayoutEditor.tsx`
- Test: `src/test/layout-editor.test.tsx`

**Interfaces:**
- Consumes: a validated `WebsiteLayout`, allowed kinds, block labels, protected kinds, and `onChange(nextLayout)`.
- Produces: `<LayoutEditor />`.

- [ ] **Step 1: Write failing keyboard and control tests**

Assert selecting a block, Arrow-key move, Shift+Arrow resize, pointer drag producing the same command, order Up/Down buttons, hide/show, protected delete disabled, preset application, Undo/Redo, collision alert, and a polite live-region status.

```tsx
fireEvent.keyDown(screen.getByRole("button", { name: /hero block/i }), {
  key: "ArrowRight",
});
expect(onChange).toHaveBeenLastCalledWith(
  expect.objectContaining({
    blocks: expect.arrayContaining([
      expect.objectContaining({ id: "hero", desktop: expect.objectContaining({ column: 2 }) }),
    ]),
  }),
);
```

- [ ] **Step 2: Run component tests and verify RED**

Run: `npm test -- src/test/layout-editor.test.tsx`

Expected: FAIL because `LayoutEditor` does not exist.

- [ ] **Step 3: Implement the orchestration and canvas**

`LayoutEditor` owns command history, selected block, and status text. `GridCanvas` renders 12 visual columns and buttons positioned using the saved desktop coordinates. Pointer down records origin; pointer move calculates column/row deltas from the canvas bounding box; pointer up emits one command. Keyboard controls:

- Arrow keys: move one grid cell.
- Shift + ArrowLeft/Right: resize width.
- Shift + ArrowUp/Down: resize height.
- Home/End: first/last semantic order.

All controls have text labels and 44-pixel targets. Collision keeps the original layout and announces the reason.

- [ ] **Step 4: Implement order panel and presets**

The panel lists blocks in semantic order with Move up/down, Hide/Show, Duplicate, Reset block, and Delete. Presets produce non-overlapping layouts for full-width, two-column, three-column, content/sidebar, sidebar/content, and asymmetric feature. Applying a preset retains IDs, kinds, content references, visibility, and semantic order.

- [ ] **Step 5: Run component tests and verify GREEN**

Run: `npm test -- src/test/layout-editor.test.tsx`

Expected: all layout editor tests PASS with no accessibility warnings.

- [ ] **Step 6: Commit**

```bash
git add src/components/editor/layout src/test/layout-editor.test.tsx
git commit -m "Add accessible grid layout editor"
```

### Task 6: Add tablet preview mode

**Files:**
- Modify: `src/components/editor/LivePreview.tsx`
- Modify: `src/test/home-preview-safety.test.tsx`

**Interfaces:**
- Adds `tablet: 768` to the existing preview viewport controls.

- [ ] **Step 1: Write the failing tablet-preview test**

Render `LivePreview`, select Tablet, and assert the iframe has `data-preview-mode="tablet"` and `data-preview-width="768"` while remaining sandboxed and inert.

- [ ] **Step 2: Run the preview test and verify RED**

Run: `npm test -- src/test/home-preview-safety.test.tsx`

Expected: FAIL because no Tablet control exists.

- [ ] **Step 3: Implement the tablet control**

Extend:

```ts
type PreviewMode = "desktop" | "tablet" | "mobile";
const PREVIEW_WIDTHS = { desktop: 1280, tablet: 768, mobile: 390 } as const;
```

Add a Tablet button using Lucide's `Tablet` icon; keep all interaction blocking unchanged.

- [ ] **Step 4: Run the preview tests and verify GREEN**

Run: `npm test -- src/test/home-preview-safety.test.tsx`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/editor/LivePreview.tsx src/test/home-preview-safety.test.tsx
git commit -m "Add tablet website preview"
```

### Task 7: Integrate Layout into Home editor

**Files:**
- Modify: `src/pages/editor/HomeEditor.tsx`
- Modify: `src/test/home-editor.test.tsx`

**Interfaces:**
- Uses `form.watch("layout")`, `form.setValue("layout", next, { shouldDirty: true, shouldValidate: true })`, and `createDefaultHomeLayout(form.watch("sectionOrder"))`.

- [ ] **Step 1: Write the failing Home integration tests**

Assert the Layout section is visible, defaults are inferred when the draft lacks layout, moving a block marks the form dirty, Save Draft payload includes layout, preview uses unsaved layout, and a save failure retains the local layout.

- [ ] **Step 2: Run Home tests and verify RED**

Run: `npm test -- src/test/home-editor.test.tsx`

Expected: FAIL because Home has no grid Layout section.

- [ ] **Step 3: Add the Home Layout section**

Place it after content fields and before the separate bottom `LivePreview`. Pass labels for Hero, Why Klinik Awfa, Video, Services, Gallery, Testimonials, and Map. Every Home block is protected from deletion but may be hidden. If `layout` is absent, display the inferred layout; write it into form state only after the first layout command.

- [ ] **Step 4: Keep section order synchronized**

Whenever layout changes, set `sectionOrder` from visible and hidden block semantic order. When legacy section-order buttons are used, reorder the layout if present. Do not create two competing orders.

- [ ] **Step 5: Run Home tests and verify GREEN**

Run:
`npm test -- src/test/home-editor.test.tsx src/test/home-preview-safety.test.tsx src/test/home-defaults.test.ts`

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pages/editor/HomeEditor.tsx src/test/home-editor.test.tsx
git commit -m "Integrate grid editing into Home"
```

### Task 8: Integrate Layout into custom Page editor

**Files:**
- Modify: `src/pages/editor/PageEditor.tsx`
- Modify: `src/test/guided-page-sections.test.tsx`
- Modify: `src/test/editor-dirty-navigation.test.tsx`

**Interfaces:**
- Uses `createDefaultGeneralPageLayout(content)` and the same form binding as Home.

- [ ] **Step 1: Write failing Page integration tests**

Assert layout defaults match available content blocks, layout controls appear for new and existing pages, edit marks dirty, recoverable autosave contains layout, save payload includes layout, bottom preview shows the unsaved arrangement, and Reset affects the draft only.

- [ ] **Step 2: Run Page tests and verify RED**

Run:
`npm test -- src/test/guided-page-sections.test.tsx src/test/editor-dirty-navigation.test.tsx`

Expected: FAIL because PageEditor has no Layout section.

- [ ] **Step 3: Add Page Layout section**

Insert it before the existing separate bottom preview. Labels are Page title, Hero media, Main content, Media gallery, and Call to action. Title and body are protected; optional hero/media/CTA blocks may be deleted only by removing their corresponding existing content through the content panel. In the layout UI, their delete action means Hide to avoid destructive content loss.

- [ ] **Step 4: Preserve add/remove content behavior**

When content adds an optional block and layout is already saved, append its default block at the next free row. When content removes it, keep any layout metadata out of the saved payload by normalizing against currently available content references.

- [ ] **Step 5: Run Page tests and verify GREEN**

Run:
`npm test -- src/test/guided-page-sections.test.tsx src/test/editor-dirty-navigation.test.tsx src/test/general-pages.test.tsx`

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pages/editor/PageEditor.tsx src/test/guided-page-sections.test.tsx src/test/editor-dirty-navigation.test.tsx
git commit -m "Integrate grid editing into pages"
```

### Task 9: Server-equivalent JSON validation migration

**Files:**
- Create: `src/features/website-cms/layout/jsonSchema.ts`
- Modify: `src/features/website-cms/schemas/jsonSchemas.ts`
- Create: `supabase/migrations/20260723190000_add_website_page_layout_validation.sql`
- Create: `src/test/website-layout-migration.test.ts`

**Interfaces:**
- Produces a JSON Schema fragment with the same bounds and `additionalProperties: false`.
- Replaces only the two existing content-schema rows/definitions used by `private.website_page_payload_is_valid`.

- [ ] **Step 1: Write failing schema parity and migration tests**

Assert Home/general JSON schemas contain optional `layout`, require `version: 1`, restrict numeric bounds, reject unknown properties, and restrict kinds. Assert the migration updates validators without data writes, broad grants, service-role use, or changes to public RLS.

- [ ] **Step 2: Run migration tests and verify RED**

Run:
`npm test -- src/test/website-layout-migration.test.ts src/test/website-content-schemas.test.ts`

Expected: FAIL because server schemas do not contain layout.

- [ ] **Step 3: Implement JSON Schema generation**

Export `websiteLayoutJsonSchema(kinds)` returning a plain JSON-compatible object. Reuse it in Home and general-page schemas so client and checked-in server definitions use one source at build/test time.

- [ ] **Step 4: Write the forward-only migration**

Use `INSERT ... ON CONFLICT (kind) DO UPDATE SET schema = EXCLUDED.schema` against the existing website page schema table/function source identified in `20260721035032_add_website_page_publishing.sql`. Keep layout optional. Do not touch `website_pages`, drafts, versions, or published content. Preserve all existing validation properties and add only `layout`.

- [ ] **Step 5: Run schema and migration tests**

Run:
`npm test -- src/test/website-layout-migration.test.ts src/test/website-content-schemas.test.ts src/test/website-page-publishing-migration.test.ts`

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/website-cms/layout/jsonSchema.ts src/features/website-cms/schemas/jsonSchemas.ts supabase/migrations src/test/website-layout-migration.test.ts
git commit -m "Validate website layouts on the server"
```

### Task 10: Core verification and review

**Files:**
- Modify only files required by failures introduced by Tasks 1–9.

- [ ] **Step 1: Run focused layout and editor tests**

Run:

```bash
npm test -- \
  src/test/website-layout-schema.test.ts \
  src/test/website-layout-commands.test.ts \
  src/test/website-layout-defaults.test.ts \
  src/test/website-grid-renderer.test.tsx \
  src/test/layout-editor.test.tsx \
  src/test/home-editor.test.tsx \
  src/test/general-pages.test.tsx \
  src/test/home-preview-safety.test.tsx \
  src/test/website-layout-migration.test.ts
```

Expected: all focused tests PASS.

- [ ] **Step 2: Run the complete local gates**

Run:

```bash
npx tsc --noEmit
npm test
npm run lint:changed
npm run build
npm run build:dev
```

Expected: every command exits 0; only previously documented bundle-size or dependency informational warnings may remain.

- [ ] **Step 3: Perform read-only browser checks**

Start the local preview with configured public Vite environment names. Verify `/`, one public custom page, `/editor/home`, and one `/editor/pages/:id` route at desktop, 768-pixel tablet, and 390-pixel mobile. Confirm no horizontal overflow, console errors, submissions, DB writes, or publication actions.

- [ ] **Step 4: Review security and compatibility diff**

Confirm no secret values, `.env`, `node_modules`, `dist`, service-role use, broad grants, route changes, content rewrites, or production-data writes. Confirm all existing editor roles use the pre-existing website-manager capability.

- [ ] **Step 5: Commit verification fixes, if any**

Stage only the concrete source/test files changed to resolve a verified failure, inspect `git diff --cached`, then run:

```bash
git commit -m "Complete website grid core verification"
```

- [ ] **Step 6: Request code review**

Use `superpowers:requesting-code-review`, address actionable findings, rerun the complete gates, then use `superpowers:finishing-a-development-branch`.
