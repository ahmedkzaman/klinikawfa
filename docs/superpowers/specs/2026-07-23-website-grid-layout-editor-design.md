# Website Grid Layout Editor Design

**Status:** Approved direction, pending written-spec review

**Date:** 2026-07-23

## Goal

Give Klinik Awfa website managers a WordPress-like visual layout editor across
Home, custom Pages, Services, Team, Blog, Gallery, and Reviews without changing
existing words, media, routes, permissions, or published presentation until an
editor deliberately saves and publishes a draft.

## Delivery boundaries

The work is delivered in two independently testable increments:

1. **Core layout system:** shared schema, grid canvas, renderer, responsive
   behavior, presets, preview, Home adapter, and custom Page adapter.
2. **Resource templates:** Services, Team, Blog, Gallery, and Reviews listing
   and detail-template adapters using the same grid system.

Both increments use one layout format and one editor component. This avoids
parallel layout engines while keeping each pull request reviewable.

## User roles

The existing website-management capability remains authoritative:

- `admin`
- `special_admin`
- `doctor_admin`
- `website_editor`

No clinical, financial, employee-administration, or system-configuration
permissions are added. Layout drafts use the existing CMS draft, version,
publish, and audit paths.

## Editing experience

### Canvas

The Layout section appears in every applicable website editor. It contains:

- a 12-column desktop grid;
- draggable blocks that snap to grid columns and rows;
- resize handles constrained to the grid;
- a block-order sidebar;
- Undo and Redo;
- Duplicate, Hide/Show, Reset, and Delete where deletion is safe;
- Add block for supported block types;
- layout presets: full width, equal two-column, equal three-column,
  content/sidebar, sidebar/content, and asymmetric feature;
- exact keyboard alternatives for move and resize actions.

The canvas edits layout only. Block content continues to use the existing,
purpose-built content fields. Selecting a block focuses its existing content
panel rather than introducing an unrestricted HTML editor.

### Responsive behavior

Editors design one desktop grid. Tablet and mobile layouts are generated
automatically:

- desktop: saved 12-column positions;
- tablet: blocks retain order and may form two columns only when their saved
  widths permit it without crowding;
- mobile: one column in block-order sequence;
- hidden blocks remain hidden at every breakpoint;
- no absolute positioning or overlap is permitted.

The sidebar order is both the mobile reading order and DOM order. Desktop visual
placement never changes screen-reader or keyboard navigation order.

### Preview and publishing

The existing live-preview section stays separate at the bottom. It renders:

- the current unsaved local layout;
- the exact public renderer;
- Malay and English modes;
- desktop, tablet, and mobile viewport controls;
- no executable scripts, submissions, or navigation.

Save Draft and Publish retain their current meanings. Editing the grid marks the
page dirty. Publish remains a separate confirmed action and records the previous
published version.

## Layout model

Every layout-enabled content object gains an optional `layout` property:

```ts
type WebsiteLayout = {
  version: 1;
  blocks: WebsiteLayoutBlock[];
};

type WebsiteLayoutBlock = {
  id: string;
  kind: WebsiteBlockKind;
  contentRef: string;
  order: number;
  hidden: boolean;
  desktop: {
    column: number;
    width: number;
    row: number;
    height: number;
  };
};
```

Validation rules:

- `version` is exactly `1`;
- block IDs and content references are unique;
- `column` is `1..12`;
- `width` is `1..12` and cannot extend beyond column 12;
- `row` and `height` are bounded positive integers;
- blocks cannot overlap;
- `order` is contiguous and unique;
- `kind` must be allowlisted for the page/template;
- unknown properties are rejected;
- no CSS, class names, inline styles, JavaScript, or arbitrary component names
  are stored.

The server-side JSON schema receives the same rules as the client Zod schema.
Invalid layouts cannot be saved or published even if the browser is bypassed.

## Backward compatibility

`layout` is optional for all existing records. When absent, an adapter creates a
deterministic default layout matching the current public page:

- existing content is not rewritten during deployment;
- the public renderer preserves the current layout before an editor publishes a
  grid draft;
- opening an old page in the editor shows its inferred default grid;
- the inferred grid is stored only when the editor saves the draft;
- Reset layout returns to that page type's current production arrangement.

This is a forward-compatible content migration, not a bulk production-data
rewrite.

## Page and resource adapters

### Home

The existing sections become blocks: Hero, Why, Video, Services preview,
Gallery, Testimonials, and Map. The adapter keeps their current order and
full-width presentation by default.

### Custom Pages

Title, hero media, rich body, media collection, and CTA become addressable
blocks. Existing content fields and HTML sanitization remain unchanged.

### Services

The Services listing template exposes page header, category navigation, service
grid, and CTA blocks. The service detail template exposes title, hero,
description, service list, and appointment CTA blocks. Individual service
records keep their existing content model.

### Team

The Team listing template exposes page header, filters/grouping when present,
profile grid, and CTA blocks. Doctor/profile detail content remains sourced from
existing records.

### Blog

