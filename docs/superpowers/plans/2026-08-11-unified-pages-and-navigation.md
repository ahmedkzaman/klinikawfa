# Unified Pages Catalogue and Navigation Destination Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show all public website destinations in the Website Editor Pages screen and let editors select those destinations when building navigation.

**Architecture:** Add a client-side catalogue module that composes fixed routes, generic pages, service summaries, and blog summaries without changing their source tables. Render the catalogue through a dedicated Pages UI, then reuse the same catalogue in Navigation through a searchable picker while continuing to store only `href` and bilingual labels.

**Tech Stack:** React 18, TypeScript, React Router, Supabase JavaScript client, Zod, Vitest, Testing Library, shadcn/ui.

## Global Constraints

- Do not migrate, duplicate, rename, or delete existing content records.
- Preserve all current public URLs, canonical tags, SEO/AEO records, drafts, and specialised editors.
- Keep custom HTTPS URLs and safe approved internal URLs supported.
- Do not allow public navigation to link to `/clinic`, `/staff`, `/editor`, JavaScript URLs, protocol-relative URLs, or malformed paths.
- A failing catalogue source must not hide destinations returned by the other sources.

---

### Task 1: Public Destination Catalogue Domain and Aggregation

**Files:**
- Create: `src/features/website-cms/catalogue/domain.ts`
- Create: `src/features/website-cms/catalogue/api.ts`
- Test: `src/test/website-destination-catalogue.test.ts`

**Interfaces:**
- Consumes: `listEditorPages(): Promise<EditorWebsitePageSummary[]>`, `listServiceResources(): Promise<ServiceResourceSummary[]>`, and `listResourceSummaries("blog_post"): Promise<WebsiteResourceSummary[]>`.
- Produces: `WebsiteDestination`, `WebsiteDestinationType`, `FIXED_WEBSITE_DESTINATIONS`, and `listWebsiteDestinations(): Promise<WebsiteDestinationCatalogueResult>`.

- [ ] **Step 1: Write the failing domain and aggregation tests**

Cover fixed routes, generic `/pages/:slug`, service `/services/:slug`, blog `/health-tips/:slug`, correct edit URLs, type/status metadata, deterministic deduplication by public URL, and partial-source failure reporting.

```ts
expect(result.items).toEqual(expect.arrayContaining([
  expect.objectContaining({ href: "/", type: "fixed", editHref: "/editor/home" }),
  expect.objectContaining({ href: "/services/rawatan-am", type: "service", editHref: "/editor/services/service-1" }),
  expect.objectContaining({ href: "/health-tips/demam", type: "post", editHref: "/editor/posts/post-1" }),
]));
expect(result.errors).toEqual(["page"]);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm.cmd test -- src/test/website-destination-catalogue.test.ts`

Expected: FAIL because the catalogue modules do not exist.

- [ ] **Step 3: Define the catalogue domain**

Implement this stable shape in `domain.ts`:

```ts
export type WebsiteDestinationType = "fixed" | "page" | "service" | "post";
export interface WebsiteDestination {
  id: string;
  type: WebsiteDestinationType;
  titleMs: string;
  titleEn: string;
  href: string;
  editHref: string | null;
  status: "draft" | "scheduled" | "published" | "trash";
  updatedAt: string | null;
}
export interface WebsiteDestinationCatalogueResult {
  items: WebsiteDestination[];
  errors: WebsiteDestinationType[];
}
```

Define fixed destinations for `/`, `/services`, `/doctors`, `/doctor-on-duty`, `/appointment`, `/gallery`, `/health-tips`, `/privacy`, and `/terms`, including their appropriate editor link or `null`.

- [ ] **Step 4: Implement fault-isolated aggregation**

Use `Promise.allSettled` in `api.ts`. Normalize trailing slashes, validate slugs using the existing schemas, deduplicate by normalized `href`, and prefer an editable dynamic record over a fixed duplicate only when both point to the exact same public URL. Return successful destinations together with source names that failed.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run: `npm.cmd test -- src/test/website-destination-catalogue.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the catalogue unit**

```powershell
git add -- src/features/website-cms/catalogue/domain.ts src/features/website-cms/catalogue/api.ts src/test/website-destination-catalogue.test.ts
git commit -m "feat: add website destination catalogue"
```

---

### Task 2: Unified Pages Catalogue Screen

**Files:**
- Create: `src/components/editor/pages/WebsitePagesCatalogue.tsx`
- Modify: `src/pages/editor/Pages.tsx`
- Test: `src/test/editor-pages-catalogue.test.tsx`

**Interfaces:**
- Consumes: `listWebsiteDestinations()` and `WebsiteDestination` from Task 1.
- Produces: a searchable, filterable Pages screen whose rows route to `editHref` and preview `href`.

- [ ] **Step 1: Write the failing Pages UI tests**

Mock the catalogue with fixed, service, page, and post entries. Verify all types appear, search and type filters work, status badges appear, Edit routes to the owning editor, View opens the public path, partial-source warnings remain visible, and Add page still points to `/editor/pages/new`.

```tsx
expect(await screen.findByText("Rawatan Telinga Kuantan")).toBeInTheDocument();
expect(screen.getByRole("link", { name: "Edit Rawatan Telinga Kuantan" }))
  .toHaveAttribute("href", "/editor/services/service-1");
