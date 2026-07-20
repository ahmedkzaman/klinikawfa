# Website CMS Structured Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Home and general public pages editable through private drafts, a bottom Live Preview, atomic publishing, revision history, and safe rollback while preserving the existing site as the fallback.

**Architecture:** Shared Zod schemas define the content contract used by editor forms, preview renderers, public renderers, and publish validation. Current Home literals move mechanically into a typed bundled fallback. Database triggers on draft publication transitions snapshot the previous published payload and enforce optimistic concurrency in one transaction.

**Tech Stack:** React 18, TypeScript 5, Zod 3, React Hook Form, TanStack Query, Supabase Postgres/RLS, DOMPurify, Vitest, Testing Library.

## Global Constraints

- Do not rewrite existing Home wording, images, links, section order, or styling during extraction.
- `website_pages` contains published data only; `website_page_drafts` contains private drafts only.
- Preview renders local unsaved state and never writes, navigates, submits, initializes analytics, or becomes indexable.
- Malay is required; optional English falls back field-by-field to Malay.
- Unknown JSON keys, unsafe URLs, reserved slugs, unsupported section identifiers, and opacity outside 5–25 percent are rejected.
- Publishing is atomic and revision checked; stale drafts never overwrite newer content.
- No production content publication occurs in this plan.

---

### Task 1: Define the shared Home and general-page schemas

**Files:**
- Create: `src/features/website-cms/schemas/common.ts`
- Create: `src/features/website-cms/schemas/home.ts`
- Create: `src/features/website-cms/schemas/page.ts`
- Create: `src/features/website-cms/schemas/jsonSchemas.ts`
- Create: `src/test/website-content-schemas.test.ts`

**Interfaces:**
- Produces: `BilingualText`, `HomeContent`, `GeneralPageContent`, `homeContentSchema`, `homeBackgroundOpacitySchema`, `homeSectionOrderSchema`, `generalPageContentSchema`, `pageSlugSchema`, `safeHrefSchema`, `websiteCtaHrefSchema`, `HOME_JSON_SCHEMA`, `GENERAL_PAGE_JSON_SCHEMA`, `RESERVED_PAGE_SLUGS`.

- [ ] **Step 1: Write failing schema tests**

```ts
import { describe, expect, it } from "vitest";
import {
  homeBackgroundOpacitySchema,
  homeSectionOrderSchema,
} from "@/features/website-cms/schemas/home";
import {
  generalPageContentSchema,
  pageSlugSchema,
} from "@/features/website-cms/schemas/page";
import {
  safeHrefSchema,
  websiteCtaHrefSchema,
} from "@/features/website-cms/schemas/common";

describe("website content schemas", () => {
  it("requires Malay and permits empty English fallback", () => {
    const result = generalPageContentSchema.safeParse({
      title: { ms: "Halaman", en: "" },
      heroImage: null,
      heroAlt: { ms: "", en: "" },
      body: { ms: "<p>Kandungan</p>", en: "" },
      media: [],
      cta: null,
      seo: { title: { ms: "Halaman", en: "" }, description: { ms: "Ringkasan", en: "" } },
    });
    expect(result.success).toBe(true);
  });

  it("rejects reserved slugs and unsafe CTA URLs", () => {
    expect(pageSlugSchema.safeParse("clinic").success).toBe(false);
    expect(safeHrefSchema.safeParse("javascript:alert(1)").success).toBe(false);
    expect(websiteCtaHrefSchema.safeParse("/clinic/patients").success).toBe(false);
  });

  it.each([4, 26])("rejects background opacity %s", (opacity) => {
    expect(homeBackgroundOpacitySchema.safeParse(opacity).success).toBe(false);
  });

  it("rejects unknown Home sections", () => {
    expect(homeSectionOrderSchema.safeParse(["hero", "payments"]).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/test/website-content-schemas.test.ts`

Expected: FAIL because the schema modules do not exist.

