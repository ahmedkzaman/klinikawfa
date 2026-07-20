# Website CMS Resources, Media, Reviews, and Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move services, team/doctors, blog, gallery, public testimonials, and navigation into the isolated Website Editor workflow with bilingual fields, safe media handling, private drafts, preview, publish, and history.

**Architecture:** Typed resource adapters normalize each existing table into one draft/publish interface while fixed database trigger branches prevent client-controlled table or column names. Public reviews use `website_review_presentations`, never `clinic_reviews`. Navigation and media have dedicated validators and RLS/Storage boundaries.

**Tech Stack:** React 18, TypeScript 5, Zod 3, React Hook Form, TanStack Query, Supabase Postgres/RLS/Storage, DOMPurify, Vitest, Testing Library.

## Global Constraints

- Preserve existing resource rows, public routes, ordering, URLs, and wording during migration.
- Add bilingual presentation columns only where missing; copy current text into Malay and leave optional English empty.
- Website Editor never reads or writes `clinic_reviews`, patient data, leads/appointments, staff records, finance, or private Storage.
- Rich-text preview and public output use `sanitizeRichHtml`.
- Publishing uses fixed resource branches and optimistic revisions; no dynamic SQL from client input.
- Media filenames are immutable UUID paths; replacement creates a new object URL.
- `website-media` is intentionally public for the static site; the uploader must warn that an uploaded object is publicly retrievable before content publication and must never be used for patient/private material.
- No production publication or migration application occurs in this plan.

---

### Task 1: Define resource adapter and validation contracts

**Files:**
- Create: `src/features/website-cms/resources/types.ts`
- Create: `src/features/website-cms/resources/schemas.ts`
- Create: `src/features/website-cms/resources/jsonSchemas.ts`
- Create: `src/features/website-cms/resources/registry.ts`
- Create: `src/test/website-resource-schemas.test.ts`

**Interfaces:**
- Produces `WebsiteResourceType = "service" | "team_member" | "blog_post" | "gallery_image" | "review"` and `CreatableWebsiteResourceType = Exclude<WebsiteResourceType, "service">`.
- Produces `ResourceAdapter<TPublished, TDraft>` with `parsePublished`, `parseDraft`, `toDraft`, `renderPreview`.
- Produces one JSON Schema Draft 7 constant per resource type for database-side draft/publish validation.

- [ ] **Step 1: Write failing contract tests**

```ts
const validService = (overrides: Partial<ServiceDraft> = {}): ServiceDraft => ({
  slug: "rawatan-umum",
  titleMs: "Rawatan Umum",
  titleEn: "",
  descriptionMs: "<p>Rawatan umum</p>",
  descriptionEn: "",
  callToActionMs: "Buat Temujanji",
  callToActionEn: "",
  servicesListMs: ["Konsultasi"],
  servicesListEn: [],
  heroImageUrl: null,
  promoVideoUrl: null,
  ...overrides,
});

it("registers exactly the approved resources", () => {
  expect(Object.keys(websiteResourceRegistry).sort()).toEqual([
    "blog_post",
    "gallery_image",
    "review",
    "service",
    "team_member",
  ]);
});

it("rejects an arbitrary resource type", () => {
  expect(websiteResourceTypeSchema.safeParse("patients").success).toBe(false);
});

it("requires Malay fields and permits English fallback", () => {
  expect(serviceDraftSchema.parse(validService({ titleEn: "" })).titleMs).toBeTruthy();
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/test/website-resource-schemas.test.ts`

Expected: FAIL because the resource modules do not exist.

- [ ] **Step 3: Implement strict schemas and registry**

Use `.strict()` Zod objects. Services include `titleMs`, `titleEn`, `descriptionMs`, `descriptionEn`, bilingual CTA, `servicesListMs`, `servicesListEn`, hero image, and promo video. Team/blog map their current bilingual fields. Gallery adds bilingual alt text, tags, display order, and `isVisible`. Review includes only bilingual display name/text, rating, source label, status, and display order.