The Blog listing template exposes header, featured post, post grid, categories,
and pagination blocks. The post template exposes title/meta, hero, article,
related posts, and CTA blocks. Existing sanitized Markdown/rich-content
rendering remains authoritative.

### Gallery

The Gallery template exposes header, filters, gallery grid, lightbox guidance,
and CTA blocks. Media records and storage paths are unchanged.

### Reviews

The Reviews template exposes header, summary, review list/carousel, and CTA
blocks. Review moderation and publication state are unchanged.

## Renderer architecture

The shared `WebsiteGridRenderer` accepts a validated `WebsiteLayout`, an
allowlisted block registry, and the already-loaded content/resources. It:

1. sorts blocks by semantic `order`;
2. renders each allowlisted block component;
3. applies desktop CSS Grid placement through validated numeric CSS variables;
4. derives tablet/mobile classes without stored custom CSS;
5. omits hidden blocks;
6. falls back to the adapter default if layout validation fails.

Editor preview and public pages call this same renderer. Page-specific adapters
own data fetching and block content; the renderer does not query Supabase.

## Grid editor architecture

The shared editor is divided into focused units:

- `layoutSchema`: types, Zod validation, overlap checks, normalization;
- `layoutDefaults`: deterministic adapters for each page/template;
- `layoutCommands`: pure add, move, resize, reorder, hide, duplicate, delete,
  reset, undo, and redo operations;
- `GridCanvas`: pointer and keyboard interaction;
- `BlockOrderPanel`: semantic/mobile order and block actions;
- `LayoutPresets`: safe preset application;
- `WebsiteGridRenderer`: public and preview rendering;
- page adapters: map existing content fields to allowlisted blocks.

The command layer is framework-independent and fully unit-tested. Drag gestures
translate into commands; they never mutate form state directly.

## Error handling

- Invalid drag/resize operations remain at the last valid position.
- A visible message explains collisions or minimum-size restrictions.
- Failed draft saves preserve local layout changes.
- Stale-revision conflicts use the existing reload-and-merge flow.
- Unsupported or corrupted published layout data falls back to the current
  default layout and logs one redacted diagnostic.
- Missing referenced content hides only that block; the page shell remains
  usable.
- Reset requires confirmation and affects the draft only.

## Accessibility

- Every pointer action has a keyboard equivalent.
- Blocks expose their name, column, width, row, and order to assistive
  technology.
- Move and resize use arrow keys with documented modifiers.
- Focus stays on the moved block after commands.
- Status changes use a polite live region.
- Touch targets are at least 44 by 44 pixels.
- Color is never the only collision or selection indicator.
- Reduced-motion preferences disable animated block transitions.

## Visual direction

The editor follows a quiet professional publishing-tool appearance:

- neutral white and slate work surfaces;
- Klinik Awfa indigo for selection and primary actions;
- blue grid guides with clear numeric block labels;
- compact toolbars and restrained borders;
- no decorative gradients or presentation styling inside the editing canvas;
- public page styling remains unchanged by the editor rollout.

The memorable element is the numbered blue clinic-grid overlay: precise enough
for layout work and visually connected to Klinik Awfa's existing indigo identity.

## Security

- Only the existing website-manager capability can read/write private layouts.
- Public users receive published content only.
- Layout values are data, never executable markup or CSS.
- Block kinds and content references are allowlisted per adapter.
- Rich HTML continues through the existing sanitizers.
- Media continues through existing storage policies and media validation.
- Draft and publish operations retain revision checks and audit actors.
- No service-role key, database password, or secret enters browser code.

## Testing

### Pure unit tests

- schema accepts every valid boundary;
- schema rejects overflow, overlap, duplicate IDs/order, invalid kinds, and
  unknown properties;
- move/resize/reorder commands are deterministic;
- undo/redo round-trips exactly;
- default adapters preserve the current layouts;
- responsive ordering follows semantic order.

### Component tests

- pointer drag and keyboard move create the same command;
- collision feedback is visible and announced;
- presets create expected grids;
- selecting a block focuses the matching content panel;
- dirty-state navigation protection includes layout changes;
- bottom preview renders unsaved layout changes;
- editor role boundaries remain unchanged.

### Renderer tests

- Home and custom Pages preserve their current layout without saved grid data;
- every resource template renders allowlisted blocks only;
- desktop CSS placement matches validated coordinates;
- tablet/mobile order is safe and deterministic;
- hidden blocks are absent;
- invalid layout falls back safely;
- existing sanitizer and link-safety tests remain green.

### End-to-end checks

- create draft, arrange blocks, preview three viewports, save, reload, publish,
  and restore a previous version;
- direct public routes remain functional;
- desktop and 390-pixel mobile pages have no overlap or horizontal overflow;
- keyboard-only editing is possible;
- no console errors occur on editor or public pages.

## Rollout

1. Merge the core engine with optional schemas and unchanged public defaults.
2. Validate Home and custom Pages in staging.
3. Publish one non-critical test draft and restore it.
4. Enable Home and custom Pages in production.
5. Add and validate resource-template adapters.
6. Enable each resource editor after its route tests pass.

No existing content is bulk-converted, and no layout becomes public merely
because the feature is deployed.
