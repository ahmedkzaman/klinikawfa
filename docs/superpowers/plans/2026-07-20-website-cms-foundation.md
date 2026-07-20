# Website CMS Authorization and Data Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the `website_editor` authorization boundary, secure CMS database/storage foundation, and isolated `/editor` application shell without granting access to staff or clinic systems.

**Architecture:** Use a dedicated application role plus two narrowly scoped database helpers: website management for Administrators/Website Editors and analytics management for Administrators only. Published records, private drafts, versions, review presentations, navigation, and tracking configuration use separate tables with explicit grants and RLS. The React editor sits outside `StaffLayout` behind its own route guard.

**Tech Stack:** PostgreSQL 17, Supabase Auth/RLS/Storage/Data API, generated Supabase TypeScript types, React 18, React Router 6, TypeScript 5, Vitest, Testing Library.

## Global Constraints

- Never add `website_editor` to staff, operations, clinical, finance, insights, payroll, patient, or clinic access booleans.
- Authorization reads `public.user_roles`; never authorize from `user_metadata`.
- Every exposed table has RLS and explicit least-privilege grants.
- `SECURITY DEFINER` helpers live in unexposed `private`, use `auth.uid()` internally, have a fixed `search_path`, revoke `PUBLIC`, and grant only the required role.
- `clinic_reviews` remains inaccessible to Website Editors.
- No production migration, role assignment, user creation, or secret modification occurs in this plan.

---

### Task 1: Add the Website Editor role with a regression test

**Files:**
- Create: `src/test/website-editor-role-migration.test.ts`
- Create via CLI: `supabase/migrations/*_add_website_editor_role.sql`
- Create: `supabase/functions/admin-create-user/role-policy.ts`
- Create: `supabase/functions/admin-create-user/role-policy_test.ts`
- Modify: `supabase/functions/admin-create-user/index.ts`
- Modify: `src/components/clinic/settings/AddUserDialog.tsx`
- Modify: `src/pages/clinic/settings/UserManagementSettings.tsx`
- Modify: `src/pages/staff/admin/PunchSettings.tsx`
- Modify: `src/integrations/supabase/types.ts`
- Create: `src/test/website-editor-user-creation-ui.test.tsx`

**Interfaces:**
- Produces: PostgreSQL enum value `website_editor` in `public.app_role`.
- Produces: Administrator-only Website Editor account creation through the existing `admin-create-user` Edge Function.
- Consumed by: `AuthContext.AppRole`, `private.can_manage_website()`, account-creation UI, guarded role assignment, and all later plans.

- [ ] **Step 1: Write the failing migration test**

```ts
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const migrationDir = join(process.cwd(), "supabase", "migrations");

describe("website_editor enum migration", () => {
  it("adds only the website_editor enum value", () => {
    const name = readdirSync(migrationDir).find((file) =>
      file.endsWith("_add_website_editor_role.sql"),
    );
    expect(name).toBeTruthy();
    const sql = readFileSync(join(migrationDir, name!), "utf8");
    expect(sql).toMatch(
      /ALTER TYPE public\.app_role ADD VALUE IF NOT EXISTS 'website_editor';/i,
    );
    expect(sql).not.toMatch(/INSERT\s+INTO\s+public\.user_roles/i);
  });
});
```

- [ ] **Step 2: Run the test and verify the missing migration fails**

Run:

```powershell
npx vitest run src/test/website-editor-role-migration.test.ts
```

Expected: FAIL because no file ends in `_add_website_editor_role.sql`.

- [ ] **Step 3: Create the migration with the installed Supabase CLI**

Run:

```powershell
npx supabase --version
npx supabase migration new add_website_editor_role
```

Expected: the CLI prints one new path ending `_add_website_editor_role.sql`.

- [ ] **Step 4: Put the single enum change in the generated migration**

```sql
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'website_editor';
```

Keep this migration separate because a newly added enum value must be committed before later migrations rely on it.

- [ ] **Step 5: Write failing account-creation policy and UI tests**

The Deno test must prove that `admin`, `special_admin`, and `doctor_admin` callers may request `website_editor`; operations-tier callers are always reduced to `locum`; `website_editor` is not an employee/onboarding role; and a `website_editor` caller cannot create any account. The React test must prove the Administrator user-management page offers “Add Website Editor”, passes `role="website_editor"` to `AddUserDialog`, and no such creation control appears for non-administrator roles.