Create literal resource JSON Schemas with `additionalProperties: false` at every object level and the same required keys, types, lengths, array limits, enums, rating/order bounds, and URL rules as Zod. The tests use a shared accepted/rejected fixture corpus and assert each Zod schema returns the expected result. Task 3's migration test compares the parsed SQL JSON literals to these constants exactly.

```ts
import type { ReactNode } from "react";

export interface ResourceAdapter<TPublished, TDraft> {
  parsePublished(value: unknown): TPublished;
  parseDraft(value: unknown): TDraft;
  toDraft(value: TPublished): TDraft;
  renderPreview(value: TDraft, context: ResourcePreviewContext): ReactNode;
}

type ResourcePublishedByType = {
  service: ServicePublished;
  team_member: TeamMemberPublished;
  blog_post: BlogPostPublished;
  gallery_image: GalleryImagePublished;
  review: ReviewPresentationPublished;
};

type ResourceDraftByType = {
  service: ServiceDraft;
  team_member: TeamMemberDraft;
  blog_post: BlogPostDraft;
  gallery_image: GalleryImageDraft;
  review: ReviewPresentationDraft;
};

export const websiteResourceRegistry: {
  [K in WebsiteResourceType]: ResourceAdapter<ResourcePublishedByType[K], ResourceDraftByType[K]>;
} = {
  service: serviceAdapter,
  team_member: teamMemberAdapter,
  blog_post: blogPostAdapter,
  gallery_image: galleryImageAdapter,
  review: reviewPresentationAdapter,
};
```

- [ ] **Step 4: Run focused tests**