- [ ] **Step 3: Implement the exact content contracts**

```ts
import { z } from "zod";
import { isSafeUrl } from "@/lib/security";

export const bilingualTextSchema = z.object({
  ms: z.string(),
  en: z.string().default(""),
}).strict();

export const requiredBilingualTextSchema = bilingualTextSchema.refine(
  ({ ms }) => ms.trim().length > 0,
  { message: "Malay content is required", path: ["ms"] },
);

export const safeHrefSchema = z.string().trim().refine(isSafeUrl, "Unsafe URL");

const protectedInternalPrefix = /^\/(?:auth|staff|clinic|editor|appointment|video-call|reset-password|locum-register|tv|api|functions|payment|payments|callback)(?:\/|$)/;

export const websiteCtaHrefSchema = safeHrefSchema.refine(
  (href) => !protectedInternalPrefix.test(href),
  "Protected internal routes cannot be linked from managed content",
);

export type BilingualText = z.infer<typeof bilingualTextSchema>;
```

`homeContentSchema` must be `.strict()` and contain `hero`, `why`, `video`, `services`, `gallery`, `testimonials`, `map`, and `sectionOrder`. `homeSectionOrderSchema` accepts each identifier once and no other value. `homeBackgroundOpacitySchema` is `z.number().min(5).max(25)`. Hero autoplay is an integer from 3000 through 15000 milliseconds, and item limits are integers from 1 through 12. Use the exported primitive schemas inside `homeContentSchema` so the focused tests exercise the same rules used in publishing.

`generalPageContentSchema` must be `.strict()` and contain bilingual title/body/alt/SEO fields, safe media records, and a nullable CTA whose href uses `websiteCtaHrefSchema`. Export a separate `pageSlugSchema` that rejects `auth`, `staff`, `clinic`, `appointment`, `services`, `doctors`, `doctor-on-duty`, `gallery`, `health-tips`, `editor`, `privacy`, `terms`, `video-call`, `tv`, `reset-password`, `locum-register`, `api`, and `functions`.

`jsonSchemas.ts` exports literal JSON Schema Draft 7 objects for Home and General Page. Every object uses `additionalProperties: false`; required properties match the Zod schemas; strings and arrays carry the same minimum/maximum constraints; opacity, autoplay, item limits, section identifiers, media types, and URL formats match exactly. Add a shared accepted/rejected fixture table to the test and assert the Zod result matches the expected result for each case. The migration test in Task 4 will prove the SQL validator embeds these exact JSON objects.

- [ ] **Step 4: Run the schema tests**

Run: `npx vitest run src/test/website-content-schemas.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the schemas**

```powershell
git add src/features/website-cms/schemas src/test/website-content-schemas.test.ts
git commit -m "Define structured website content schemas"
```

---

### Task 2: Extract the exact Home fallback and make Home components data-driven

**Files:**
- Create: `src/features/website-cms/home/homeDefaults.ts`
- Create: `src/test/home-defaults.test.ts`
- Modify: `src/components/home/HeroCarousel.tsx`
- Modify: `src/components/home/WhySection.tsx`
- Modify: `src/components/home/VideoSection.tsx`
- Modify: `src/components/home/ServicesPreview.tsx`
- Modify: `src/components/home/GalleryStrip.tsx`
- Modify: `src/components/home/TestimonialsSection.tsx`
- Modify: `src/components/home/MapSection.tsx`
- Modify: `src/pages/Index.tsx`

**Interfaces:**
- Produces: `DEFAULT_HOME_CONTENT: HomeContent`.
- Every Home section accepts only its typed slice plus `preview?: boolean`.

- [ ] **Step 1: Write a snapshot test before moving literals**

The test imports `DEFAULT_HOME_CONTENT`, validates it with `homeContentSchema`, and asserts these preservation anchors:

```ts
expect(DEFAULT_HOME_CONTENT.hero.slides.map((slide) => slide.title.ms)).toEqual([
  "Klinik Keluarga Anda",
  "Buka Setiap Hari",
  "Pengkhususan Minor Surgery",
]);
expect(DEFAULT_HOME_CONTENT.hero.backgroundOpacity).toBe(13);
expect(DEFAULT_HOME_CONTENT.hero.autoplayMs).toBe(5000);
expect(DEFAULT_HOME_CONTENT.sectionOrder).toEqual([
  "hero",
  "why",
  "video",
  "services",
  "gallery",
  "testimonials",
  "map",
]);
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/test/home-defaults.test.ts`

Expected: FAIL because `homeDefaults.ts` does not exist.

- [ ] **Step 3: Mechanically move current literals into `DEFAULT_HOME_CONTENT`**

Copy every current Malay/English heading, paragraph, slide, CTA label/link, image URL/import, visibility value, item limit, video setting key, and section order from the seven existing Home components. Do not edit punctuation, capitalization, spacing, or wording. Keep the existing clinic exterior import as the default hero background and `13` as opacity.

Each component receives typed props, for example:

```tsx
interface HeroCarouselProps {
  content: HomeContent["hero"];
  preview?: boolean;
}