Run:

```powershell
deno test supabase/functions/admin-create-user/role-policy_test.ts
npx vitest run src/test/website-editor-user-creation-ui.test.tsx
```

Expected: FAIL because the role policy and UI option do not exist.

- [ ] **Step 6: Implement the narrow creation policy**

`role-policy.ts` owns the exact caller and target sets so `index.ts` and the test cannot drift:

```ts
export const CREATABLE_USER_ROLES = [
  "locum",
  "resident_doctor",
  "ops_staff",
  "staff",
  "operations",
  "website_editor",
] as const;

export type CreatableUserRole = (typeof CREATABLE_USER_ROLES)[number];

const ADMIN_TIER_CALLERS = new Set(["admin", "special_admin", "doctor_admin"]);
const OPS_TIER_CALLERS = new Set(["ops_staff", "staff", "operations"]);

export function resolveCreatableRole(
  callerRole: string | null | undefined,
  requestedRole: CreatableUserRole,
): CreatableUserRole {
  if (callerRole && ADMIN_TIER_CALLERS.has(callerRole)) return requestedRole;
  if (callerRole && OPS_TIER_CALLERS.has(callerRole)) return "locum";
  throw new Error("FORBIDDEN");
}

export function requiresStaffOnboarding(role: CreatableUserRole): boolean {
  return new Set(["resident_doctor", "ops_staff", "staff", "operations"]).has(role);
}
```

Use `CREATABLE_USER_ROLES` in the Edge Function request schema and `resolveCreatableRole` before auth creation. Do not add `website_editor` to employee onboarding. In `AddUserDialog`, extend the UI type/copy with `website_editor`; in `UserManagementSettings`, add an Administrator-only “Add Website Editor” button and label. Add `website_editor` to both generated `app_role` unions/constant arrays in `src/integrations/supabase/types.ts`; after staging application, regeneration must produce the same entries. Add the display label to `PunchSettings`' exhaustive role-label record but do not add Website Editor to punch-rule options. Continue generating a unique temporary password and showing it once; never log it, persist it in the repo, or put it in a URL.

- [ ] **Step 7: Run the focused tests**

Run:

```powershell
npx vitest run src/test/website-editor-role-migration.test.ts
deno test supabase/functions/admin-create-user/role-policy_test.ts
npx vitest run src/test/website-editor-user-creation-ui.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit the role and guarded creation flow**

```powershell
git add src/test/website-editor-role-migration.test.ts src/test/website-editor-user-creation-ui.test.tsx supabase/migrations supabase/functions/admin-create-user/role-policy.ts supabase/functions/admin-create-user/role-policy_test.ts supabase/functions/admin-create-user/index.ts src/components/clinic/settings/AddUserDialog.tsx src/pages/clinic/settings/UserManagementSettings.tsx src/pages/staff/admin/PunchSettings.tsx src/integrations/supabase/types.ts
git commit -m "Add website editor role and guarded account creation"
```

---

### Task 2: Create the secure CMS tables, helpers, grants, RLS, and media bucket

**Files:**
- Create: `src/test/website-cms-foundation-migration.test.ts`
- Create via CLI: `supabase/migrations/*_create_website_cms_foundation.sql`

**Interfaces:**
- Produces: `private.can_manage_website() -> boolean`, `private.can_manage_analytics() -> boolean`.
- Produces tables: `website_pages`, `website_page_drafts`, `website_content_drafts`, `website_content_versions`, `website_navigation_items`, `website_navigation_drafts`, `website_review_presentations`, `website_tracking_settings`.
- Produces Storage bucket: `website-media`.

- [ ] **Step 1: Write the failing policy-contract test**

```ts
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const migrations = join(process.cwd(), "supabase", "migrations");

function foundationSql(): string {
  const name = readdirSync(migrations).find((file) =>
    file.endsWith("_create_website_cms_foundation.sql"),
  );
  expect(name).toBeTruthy();
  return readFileSync(join(migrations, name!), "utf8");
}

describe("website CMS foundation migration", () => {
  it("creates separate published and private draft tables", () => {
    const sql = foundationSql();
    expect(sql).toContain("CREATE TABLE public.website_pages");
    expect(sql).toContain("CREATE TABLE public.website_page_drafts");
    const publishedTable = sql.match(
      /CREATE TABLE public\.website_pages \(([\s\S]*?)\n\);/i,
    )?.[1] ?? "";
    expect(publishedTable).not.toContain("draft_content");
  });

  it("uses auth.uid based private helpers and revokes PUBLIC execute", () => {
    const sql = foundationSql();
    expect(sql).toContain("CREATE OR REPLACE FUNCTION private.can_manage_website()");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION private.can_manage_analytics()");
    expect(sql).toContain("auth.uid()");
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION private\.can_manage_website\(\) FROM PUBLIC/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION private\.can_manage_analytics\(\) FROM PUBLIC/i);
    expect(sql).toContain("CREATE OR REPLACE FUNCTION private.stamp_website_draft_actor()");
    expect(sql).toMatch(/NEW\.updated_by\s*:=\s*\(SELECT auth\.uid\(\)\)/i);
    expect(sql).not.toContain("user_metadata");
  });

  it("enables RLS and keeps clinic_reviews outside the editor boundary", () => {
    const sql = foundationSql();
    for (const table of [
      "website_pages",
      "website_page_drafts",
      "website_content_drafts",
      "website_content_versions",
      "website_navigation_items",
      "website_navigation_drafts",
      "website_review_presentations",
      "website_tracking_settings",
    ]) {
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    }
    expect(sql).not.toMatch(/ON public\.clinic_reviews[\s\S]*can_manage_website/i);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
npx vitest run src/test/website-cms-foundation-migration.test.ts
```

Expected: FAIL because the foundation migration does not exist.

- [ ] **Step 3: Generate the foundation migration**

Run:

```powershell
npx supabase migration new create_website_cms_foundation
```

Expected: one new file ending `_create_website_cms_foundation.sql`.

- [ ] **Step 4: Implement the schema and helper contract**

The generated migration must implement these exact table keys and checks:

```sql
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.can_manage_website()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles AS ur
    WHERE ur.user_id = (SELECT auth.uid())
      AND ur.role::text IN ('admin', 'special_admin', 'doctor_admin', 'website_editor')
  );
$$;

CREATE OR REPLACE FUNCTION private.can_manage_analytics()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles AS ur
    WHERE ur.user_id = (SELECT auth.uid())
      AND ur.role::text IN ('admin', 'special_admin', 'doctor_admin')
  );
$$;

REVOKE ALL ON FUNCTION private.can_manage_website() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_manage_analytics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_manage_website() TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_manage_analytics() TO authenticated;

CREATE OR REPLACE FUNCTION private.stamp_website_draft_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF NOT private.can_manage_website() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  NEW.updated_by := (SELECT auth.uid());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.stamp_website_draft_actor() FROM PUBLIC;

CREATE TABLE public.website_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('home', 'system_content', 'content')),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  published_content jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  published_at timestamptz,
  published_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'home' AND slug = 'home') OR kind <> 'home'),
  CHECK (
    kind <> 'content' OR slug NOT IN (
      'auth', 'staff', 'clinic', 'appointment', 'services', 'doctors',
      'doctor-on-duty', 'gallery', 'health-tips', 'editor', 'privacy',
      'terms', 'video-call', 'tv', 'reset-password', 'locum-register',
      'api', 'functions'
    )
  )
);

CREATE TABLE public.website_page_drafts (
  page_id uuid PRIMARY KEY REFERENCES public.website_pages(id) ON DELETE CASCADE,
  draft_content jsonb NOT NULL DEFAULT '{}'::jsonb,
  base_revision integer NOT NULL DEFAULT 0 CHECK (base_revision >= 0),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.website_content_drafts (
  resource_type text NOT NULL CHECK (resource_type IN ('service', 'team_member', 'blog_post', 'gallery_image', 'review')),
  resource_id uuid NOT NULL,
  draft_payload jsonb NOT NULL,
  base_revision integer NOT NULL DEFAULT 0 CHECK (base_revision >= 0),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (resource_type, resource_id)
);

CREATE TABLE public.website_content_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type text NOT NULL CHECK (resource_type IN ('page', 'service', 'team_member', 'blog_post', 'gallery_image', 'review', 'navigation')),
  resource_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision >= 0),
  payload jsonb NOT NULL,
  published_by uuid NOT NULL REFERENCES auth.users(id),
  published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (resource_type, resource_id, revision)
);

CREATE TABLE public.website_navigation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid REFERENCES public.website_pages(id) ON DELETE SET NULL,
  href text NOT NULL,
  label_ms text NOT NULL,
  label_en text,
  is_visible boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL CHECK (display_order >= 0),
  parent_id uuid REFERENCES public.website_navigation_items(id) ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE TABLE public.website_navigation_drafts (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  draft_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  base_revision integer NOT NULL DEFAULT 0 CHECK (base_revision >= 0),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.website_review_presentations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_review_id uuid REFERENCES public.reviews(id) ON DELETE SET NULL,
  name_ms text NOT NULL,
  name_en text,
  review_text_ms text NOT NULL,
  review_text_en text,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  source_label text NOT NULL DEFAULT 'Klinik Awfa',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  display_order integer NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  website_revision integer NOT NULL DEFAULT 0 CHECK (website_revision >= 0),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_review_id)
);

CREATE TABLE public.website_tracking_settings (
  provider text PRIMARY KEY CHECK (provider = 'meta_pixel'),
  enabled boolean NOT NULL DEFAULT false,
  pixel_id text CHECK (pixel_id IS NULL OR pixel_id ~ '^[0-9]{5,32}$'),
  consent_version integer NOT NULL DEFAULT 1 CHECK (consent_version > 0),
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT enabled OR pixel_id IS NOT NULL)
);

INSERT INTO public.website_tracking_settings (provider, enabled, pixel_id, consent_version)
VALUES ('meta_pixel', false, NULL, 1)
ON CONFLICT (provider) DO NOTHING;
```

The same migration must first `REVOKE ALL` on all eight tables from `anon` and `authenticated`, then grant and policy exactly this matrix:

| Table | Role and privilege | Row condition / allowed columns |
|---|---|---|
| `website_pages` | `anon`, `authenticated`: `SELECT (id,kind,slug,published_content,status,revision,published_at,created_at,updated_at)` | `status = 'published'`; no `published_by` grant |
| `website_pages` | `authenticated`: same safe-column `SELECT` | additional policy `private.can_manage_website()` so editors can read unpublished page skeletons |
| `website_pages` | `authenticated`: `INSERT (kind,slug)` only | `private.can_manage_website() AND kind = 'content' AND status = 'draft' AND published_content = '{}'::jsonb AND revision = 0`; no direct client `UPDATE` or `DELETE` grant |
| `website_page_drafts` | `authenticated`: `SELECT`, `DELETE`, `INSERT (page_id,draft_content,base_revision)`, `UPDATE (draft_content,base_revision)` | `private.can_manage_website()` for `USING` and `WITH CHECK`; no anonymous grant/policy; later migration grants `publish_requested_at` update |
| `website_content_drafts` | `authenticated`: `SELECT`, `DELETE`, `INSERT (resource_type,resource_id,draft_payload,base_revision)`, `UPDATE (draft_payload,base_revision)` | `private.can_manage_website()` for `USING` and `WITH CHECK`; no anonymous grant/policy; later migration grants `publish_requested_at` update |
| `website_content_versions` | `authenticated`: `SELECT` | `private.can_manage_website()`; no client mutation grant—publish triggers own version insertion |
| `website_navigation_items` | `anon`, `authenticated`: `SELECT` | `is_visible = true` |
| `website_navigation_items` | `authenticated`: safe-column `SELECT` | additional policy `private.can_manage_website()` so editors can preview the complete published set; no client mutation grant |
| `website_navigation_drafts` | `authenticated`: `SELECT`, `DELETE`, `INSERT (singleton,draft_items,base_revision)`, `UPDATE (draft_items,base_revision)` | `private.can_manage_website()` for `USING` and `WITH CHECK`; no anonymous grant/policy; later migration grants `publish_requested_at` update |
| `website_review_presentations` | `anon`, `authenticated`: safe display-column `SELECT` | `status = 'published'`; omit `source_review_id` and publishing identity |
| `website_review_presentations` | `authenticated`: same safe-column `SELECT` | additional policy `private.can_manage_website()` so editors can read archived/draft-status presentation rows; no client mutation grant |
| `website_tracking_settings` | `anon`, `authenticated`: `SELECT (provider,enabled,pixel_id,consent_version)` | `enabled = true`; no audit-column grant |
| `website_tracking_settings` | `authenticated`: same safe-column `SELECT` | additional policy `private.can_manage_analytics()` so Administrators can read the disabled row |
| `website_tracking_settings` | `authenticated`: `UPDATE (enabled,pixel_id,consent_version)` | `private.can_manage_analytics()` for both `USING` and `WITH CHECK` |

Enable RLS on every table. Every editor-facing policy must be `TO authenticated`; every published-read policy must be explicitly `TO anon, authenticated`. The insert policy for `website_pages` must repeat the draft-skeleton predicates in `WITH CHECK`; application validation alone is insufficient. Do not grant `TRUNCATE`, `REFERENCES`, trigger creation, or sequence access to browser roles. Because current Supabase projects no longer automatically expose newly created tables to the Data API, these explicit grants are required rather than assumed.

Attach `private.stamp_website_draft_actor()` as a `BEFORE INSERT OR UPDATE` trigger to `website_page_drafts`, `website_content_drafts`, and `website_navigation_drafts`. Client grants must omit `updated_by` and `updated_at` from writable column lists; the trigger is the only writer of those audit fields. Do not grant direct function execution to browser roles because trigger invocation is internal.

Create `website-media` as a public bucket with a 25 MiB limit and MIME allowlist `image/jpeg`, `image/png`, `image/webp`, `video/mp4`, `video/webm`. Do not create an anonymous `storage.objects` `SELECT` policy: public-bucket asset URLs work without it, while listing requires `SELECT` and must remain unavailable anonymously. Authenticated insert/select/update/delete applies only when `private.can_manage_website()` is true and `storage.foldername(name)[1]` is one of `home`, `pages`, `services`, `team`, `blog`, `gallery`, or `reviews`.

- [ ] **Step 5: Run the migration contract tests**

Run:

```powershell
npx vitest run src/test/website-editor-role-migration.test.ts src/test/website-cms-foundation-migration.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run SQL formatting and local parse checks available in the workspace**

Run:

```powershell
npx supabase db lint --help
npx supabase migration list --local
```

Expected: CLI recognizes both commands; the two new migrations appear locally in timestamp order. Do not connect to production.

- [ ] **Step 7: Commit the foundation migration**

```powershell
git add src/test/website-cms-foundation-migration.test.ts supabase/migrations
git commit -m "Add secure website CMS data foundation"
```

---

### Task 3: Add frontend role capabilities without widening staff access

**Files:**
- Modify: `src/contexts/AuthContext.tsx`
- Modify after staging type generation: `src/integrations/supabase/types.ts`
- Create: `src/lib/website-access.ts`
- Create: `src/test/website-access.test.ts`

**Interfaces:**
- Produces: `isWebsiteEditorRole(role)`, `canManageWebsiteRole(role)`, `canManageAnalyticsRole(role)`.
- Produces context booleans: `canManageWebsite`, `canManageAnalytics`.

- [ ] **Step 1: Write failing capability tests**

```ts
import { describe, expect, it } from "vitest";
import {
  canManageAnalyticsRole,
  canManageWebsiteRole,
  isWebsiteEditorRole,
} from "@/lib/website-access";

describe("website role capabilities", () => {
  it("allows Website Editor and Administrator roles to manage content", () => {
    expect(canManageWebsiteRole("website_editor")).toBe(true);
    expect(canManageWebsiteRole("admin")).toBe(true);
    expect(canManageWebsiteRole("special_admin")).toBe(true);
    expect(canManageWebsiteRole("doctor_admin")).toBe(true);
  });

  it("keeps analytics Administrator-only", () => {
    expect(canManageAnalyticsRole("website_editor")).toBe(false);
    expect(canManageAnalyticsRole("admin")).toBe(true);
  });

  it.each(["staff", "ops_staff", "operations", "locum", "resident_doctor", "guest", null])(
    "denies website management to %s",
    (role) => expect(canManageWebsiteRole(role)).toBe(false),
  );

  it("identifies only the dedicated editor role", () => {
    expect(isWebsiteEditorRole("website_editor")).toBe(true);
    expect(isWebsiteEditorRole("admin")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/test/website-access.test.ts`

Expected: FAIL because `website-access.ts` does not exist.

- [ ] **Step 3: Implement the focused capability module**

```ts
import type { AppRole } from "@/contexts/AuthContext";

const WEBSITE_ADMIN_ROLES: readonly AppRole[] = [
  "admin",
  "special_admin",
  "doctor_admin",
];

export function isWebsiteEditorRole(role: AppRole | null): boolean {
  return role === "website_editor";
}

export function canManageWebsiteRole(role: AppRole | null): boolean {
  return isWebsiteEditorRole(role) || WEBSITE_ADMIN_ROLES.includes(role as AppRole);
}

export function canManageAnalyticsRole(role: AppRole | null): boolean {
  return WEBSITE_ADMIN_ROLES.includes(role as AppRole);
}
```

Add `"website_editor"` to `AppRole`. Add `canManageWebsite` and `canManageAnalytics` to the context interface/provider using these functions. Do not change the definitions of `isAdmin`, `isStaffOrAdmin`, `isOpsOrAdmin`, `isClinical`, or `canViewInsights`.

- [ ] **Step 4: Run focused and existing auth tests**

Run:

```powershell
npx vitest run src/test/website-access.test.ts src/test/auth-guards.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit the capability boundary**

```powershell
git add src/contexts/AuthContext.tsx src/lib/website-access.ts src/test/website-access.test.ts
git commit -m "Add isolated website editor capability"
```

---

### Task 4: Add the isolated editor route shell and login redirect

**Files:**
- Create: `src/components/editor/EditorProtectedRoute.tsx`
- Create: `src/components/editor/EditorLayout.tsx`
- Create: `src/pages/editor/Dashboard.tsx`
- Create: `src/test/editor-route-guard.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/pages/Auth.tsx`
- Modify: `src/components/staff/StaffLayout.tsx`

**Interfaces:**
- Produces routes: `/editor`, `/editor/home`, `/editor/pages`, `/editor/services`, `/editor/team`, `/editor/blog`, `/editor/gallery`, `/editor/reviews`, `/editor/navigation`, `/editor/analytics`.
- Produces: Administrator-only visibility for `/editor/analytics`.

- [ ] **Step 1: Write failing route-guard tests**

Create a test harness that mocks `useAuth` and asserts:

```tsx
it.each(["website_editor", "admin", "special_admin", "doctor_admin"])(
  "allows %s into /editor",
  (role) => expect(renderGuard(role).queryByText("Editor content")).toBeInTheDocument(),
);

it.each(["staff", "ops_staff", "operations", "locum", "resident_doctor", "guest"])(
  "redirects %s away from /editor",
  (role) => expect(renderGuard(role).queryByTestId("location")).toHaveTextContent("/"),
);

it("redirects anonymous visitors to /auth", () => {
  expect(renderAnonymousGuard().queryByTestId("location")).toHaveTextContent("/auth");
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run src/test/editor-route-guard.test.tsx`

Expected: FAIL because the editor guard and layout do not exist.

- [ ] **Step 3: Implement `EditorProtectedRoute`**

```tsx
export function EditorProtectedRoute({
  children,
  requireAnalyticsAdmin = false,
}: {
  children: React.ReactNode;
  requireAnalyticsAdmin?: boolean;
}) {
  const { user, loading, rolesLoading, canManageWebsite, canManageAnalytics } = useAuth();
  const location = useLocation();

  if (loading || rolesLoading) return <EditorLoadingState />;
  if (!user) return <Navigate to="/auth" state={{ from: location }} replace />;
  if (!canManageWebsite) return <Navigate to="/" replace />;
  if (requireAnalyticsAdmin && !canManageAnalytics) return <Navigate to="/editor" replace />;
  return <>{children}</>;
}
```

`EditorLayout` uses a focused navigation list and renders Analytics & Consent only when `canManageAnalytics` is true. It must not import `StaffLayout`, staff chat, onboarding, notices, clinic menus, or clinic hooks.

- [ ] **Step 4: Register the editor routes**

Wrap `/editor` with `EditorProtectedRoute`, render `EditorLayout`, and use temporary unavailable-state route elements that say “Coming in the next CMS plan” for child routes not yet implemented. Wrap only `/editor/analytics` with `requireAnalyticsAdmin`.

Update `Auth.tsx` so `role === "website_editor"` redirects to `/editor` before clinic/staff role branches. In `StaffLayout`, make the current Website Management group Administrator-only and add “Website Editor” linking to `/editor`. Preserve Administrator links to website leads/settings and the legacy content screens until Plan 3 migrates those content screens; no ordinary staff/locum/resident may see the group.

- [ ] **Step 5: Run focused tests and TypeScript**

Run:

```powershell
npx vitest run src/test/editor-route-guard.test.tsx src/test/website-access.test.ts src/test/auth-guards.test.tsx
npx tsc --noEmit
```

Expected: PASS and zero TypeScript errors.

- [ ] **Step 6: Commit the editor shell**

```powershell
git add src/App.tsx src/pages/Auth.tsx src/components/staff/StaffLayout.tsx src/components/editor src/pages/editor src/test/editor-route-guard.test.tsx
git commit -m "Add isolated website editor shell"
```

---

### Task 5: Add deterministic staging RLS and Storage matrix coverage

**Files:**
- Modify: `stress-tests/.env.staging.example`
- Create: `stress-tests/phase-d/website-cms.fixture.test.ts`
- Modify: `stress-tests/scripts/run-rls-matrix.sh`

**Interfaces:**
- Consumes blank environment variables: `RLS_WEBSITE_EDITOR_EMAIL`, `RLS_WEBSITE_EDITOR_PASSWORD`, `RLS_WEBSITE_EDITOR_UID`.
- Produces evidence for anonymous, Website Editor, Administrator, ordinary staff, locum, and resident-doctor roles.

- [ ] **Step 1: Add blank example variables**

```dotenv
RLS_WEBSITE_EDITOR_UID=
RLS_WEBSITE_EDITOR_EMAIL=
RLS_WEBSITE_EDITOR_PASSWORD=
```

No value may be committed.

- [ ] **Step 2: Write the matrix cases before applying any migration**

The test must assert these exact outcomes:

```ts
const cases = [
  ["anonymous reads published page", "anon", "website_pages.selectPublished", true],
  ["anonymous reads page draft", "anon", "website_page_drafts.select", false],
  ["website editor writes page draft", "website_editor", "website_page_drafts.upsert", true],
  ["website editor reads clinic reviews", "website_editor", "clinic_reviews.select", false],
  ["website editor writes patient", "website_editor", "patients.update", false],
  ["website editor writes private storage", "website_editor", "private_documents.insert", false],
  ["website editor writes website media", "website_editor", "website-media.insert", true],
  ["anonymous lists website media", "anon", "website-media.list", false],
  ["ordinary staff writes website draft", "staff", "website_page_drafts.upsert", false],
  ["locum opens editor data", "locum", "website_page_drafts.select", false],
  ["administrator updates tracking", "admin", "website_tracking_settings.update", true],
  ["website editor updates tracking", "website_editor", "website_tracking_settings.update", false],
] as const;
```

- [ ] **Step 3: Run local TypeScript and shell syntax checks only**

Run:

```powershell
Set-Location stress-tests
npx tsc --noEmit -p tsconfig.json
bash -n scripts/run-rls-matrix.sh
```

Expected: TypeScript exits `0`; shell syntax is valid. Do not run the networked matrix yet.

- [ ] **Step 4: Commit the staging matrix**

```powershell
git add stress-tests/.env.staging.example stress-tests/phase-d/website-cms.fixture.test.ts stress-tests/scripts/run-rls-matrix.sh
git commit -m "Add website CMS RLS matrix"
```

- [ ] **Step 5: Stop at the staging-application checkpoint**

Before applying migrations, record the sanitized staging project reference, verify `guard-not-prod.sh` rejects every known production reference, and obtain the staging migration approval. After application, regenerate `src/integrations/supabase/types.ts`, run Supabase advisors, execute the matrix, delete synthetic accounts/fixtures, and record name/status evidence only. Never display credentials or JWTs.