Run: `npx vitest run src/test/website-resource-schemas.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the resource contracts**

```powershell
git add src/features/website-cms/resources src/test/website-resource-schemas.test.ts
git commit -m "Define website resource adapters"
```

---

### Task 2: Add bilingual presentation columns and exact-value review isolation seed

**Files:**
- Create via CLI: `supabase/migrations/*_add_website_resource_presentations.sql`
- Create: `src/test/website-resource-presentation-migration.test.ts`

**Interfaces:**
- Adds service fields: `title_ms`, `title_en`, `description_ms`, `description_en`, `call_to_action_ms`, `call_to_action_en`, `services_list_ms`, `services_list_en`.
- Adds gallery fields: `alt_text_ms`, `alt_text_en`, `is_visible boolean NOT NULL DEFAULT true`.
- Seeds `website_review_presentations` from the existing public `reviews` presentation table, never from patient-linked `clinic_reviews`.

- [ ] **Step 1: Write the failing migration test**

Assert the migration adds columns with no destructive rename/drop, copies legacy values only when bilingual columns are null, inserts only safe fields from `public.reviews`, never selects from `public.clinic_reviews`, and never creates a Website Editor policy on `clinic_reviews`.

- [ ] **Step 2: Generate the migration**

Run: `npx supabase migration new add_website_resource_presentations`

- [ ] **Step 3: Implement forward-only, idempotent preservation SQL**

Use `ADD COLUMN IF NOT EXISTS`. Backfill with `COALESCE(new_column, legacy_column)` and never overwrite a non-null bilingual value. For services, copy `title`, `description`, `call_to_action`, and `services_list` into Malay fields. For gallery, copy `alt_text` into `alt_text_ms`; existing images remain visible.

Seed review presentations with exactly these source columns:

```sql
INSERT INTO public.website_review_presentations
  (source_review_id, name_ms, name_en, review_text_ms, review_text_en, rating, source_label, status, display_order, published_at)
SELECT
  id,
  name_ms,
  name_en,
  text_ms,
  text_en,
  rating,
  'Klinik Awfa',
  'published',
  display_order,
  updated_at
FROM public.reviews
WHERE published = true
ON CONFLICT (source_review_id) DO NOTHING;
```

The statement must not reference `public.clinic_reviews` or copy patient IDs, operational review state, Google IDs, or WhatsApp workflow metadata. Existing `clinic_reviews` policies remain unchanged.

- [ ] **Step 4: Run migration and preservation tests**

Run: `npx vitest run src/test/website-resource-presentation-migration.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the presentation migration**

```powershell
git add supabase/migrations src/test/website-resource-presentation-migration.test.ts
git commit -m "Add bilingual website resource presentations"
```

---

### Task 3: Implement fixed-branch resource draft and publish transactions

**Files:**
- Create via CLI: `supabase/migrations/*_add_website_resource_publishing.sql`
- Create: `src/features/website-cms/api/resources.ts`
- Create: `src/test/website-resource-publishing-migration.test.ts`
- Create: `src/test/website-resources-api.test.ts`

**Interfaces:**
- Produces trigger `private.publish_website_resource_draft()`.
- Produces `fetchResourceList(type)`, `fetchResourceEditor(type,id)`, `createResourceDraft(type,payload)`, `saveResourceDraft(input)`, `publishResourceDraft(input)`, `restoreResourceVersion(input)`.

- [ ] **Step 1: Write failing SQL and API tests**

Assert the migration embeds each resource JSON Schema constant exactly, validates on draft save and again before publish, gives each of the five resource types an explicit `IF/ELSIF` branch, makes unknown types raise `22023`, makes stale revisions raise `40001`, versions existing rows before replacement, permits fixed insert branches only for team/blog/gallery/review, rejects a missing service row, and contains no `EXECUTE format(...)` or concatenated SQL.

- [ ] **Step 2: Generate the migration**

Run: `npx supabase migration new add_website_resource_publishing`

- [ ] **Step 3: Implement a fixed trigger branch per resource**

Add `publish_requested_at` to `website_content_drafts`. A `SECURITY DEFINER` trigger with `SET search_path = pg_catalog`, fully qualified object references, and revoked `PUBLIC` execution checks `private.can_manage_website()`. For an existing resource it locks the selected published row, compares `base_revision` to its revision field, snapshots the old safe payload, updates only allowlisted columns, increments revision, and updates the draft base revision. For a new UUID with `base_revision = 0`, fixed team/blog/gallery/review branches insert one published row from the validated draft payload, set `website_revision = 1`, and create no empty history version. Services are category records connected to the approved public slug map, so a missing service row always raises `22023` rather than creating an unreachable or misleading category. A missing creatable resource with any nonzero base revision raises `40001`.

Create `private.website_resource_payload_is_valid(p_type text, p_payload jsonb) RETURNS boolean` as `IMMUTABLE`, `SECURITY INVOKER`, fixed `search_path = pg_catalog`, with an exhaustive fixed `CASE` and `extensions.jsonb_matches_schema` calls using the exact five JSON Schema literals from Task 1. It returns `false` for unknown types. Revoke `PUBLIC`, grant only to `authenticated`, attach it through a `BEFORE INSERT OR UPDATE OF resource_type,draft_payload` validation trigger on `website_content_drafts`, and call it again from the publish trigger after the draft is locked.

In the same migration, preflight the expected current policies and columns, then replace legacy Staff/Admin content policies with a narrow published/editor read model. Public row predicates are: all canonical `clinic_services`, `team_members.is_active = true`, `blog_posts.published = true`, `gallery_images.is_visible = true`, and `website_review_presentations.status = 'published'`. Add a second `TO authenticated` read policy using `private.can_manage_website()` so Administrators/Website Editors can read inactive/unpublished presentation rows. Ordinary staff/locum/resident receive no all-content policy.

`REVOKE ALL` on those five published tables from `anon` and `authenticated`, then grant only safe presentation-column `SELECT` to both roles. In particular, omit `blog_posts.author_id` and every audit/source-identity field not required for public rendering. Grant no browser `INSERT`, `UPDATE`, or `DELETE`. Browser clients—including Administrators—publish only by updating the private draft request column; the fixed `SECURITY DEFINER` trigger owns every published-table mutation. Migration tests must assert the precise public predicates, the Website Editor read predicate, omitted identity columns, and absence of published-table browser mutation grants.

Use these exact browser-readable column sets; the migration test must compare the `GRANT SELECT (...)` lists as sets:

```text
clinic_services: id, slug, title, title_ms, title_en, description, description_ms,
  description_en, call_to_action, call_to_action_ms, call_to_action_en,
  services_list, services_list_ms, services_list_en, hero_image_url,
  promo_video_url, website_revision
team_members: id, type, name_ms, name_en, title_ms, title_en, bio_ms, bio_en,
  qualifications, expertise_ms, expertise_en, photo_url, years_experience,
  display_order, is_active, website_revision
blog_posts: id, category_id, slug, title, title_ms, title_en, content, content_ms,
  content_en, excerpt_ms, excerpt_en, featured_image, published, published_at,
  scheduled_at, reading_time, website_revision
gallery_images: id, url, alt_text, alt_text_ms, alt_text_en, tags,
  display_order, is_visible, website_revision
website_review_presentations: id, display_name_ms, display_name_en,
  review_text_ms, review_text_en, rating, source_label, status, display_order,
  website_revision
```

Do not grant `created_at`, `updated_at`, `author_id`, source-record identifiers, uploader identifiers, or other operational/audit fields. `website_revision` is readable because editor conflict detection needs it; it contains no patient or staff identity.

Where a legacy table lacks `website_revision`, add `website_revision integer NOT NULL DEFAULT 0 CHECK (website_revision >= 0)`. The review branch updates only `website_review_presentations`; it never touches `clinic_reviews`.

The service branch writes the eight bilingual presentation fields plus existing safe media fields. The team branch writes current team presentation fields. The blog branch writes current post presentation fields and publication status. The gallery branch writes URL, bilingual alt text, tags, order, and `is_visible`. The review branch writes only the presentation fields defined in Task 1.

- [ ] **Step 4: Implement the typed resource API**

```ts
export async function saveResourceDraft<T extends WebsiteResourceType>(input: {
  type: T;
  id: string;
  baseRevision: number;
  payload: ResourceDraftByType[T];
}): Promise<void> {
  const adapter = websiteResourceRegistry[input.type];
  const payload = adapter.parseDraft(input.payload);
  const { error } = await supabase.from("website_content_drafts").upsert({
    resource_type: input.type,
    resource_id: input.id,
    draft_payload: payload,
    base_revision: input.baseRevision,
  });
  if (error) throw error;
}
```

`createResourceDraft` accepts only `CreatableWebsiteResourceType`, generates `crypto.randomUUID()`, validates the type-specific payload, and inserts only the private draft with `base_revision = 0`; it does not pre-create a published row. The Services editor has no Add Service control and edits only the existing canonical category records, preserving the current public slug mapping and wording until an explicit redesign is separately approved. `fetchResourceList` combines published rows with authorized orphan drafts so a newly saved item remains visible in the editor before first publication. Publish updates only `publish_requested_at` for the expected type/id/revision. Restore copies a version payload into the draft table and never writes a published resource directly.

- [ ] **Step 5: Run focused tests and TypeScript**

Run:

```powershell
npx vitest run src/test/website-resource-publishing-migration.test.ts src/test/website-resources-api.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit fixed-branch publishing**

```powershell
git add supabase/migrations src/features/website-cms/api/resources.ts src/test/website-resource-publishing-migration.test.ts src/test/website-resources-api.test.ts
git commit -m "Add safe website resource publishing"
```

---

### Task 4: Build Services, Team, and Blog editor screens

**Files:**
- Create: `src/pages/editor/Services.tsx`
- Create: `src/pages/editor/ServiceEditor.tsx`
- Create: `src/pages/editor/Team.tsx`
- Create: `src/pages/editor/TeamEditor.tsx`
- Create: `src/pages/editor/Blog.tsx`
- Create: `src/pages/editor/BlogEditor.tsx`
- Create: `src/components/editor/ResourceEditorFrame.tsx`
- Create: `src/test/website-resource-editors.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/pages/ServiceDetail.tsx`
- Modify: `src/pages/Doctors.tsx`
- Modify: `src/pages/HealthTips.tsx`
- Modify: `src/pages/BlogPost.tsx`
- Modify: `src/hooks/useBlogPosts.ts`
- Modify: `src/components/staff/StaffLayout.tsx`
- Create: `src/test/website-public-resource-projections.test.ts`

**Interfaces:**
- Shared `ResourceEditorFrame` supplies Save Draft, Publish, unsaved warning, history, and bottom Live Preview.

- [ ] **Step 1: Write failing editor and public-projection tests**

Test bilingual fallback, local preview before save, sanitized service/blog HTML, unchanged public slug behavior, revision conflict messaging, and disabled preview links/forms. In `website-public-resource-projections.test.ts`, read the public query sources and fail if `ServiceDetail`, `Doctors`, or `useBlogPosts` contains `.select("*")`, `.select('*')`, or a multiline `*` projection for `clinic_services`, `team_members`, or `blog_posts`. Assert the exact presentation-only projection constants below are used instead.

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/test/website-resource-editors.test.tsx src/test/website-public-resource-projections.test.ts`

Expected: FAIL because editor screens do not exist.

- [ ] **Step 3: Build focused editors using current forms as field references**

Reuse safe form controls and validation concepts from `src/pages/staff/admin/LandingPages.tsx`, `src/pages/admin/TeamEditor.tsx`, and `src/pages/admin/BlogEditor.tsx`, but mount new screens in `EditorLayout`. Do not reuse `StaffLayout`, leads, appointments, user management, or clinic hooks.

Every editor ends with:

```tsx
<ResourceEditorFrame.LivePreview>
  {adapter.renderPreview(form.watch(), { language, preview: true })}
</ResourceEditorFrame.LivePreview>
```

- [ ] **Step 4: Update public resources to prefer bilingual fields**

Choose `*_ms` in Malay and non-empty `*_en` in English, otherwise fall back to Malay. Continue routing service slugs through `resolveServiceCategorySlug`. Continue passing rich HTML through `sanitizeRichHtml`.

Replace wildcard database projections with exported, explicit constants that match Task 3's browser grants. `ServiceDetail` requests the `clinic_services` safe columns, `Doctors` requests the `team_members` safe columns, and every `blog_posts` query in `useBlogPosts` requests the safe blog columns. The count-only blog query requests `id` with `{ count: "exact", head: true }`; the detail query may append `category:blog_categories(id,name,name_ms,name_en,slug)` but must never request `blog_posts.*`. Preserve the already-explicit `team_members` projection in `DoctorOnDuty` and the `clinic_services` projection in `AppointmentBooking`.

- [ ] **Step 5: Register editor routes and run validation**

Redirect the legacy direct-content routes to their new editor equivalents for Administrators: `/staff/admin/landing-pages` to `/editor/services`, `/staff/website/team` and `/:id` to `/editor/team`, and `/staff/website/blog` and `/:id` to `/editor/blog`. Remove their direct-content links from `StaffLayout`, while preserving Administrator-only `/staff/website/leads` and `/staff/website/settings`. Gallery and review redirects are added in their respective tasks.

Run:

```powershell
npx vitest run src/test/website-resource-editors.test.tsx src/test/website-public-resource-projections.test.ts src/test/sanitize-rich-html.test.ts src/test/serviceSlugMap.test.ts
npx tsc --noEmit
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit resource editors**

```powershell
git add src/pages/editor/Services.tsx src/pages/editor/ServiceEditor.tsx src/pages/editor/Team.tsx src/pages/editor/TeamEditor.tsx src/pages/editor/Blog.tsx src/pages/editor/BlogEditor.tsx src/components/editor/ResourceEditorFrame.tsx src/pages/ServiceDetail.tsx src/pages/Doctors.tsx src/pages/HealthTips.tsx src/pages/BlogPost.tsx src/hooks/useBlogPosts.ts src/components/staff/StaffLayout.tsx src/App.tsx src/test/website-resource-editors.test.tsx src/test/website-public-resource-projections.test.ts
git commit -m "Add service team and blog editors"
```

---

### Task 5: Add safe website-media uploads and Gallery editor

**Files:**
- Create: `src/features/website-cms/media/validation.ts`
- Create: `src/features/website-cms/media/uploadWebsiteMedia.ts`
- Create: `src/components/editor/WebsiteMediaUploader.tsx`
- Create: `src/pages/editor/Gallery.tsx`
- Create: `src/test/website-media.test.ts`
- Create: `src/test/website-gallery-projection.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/hooks/useGalleryImages.ts`
- Modify: `src/components/staff/StaffLayout.tsx`
- Modify: `src/pages/editor/HomeEditor.tsx`
- Modify: `src/pages/editor/PageEditor.tsx`

**Interfaces:**
- `uploadWebsiteMedia({ file, folder }) -> Promise<{ path: string; publicUrl: string }>`.
- Allowed folders and MIME types match the Plan 1 Storage policies.

- [ ] **Step 1: Write failing validation tests**

Test accepted JPEG/PNG/WebP/MP4/WebM, rejected SVG/HTML/JS/QuickTime for Website Editor, rejected files above 25 MiB, rejected unknown folders, generated object paths containing a UUID rather than the original filename, and a visible “public website media—no patient/private material” warning. The Gallery projection test fails on `.select("*")`/`.select('*')` in `useGalleryImages` and asserts the exact presentation-only projection from Task 3.

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/test/website-media.test.ts src/test/website-gallery-projection.test.ts`

Expected: FAIL because media modules do not exist.

- [ ] **Step 3: Implement immutable uploads**

```ts
const WEBSITE_MEDIA_FOLDERS = ["home", "pages", "services", "team", "blog", "gallery", "reviews"] as const;

export async function uploadWebsiteMedia({ file, folder }: UploadInput) {
  validateWebsiteMedia(file, folder);
  const extension = MIME_EXTENSION[file.type];
  const path = `${folder}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("website-media").upload(path, file, {
    cacheControl: "31536000",
    contentType: file.type,
    upsert: false,
  });
  if (error) throw error;
  return { path, publicUrl: supabase.storage.from("website-media").getPublicUrl(path).data.publicUrl };
}
```

Do not delete a previously published object during draft editing. Cleanup of unreferenced objects is a separate audited maintenance task.

- [ ] **Step 4: Integrate uploads into Home, Pages, and Gallery**

Use `WebsiteMediaUploader` in Home for the low-opacity background/slide media, in general pages for hero/body media, and in Gallery for images/videos. Upload completion updates only local form/draft state; it never publishes automatically. Gallery uses the resource draft/publish API, requires bilingual alt text with Malay required, and keeps reordering/visibility in the draft until Publish. Update `useGalleryImages` to request exactly `id,url,alt_text,alt_text_ms,alt_text_en,tags,display_order,is_visible,website_revision`, filter `is_visible = true` for public pages, and never use a wildcard projection; the authorized editor API can see all states. Redirect `/staff/website/gallery` to `/editor/gallery` for Administrators and replace its legacy navigation link with the new editor route.

- [ ] **Step 5: Run media tests, Gallery tests, and build**

Run:

```powershell
npx vitest run src/test/website-media.test.ts src/test/website-gallery-projection.test.ts src/test/website-resource-editors.test.tsx
npx tsc --noEmit
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit media and Gallery**

```powershell
git add src/features/website-cms/media src/components/editor/WebsiteMediaUploader.tsx src/pages/editor/HomeEditor.tsx src/pages/editor/PageEditor.tsx src/pages/editor/Gallery.tsx src/hooks/useGalleryImages.ts src/components/staff/StaffLayout.tsx src/App.tsx src/test/website-media.test.ts src/test/website-gallery-projection.test.ts
git commit -m "Add safe website media and gallery editor"
```

---

### Task 6: Add isolated public Reviews editor and rendering

**Files:**
- Create: `src/pages/editor/Reviews.tsx`
- Create: `src/test/website-reviews-isolation.test.tsx`
- Modify: `src/components/home/TestimonialsSection.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/staff/StaffLayout.tsx`

**Interfaces:**
- Website Editor API uses only `website_review_presentations` and `website_content_drafts` with type `review`.
- Public testimonials select only published presentation columns.

- [ ] **Step 1: Write failing isolation tests**

Mock Supabase and assert the editor never calls `.from("clinic_reviews")`, the public component never selects `source_review_id`, Malay/English fallback works, archived reviews disappear, and review text is rendered as text rather than raw HTML.

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/test/website-reviews-isolation.test.tsx`

Expected: FAIL because the isolated editor does not exist and Testimonials still reads the old table.

- [ ] **Step 3: Implement isolated review management**

The editor may create/edit/archive presentation records but cannot browse operational submissions. Render name and review text with normal React text nodes. Do not use `dangerouslySetInnerHTML` for testimonials. Redirect `/staff/website/reviews` to `/editor/reviews` for Administrators and replace its legacy navigation link with the new editor route.

- [ ] **Step 4: Run isolation and policy tests**

Run:

```powershell
npx vitest run src/test/website-reviews-isolation.test.tsx src/test/clinic-review-policy.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit isolated reviews**

```powershell
git add src/pages/editor/Reviews.tsx src/components/home/TestimonialsSection.tsx src/components/staff/StaffLayout.tsx src/App.tsx src/test/website-reviews-isolation.test.tsx
git commit -m "Isolate public review presentations"
```

---

### Task 7: Add draftable bilingual Navigation and public fallback

**Files:**
- Create via CLI: `supabase/migrations/*_add_website_navigation_publishing.sql`
- Create: `src/features/website-cms/navigation/schema.ts`
- Create: `src/features/website-cms/api/navigation.ts`
- Create: `src/pages/editor/Navigation.tsx`
- Create: `src/test/website-navigation.test.tsx`
- Create: `src/test/website-navigation-publishing-migration.test.ts`
- Modify: `src/components/layout/Header.tsx`
- Modify: `src/components/layout/Footer.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- `fetchPublishedNavigation() -> NavigationItem[]` falls back to current static public navigation.
- `saveNavigationDraft(items)` and `publishNavigationDraft(expectedRevision)`.
- `NAVIGATION_JSON_SCHEMA` mirrors the strict Zod navigation array for database validation.

- [ ] **Step 1: Write failing navigation tests**

Test current static fallback order/labels, bilingual fallback, one submenu level, no cycles, unique visible positions, reserved protected-route rejection, protocol-relative/backslash/JavaScript/data URL rejection, and external HTTPS acceptance.

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/test/website-navigation.test.tsx`

Expected: FAIL because navigation modules do not exist.

- [ ] **Step 3: Implement strict navigation validation**

Internal routes are accepted only from the current public route allowlist plus published `/pages/:slug`. External routes require `https:`. Parent validation permits one level and rejects self/cycles. Export `NAVIGATION_JSON_SCHEMA` with `additionalProperties: false`, matching types/lengths/URL-shape/order bounds, and test an accepted/rejected fixture corpus against the Zod schema.

- [ ] **Step 4: Implement revision-checked navigation publishing**

Run: `npx supabase migration new add_website_navigation_publishing`

Create `private.website_navigation_payload_is_valid(p_payload jsonb)` with the same immutable/invoker/fixed-search-path/revocation pattern as other validators and the exact `NAVIGATION_JSON_SCHEMA` literal. After JSON Schema validation, fixed SQL checks must reject duplicate IDs/order slots, missing parents, self-parenting, more than one parent level, cycles, protected internal prefixes, protocol-relative/backslash/`javascript:`/`data:` URLs, and external URLs not using HTTPS. Attach draft-save validation and repeat validation inside `private.publish_website_navigation_draft()`. The publish function is a `SECURITY DEFINER` trigger with `SET search_path = pg_catalog`, fully qualified objects, `PUBLIC` execution revoked, and a `BEFORE UPDATE OF publish_requested_at` trigger on the singleton draft row. It must authorize with `private.can_manage_website()`, lock the singleton draft, compare `base_revision` with the current maximum published navigation revision, insert the prior published set into `website_content_versions` with `resource_type='navigation'` and fixed resource UUID `00000000-0000-0000-0000-000000000001`, and replace `website_navigation_items` atomically. The browser receives only `UPDATE (draft_items,base_revision,publish_requested_at)` on the private draft table; it never receives mutation privileges on `website_navigation_items`.

The migration test must assert fixed inserts from validated JSON records, stale-revision SQLSTATE `40001`, prior-version insertion before replacement, no dynamic SQL, fixed search path, revoked `PUBLIC`, and no browser mutation grant on the published table.

- [ ] **Step 5: Build editor and public fallback**

The Navigation editor saves a private JSON draft and renders its bottom Live Preview. Publishing replaces the published item set transactionally after revision validation. Header/Footer read published items but use the current static constants on missing/error/invalid data.

- [ ] **Step 6: Run navigation tests and desktop/mobile build checks**

Run:

```powershell
npx vitest run src/test/website-navigation.test.tsx src/test/website-navigation-publishing-migration.test.ts src/test/security.test.ts
npx tsc --noEmit
npm run build
npm run build:dev
```

Expected: PASS.

- [ ] **Step 7: Commit Navigation**

```powershell
git add supabase/migrations src/features/website-cms/navigation src/features/website-cms/api/navigation.ts src/pages/editor/Navigation.tsx src/components/layout/Header.tsx src/components/layout/Footer.tsx src/App.tsx src/test/website-navigation.test.tsx src/test/website-navigation-publishing-migration.test.ts
git commit -m "Add managed public navigation"
```

---

### Task 8: Complete staging resource and Storage verification

**Files:**
- Modify: `stress-tests/phase-d/website-cms.fixture.test.ts`
- Create: `docs/security/website-cms-staging-validation.md`

**Interfaces:**
- Produces sanitized-staging evidence only; no secrets or raw JWTs.

- [ ] **Step 1: Extend the matrix for every resource and media folder**

Add read/draft-save/revision-checked-publish cases for services, team, blog, gallery, review presentations, navigation, and every allowed website-media folder. Verify a known public asset URL returns the object while anonymous bucket listing is denied. Explicitly assert direct browser mutation of published CMS tables is denied. Add denial cases for `clinic_reviews`, patients, appointments, finance, payroll, inventory, staff admin, role assignment, secrets, and private buckets.

- [ ] **Step 2: Apply reviewed migrations to sanitized staging only after the guard**

Expected: migration history advances once; production reference is rejected.

- [ ] **Step 3: Regenerate Supabase types and run the full matrix**

Expected: all allow/deny cases match exactly and cleanup removes synthetic data/accounts.

- [ ] **Step 4: Verify all public resource routes without writes**

Check desktop/mobile `/`, `/services`, all service slugs, `/doctors`, `/gallery`, `/health-tips`, and health-tip details. Record no 404 regression, no console error, exact seeded wording, and sanitizer operation.

- [ ] **Step 5: Commit validation evidence**

```powershell
git add stress-tests/phase-d/website-cms.fixture.test.ts docs/security/website-cms-staging-validation.md src/integrations/supabase/types.ts
git commit -m "Validate website CMS resource isolation"
```