export function HeroCarousel({ content, preview = false }: HeroCarouselProps) {
  const slides = content.slides;
  const backgroundOpacity = Math.min(25, Math.max(5, content.backgroundOpacity));
  // Keep the current markup and motion; replace literals with content fields.
}
```

In preview mode, prevent CTA navigation with `event.preventDefault()`. Keep current public behavior when `preview` is false.

- [ ] **Step 4: Render sections from the allowlisted order**

`Index.tsx` must map `sectionOrder` through a fixed record of render functions. It must never resolve a component name dynamically from content.

```tsx
const HOME_SECTION_RENDERERS: Record<HomeSectionId, () => React.ReactNode> = {
  hero: () => <HeroCarousel content={content.hero} />,
  why: () => <WhySection content={content.why} />,
  video: () => <VideoSection content={content.video} />,
  services: () => <ServicesPreview content={content.services} />,
  gallery: () => <GalleryStrip content={content.gallery} />,
  testimonials: () => <TestimonialsSection content={content.testimonials} />,
  map: () => <MapSection content={content.map} />,
};
```

- [ ] **Step 5: Run preservation, sanitizer, and build tests**

Run:

```powershell
npx vitest run src/test/home-defaults.test.ts src/test/website-content-schemas.test.ts src/test/sanitize-rich-html.test.ts
npx tsc --noEmit
npm run build
```

Expected: PASS; the generated Home content remains visually unchanged with fallback data.

- [ ] **Step 6: Commit the data-driven Home renderer**

```powershell
git add src/features/website-cms/home src/components/home src/pages/Index.tsx src/test/home-defaults.test.ts
git commit -m "Make homepage content data driven"
```

---

### Task 3: Add page repository hooks with safe fallback behavior

**Files:**
- Create: `src/features/website-cms/api/pages.ts`
- Create: `src/features/website-cms/hooks/useWebsitePage.ts`
- Create: `src/test/use-website-page.test.tsx`
- Modify: `src/pages/Index.tsx`

**Interfaces:**
- Produces: `fetchPublishedPage(slug)`, `fetchEditorPage(slug)`, `savePageDraft(input)`, `usePublishedPage(slug, fallback)`.

- [ ] **Step 1: Write failing repository tests**

Test that a successful published row parses through the correct Zod schema; missing/error/invalid data returns the bundled fallback; editor fetch returns both published page and private draft only for an authorized session; and a missing private draft is represented in memory as the current published payload with `baseRevision = revision` without performing a write.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npx vitest run src/test/use-website-page.test.tsx`

Expected: FAIL because API/hook modules do not exist.

- [ ] **Step 3: Implement fail-safe reads**