expect(screen.getByRole("link", { name: "Add page" }))
  .toHaveAttribute("href", "/editor/pages/new");
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm.cmd test -- src/test/editor-pages-catalogue.test.tsx`

Expected: FAIL because Pages still renders the generic-page-only adapter.

- [ ] **Step 3: Implement the dedicated catalogue component**

Load once on mount with an active-request guard. Render search across both titles and URL; type and status filters; responsive table/cards with Type, Status, URL, Edit, and View; an amber source-warning banner; and Add page. Do not render bulk trash or lifecycle controls because the catalogue is not a content owner.

- [ ] **Step 4: Replace the Pages adapter screen**

Change `Pages.tsx` to render `<WebsitePagesCatalogue />`. Keep `pageAdapter` unchanged for generic page editing and lifecycle operations elsewhere.

- [ ] **Step 5: Run Pages and existing generic-page tests**

Run: `npm.cmd test -- src/test/editor-pages-catalogue.test.tsx src/test/general-pages.test.tsx src/test/editor-dashboard-wordpress.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit the Pages UI**

```powershell
git add -- src/components/editor/pages/WebsitePagesCatalogue.tsx src/pages/editor/Pages.tsx src/test/editor-pages-catalogue.test.tsx
git commit -m "feat: show unified website pages catalogue"
```

---

### Task 3: Safe Navigation Destination Selection

**Files:**
- Create: `src/components/editor/navigation/DestinationPicker.tsx`
- Modify: `src/pages/editor/Navigation.tsx`
- Modify: `src/features/website-cms/navigation/schema.ts`
- Test: `src/test/website-navigation-picker.test.tsx`
- Modify: `src/test/website-navigation.test.ts`

**Interfaces:**
- Consumes: `WebsiteDestination[]` from Task 1.
- Produces: `DestinationPicker` with `value`, `destinations`, `disabled`, and `onSelect(destination)` props; expanded safe internal-route validation.

- [ ] **Step 1: Write failing schema tests for real content routes**

Add valid cases `/services/rawatan-telinga-kuantan` and `/health-tips/demam-kuantan`. Add invalid cases `/clinic/queue`, `/staff`, `/editor/pages`, traversal, query-only injection, and protocol-relative URLs.

- [ ] **Step 2: Run schema test and verify RED**

Run: `npm.cmd test -- src/test/website-navigation.test.ts`

Expected: FAIL because dynamic service and post routes are currently rejected.

- [ ] **Step 3: Extend route validation narrowly**

Allow only these internal patterns in addition to the existing fixed routes:

```ts
/^\/pages\/[a-z0-9]+(?:-[a-z0-9]+)*$/
/^\/services\/[a-z0-9]+(?:-[a-z0-9]+)*$/
/^\/health-tips\/[a-z0-9]+(?:-[a-z0-9]+)*$/
```

Continue allowing absolute `https:` URLs and rejecting every other internal prefix.

- [ ] **Step 4: Write failing picker and Navigation integration tests**

Verify searchable options are grouped by type, selecting a destination fills `href`, placeholder labels are replaced with catalogue labels, established custom labels are retained, custom URLs remain editable, and unavailable-source warnings do not disable manual entry.

Verify visible trashed targets block publish; visible draft/scheduled targets show a warning but can be saved privately; published targets have no warning.

- [ ] **Step 5: Run picker tests and verify RED**

Run: `npm.cmd test -- src/test/website-navigation-picker.test.tsx`

Expected: FAIL because no picker or catalogue validation exists.

- [ ] **Step 6: Implement `DestinationPicker`**

Use an accessible combobox-style control with search and grouped results. Display bilingual title, URL, type, and status. Selecting calls `onSelect` with the complete destination; it does not mutate navigation state directly.

- [ ] **Step 7: Integrate the picker and publication safeguards**

Load the catalogue when Navigation mounts. Render `DestinationPicker` adjacent to Link URL. On selection, set `href`; replace labels only when empty or equal to `Pautan baharu` / `New link`. Before publish, map visible hrefs to catalogue items, reject trashed targets, and show warnings for draft/scheduled targets. Manual custom URLs continue through Zod validation.

- [ ] **Step 8: Run focused navigation tests and verify GREEN**

Run: `npm.cmd test -- src/test/website-navigation-picker.test.tsx src/test/website-navigation.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit Navigation selection**

```powershell
git add -- src/components/editor/navigation/DestinationPicker.tsx src/pages/editor/Navigation.tsx src/features/website-cms/navigation/schema.ts src/test/website-navigation-picker.test.tsx src/test/website-navigation.test.ts
git commit -m "feat: add navigation destination picker"
```

---

### Task 4: Regression Verification and Deployment

**Files:**
- Modify only if verification exposes a feature-specific defect.

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: validated `main` deployment and production smoke-test evidence.

- [ ] **Step 1: Run the focused editor suite**

```powershell
npm.cmd test -- src/test/website-destination-catalogue.test.ts src/test/editor-pages-catalogue.test.tsx src/test/website-navigation-picker.test.tsx src/test/website-navigation.test.ts src/test/general-pages.test.tsx src/test/website-services-editor.test.tsx src/test/editor-posts.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run static and production checks**

```powershell
npm.cmd run build
git diff --check
```

Expected: production build succeeds and `git diff --check` reports no whitespace errors.

- [ ] **Step 3: Review scope and preserve unrelated files**

Run `git status --short` and confirm `.superpowers/brainstorm/`, `deno.lock`, and `supabase/.temp/` remain untracked and unstaged.

- [ ] **Step 4: Push the validated commits**

```powershell
git push origin HEAD:main
```

- [ ] **Step 5: Monitor deployment**

Use `gh run list` and `gh run watch` to require a successful Security Gate and subsequent Deploy GitHub Pages run for the pushed commit.

- [ ] **Step 6: Production smoke test**

In the authenticated Website Editor, verify Pages lists fixed pages, services, generic pages, and blog posts; search and Edit work; Navigation can select service and blog destinations; private save does not change the live menu; and only explicit Publish changes the public header/footer.