```ts
export async function fetchPublishedPage<T>(
  slug: string,
  schema: z.ZodType<T>,
  fallback: T,
): Promise<T> {
  const { data, error } = await supabase
    .from("website_pages")
    .select("slug,published_content,status,revision")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (error || !data) return fallback;
  const parsed = schema.safeParse(data.published_content);
  return parsed.success ? parsed.data : fallback;
}
```

`savePageDraft` validates locally, then upserts only `website_page_drafts` with `page_id`, `draft_content`, and `base_revision`. It omits `updated_by`/`updated_at` because the foundation trigger stamps them from `auth.uid()`. It must never update `website_pages`.

`fetchEditorPage` does not auto-write on open. If no private draft exists, it returns a synthesized editor draft copied from the current published payload and revision; the first explicit Save Draft creates the private row.

- [ ] **Step 4: Wire Home to `usePublishedPage("home", DEFAULT_HOME_CONTENT)`**

Keep the fallback visible during initial loading and on query failure; do not flash a blank page or error screen.

- [ ] **Step 5: Run tests and build**

Run:

```powershell
npx vitest run src/test/use-website-page.test.tsx src/test/home-defaults.test.ts
npx tsc --noEmit
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit the repository layer**

```powershell
git add src/features/website-cms/api src/features/website-cms/hooks src/pages/Index.tsx src/test/use-website-page.test.tsx
git commit -m "Add safe published page loading"
```

---

### Task 4: Implement atomic page publishing and version history

**Files:**
- Create via CLI: `supabase/migrations/*_add_website_page_publishing.sql`
- Create: `src/test/website-page-publishing-migration.test.ts`
- Modify: `src/features/website-cms/api/pages.ts`
- Modify: `src/features/website-cms/schemas/jsonSchemas.ts`

**Interfaces:**
- Produces trigger function: `private.publish_website_page_draft()`.
- Produces API: `publishPageDraft({ pageId, expectedRevision })` and `restorePageVersionToDraft({ pageId, versionId })`.

- [ ] **Step 1: Write the failing migration test**

Assert the migration enables `pg_jsonschema` in `extensions`, embeds `HOME_JSON_SCHEMA` and `GENERAL_PAGE_JSON_SCHEMA` exactly, creates a private trigger function, validates on draft save and again before publish, locks the published page with `FOR UPDATE`, compares `draft.base_revision` to `page.revision`, inserts a version before replacement, increments revision, and raises SQLSTATE `40001` for a stale draft.

- [ ] **Step 2: Generate the migration and implement the trigger contract**

Run: `npx supabase migration new add_website_page_publishing`

Use a request column `publish_requested_at` on `website_page_drafts`. A `BEFORE UPDATE OF publish_requested_at` trigger performs:

```sql
CREATE EXTENSION IF NOT EXISTS pg_jsonschema WITH SCHEMA extensions;
```

Create `private.website_page_payload_is_valid(p_kind text, p_payload jsonb) RETURNS boolean` as `IMMUTABLE`, `SECURITY INVOKER`, and fixed `search_path = pg_catalog`. Its exhaustive PL/pgSQL `CASE` passes the Home schema for `home`, the General Page schema for `system_content` and `content`, and returns `false` for every other kind. Each branch calls `extensions.jsonb_matches_schema` with the exact JSON literal serialized from `jsonSchemas.ts`; the migration test compares parsed equality rather than formatting. Revoke `PUBLIC` execution and grant execution only to `authenticated`, because the draft-validation trigger invokes it under the caller.

Add a `BEFORE INSERT OR UPDATE OF draft_content` trigger that looks up the page kind and raises SQLSTATE `22023` unless `private.website_page_payload_is_valid(kind, NEW.draft_content)` is true. The publish trigger repeats the same validation after locking the page, so invalid private drafts are rejected both before storage and before publication.

After validation, the publish trigger performs:

```sql
IF NOT private.can_manage_website() THEN
  RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
END IF;

SELECT * INTO v_page
FROM public.website_pages
WHERE id = NEW.page_id
FOR UPDATE;

IF NEW.base_revision <> v_page.revision THEN
  RAISE EXCEPTION 'stale website page draft' USING ERRCODE = '40001';
END IF;

INSERT INTO public.website_content_versions
  (resource_type, resource_id, revision, payload, published_by)
VALUES
  ('page', v_page.id, v_page.revision, v_page.published_content, auth.uid());

UPDATE public.website_pages
SET published_content = NEW.draft_content,
    status = 'published',
    revision = revision + 1,
    published_at = now(),
    published_by = auth.uid(),
    updated_at = now()
WHERE id = NEW.page_id;

NEW.base_revision := v_page.revision + 1;
NEW.updated_by := auth.uid();
NEW.updated_at := now();
RETURN NEW;
```

The trigger function is `SECURITY DEFINER`, uses `SET search_path = pg_catalog`, fully qualifies every non-`pg_catalog` object, is not callable through the Data API, and is revoked from `PUBLIC`; trigger invocation remains internal. Its migration test must assert those properties.

- [ ] **Step 3: Implement client publish and restore-to-draft APIs**

Publish updates only `publish_requested_at` and filters by `page_id` plus `base_revision`. Restore reads an authorized version and updates `website_page_drafts.draft_content`; it never writes `website_pages` directly.

- [ ] **Step 4: Run focused tests**

Run:

```powershell
npx vitest run src/test/website-page-publishing-migration.test.ts src/test/use-website-page.test.tsx
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit atomic publishing**

```powershell
git add supabase/migrations src/test/website-page-publishing-migration.test.ts src/features/website-cms/api/pages.ts
git commit -m "Add atomic website page publishing"
```

---

### Task 5: Build the Home editor and bottom Live Preview

**Files:**
- Create: `src/components/editor/LivePreview.tsx`
- Create: `src/pages/editor/HomeEditor.tsx`
- Create: `src/pages/editor/VersionsPanel.tsx`
- Create: `src/test/home-editor.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- `LivePreview({ children, title })` provides Desktop 1280 px and Mobile 390 px frames.
- Home editor exposes Save Draft, Publish, reload conflict, and version restore-to-draft.

- [ ] **Step 1: Write failing editor tests**

Test that local form changes appear in the bottom preview before Save Draft, preview links are prevented, Desktop/Mobile controls update frame width, Save Draft calls only the draft API, Publish requires confirmation, and stale revision shows reload/merge guidance.

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/test/home-editor.test.tsx`

Expected: FAIL because editor components do not exist.

- [ ] **Step 3: Implement the editor with shared schema and renderer**

Use React Hook Form with `zodResolver(homeContentSchema)`. Keep the form above and render this as the last page section:

```tsx
<section aria-labelledby="live-preview-title" className="mt-12 border-t pt-10">
  <LivePreview title={language === "ms" ? "Pratonton Langsung" : "Live Preview"}>
    <HomeRenderer content={form.watch()} preview />
  </LivePreview>
</section>
```

Add `beforeunload` and internal navigation blocking only when `form.formState.isDirty` is true. Upload errors do not overwrite the current form URL.

- [ ] **Step 4: Register `/editor/home`**

Replace the temporary unavailable-state child route with `HomeEditor` and keep it behind `EditorProtectedRoute`.

- [ ] **Step 5: Run editor tests, TypeScript, and build**

Run:

```powershell
npx vitest run src/test/home-editor.test.tsx src/test/website-content-schemas.test.ts src/test/sanitize-rich-html.test.ts
npx tsc --noEmit
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit the Home editor**

```powershell
git add src/components/editor src/pages/editor/HomeEditor.tsx src/pages/editor/VersionsPanel.tsx src/App.tsx src/test/home-editor.test.tsx
git commit -m "Add homepage draft preview and publishing"
```

---

### Task 6: Add general page creation, editing, preview, and public rendering

**Files:**
- Create: `src/pages/editor/Pages.tsx`
- Create: `src/pages/editor/PageEditor.tsx`
- Create: `src/pages/GeneralPage.tsx`
- Create: `src/components/website/GeneralPageRenderer.tsx`
- Create: `src/test/general-pages.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces editor routes `/editor/pages` and `/editor/pages/:id`.
- Produces public route `/pages/:slug`.

- [ ] **Step 1: Write failing route/render tests**

Test valid published content, Malay fallback, English field fallback, sanitized rich HTML, 404 for missing/unpublished pages, rejected reserved slug, and preview interaction blocking.

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/test/general-pages.test.tsx`

Expected: FAIL because page components do not exist.

- [ ] **Step 3: Implement the editor and renderer**

`PageEditor` uses `generalPageContentSchema`, Save Draft, bottom `LivePreview`, Publish, and history. On first creation, insert `website_pages` with `kind='content'`; database defaults enforce `status='draft'` and an empty published payload, then insert the private draft. `Pages` lists both ordinary content and pre-seeded `system_content` rows. System-content and published slugs are read-only in the Website Editor UI; only an Administrator may later perform a separate redirect-aware slug migration.

`GeneralPageRenderer` sanitizes body HTML with `sanitizeRichHtml`, renders only allowlisted media types, and validates CTA links before rendering.

- [ ] **Step 4: Register editor and public routes**

Add `/pages/:slug` before the final catch-all route. Keep `/editor/pages` and `/editor/pages/:id` under the editor guard.

- [ ] **Step 5: Run all page tests and builds**

Run:

```powershell
npx vitest run src/test/general-pages.test.tsx src/test/home-editor.test.tsx src/test/sanitize-rich-html.test.ts
npx tsc --noEmit
npm run build
npm run build:dev
```

Expected: PASS.

- [ ] **Step 6: Commit general pages**

```powershell
git add src/pages/editor/Pages.tsx src/pages/editor/PageEditor.tsx src/pages/GeneralPage.tsx src/components/website/GeneralPageRenderer.tsx src/App.tsx src/test/general-pages.test.tsx
git commit -m "Add editable public content pages"
```

---

### Task 7: Seed exact Home content and verify staging publication

**Files:**
- Create via CLI: `supabase/migrations/*_seed_website_home_content.sql`
- Create: `src/test/website-home-seed.test.ts`

**Interfaces:**
- Seeds one `website_pages` row with `kind='home'`, `slug='home'`, exact bundled payload, `status='published'`, and revision `1`.
- Seeds one matching `website_page_drafts` row only through an authenticated staging fixture after migration; the migration itself must not fabricate an auth user.

- [ ] **Step 1: Generate an exact JSON snapshot from `DEFAULT_HOME_CONTENT`**

Add a deterministic test that JSON serialization of the TypeScript default equals the SQL seed payload after JSON parsing.

- [ ] **Step 2: Generate the seed migration with the CLI**

Run: `npx supabase migration new seed_website_home_content`

- [ ] **Step 3: Add an idempotent guarded seed**

Insert only when `slug='home'` is absent. If a Home row exists with a different payload, raise an exception rather than overwrite it. Do not update any existing public content.

- [ ] **Step 4: Run the exact-value test**

Run: `npx vitest run src/test/website-home-seed.test.ts src/test/home-defaults.test.ts`

Expected: PASS with byte-equivalent JSON values after canonical key ordering.

- [ ] **Step 5: Commit and stop before staging application**

```powershell
git add supabase/migrations src/test/website-home-seed.test.ts
git commit -m "Seed exact homepage CMS content"
```

Apply to sanitized staging only after the Plan 1 guard passes. Verify Home before/after screenshots, response payload, revision, and zero production changes.
