# Safe Catalogue Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reversible, exact-role-gated catalogue deletion at `/clinic/settings/inventory` without changing historical records or future billing history.

**Architecture:** Archive catalogue rows by setting `status = 'inactive'` and `archived_at`, retaining identifiers and references. A single database RPC is the security boundary for `admin` and `special_admin`; React exposes confirmation controls only for those roles and invalidates catalogue/picker queries after success.

**Tech Stack:** React, TypeScript, TanStack Query, Supabase/Postgres migrations and RLS, Vitest, Deno SQL tests, Vite build.

**Spec:** `docs/superpowers/specs/2026-08-30-safe-catalogue-deletion-design.md`

## Global Constraints

- Never physically delete catalogue rows or historical references.
- Only exact roles `admin` and `special_admin` may archive; `doctor_admin` is excluded.
- Existing inactive-but-unarchived rows retain current administrative visibility.
- Future-use pickers must require active status and no archive marker.
- No existing records are archived automatically during deployment.
- Every implementation task follows RED → verify failure → GREEN → verify pass → commit.

### Task 1: Add database archive contract and migration tests

**Files:**
- Create: `supabase/migrations/<timestamp>_safe_catalogue_archiving.sql`
- Create: `supabase/tests/safe_catalogue_archiving.sql`
- Modify: `src/integrations/supabase/types.ts` (regenerate or add the RPC contract using the repository’s existing type-generation workflow)

**Interfaces:**
- Produces RPC `archive_catalogue_entry(p_catalogue_type text, p_entry_id uuid) returns jsonb`.
- Accepted catalogue types are exactly `inventory_item`, `service`, and `package`.
- Success returns `{ id, catalogue_type, status: 'inactive', archived_at }`.

- [ ] **Step 1: Write failing SQL tests** for allowed roles, denied roles including `doctor_admin`, all three catalogue tables, retained references, invalid type, missing id, and repeated archive.
- [ ] **Step 2: Run the SQL test harness** and confirm failure because the RPC/columns do not exist.
- [ ] **Step 3: Add additive columns and the `SECURITY DEFINER` RPC**, using `is_special_admin(auth.uid()) OR has_role(auth.uid(), 'admin')`, `set search_path = public`, row locks, and explicit exception messages. Add RLS policies preventing unauthorized direct updates of `archived_at` while preserving existing authorized write policies.
- [ ] **Step 4: Run the SQL tests** and confirm all archive, authorization, and preservation assertions pass.
- [ ] **Step 5: Commit** with `feat: add safe catalogue archive rpc`.

### Task 2: Add typed client mutation hooks

**Files:**
- Modify: `src/hooks/clinic/useInventoryItems.ts`
- Modify: `src/hooks/clinic/useServices.ts`
- Modify: `src/hooks/clinic/usePackages.ts`
- Create: `src/lib/clinic/catalogueArchive.ts`
- Test: `src/test/catalogue-archive.test.ts`

**Interfaces:**
- `type CatalogueType = 'inventory_item' | 'service' | 'package'`.
- `archiveCatalogueEntry(type: CatalogueType, id: string): Promise<void>` calls the RPC and throws the returned error.
- `useArchiveCatalogueEntry()` invalidates `inventory_items`, `inventory_items_safe`, `services`, `services_safe`, `packages`, `packages_safe`, `package_items`, and relevant inventory dashboard queries.

- [ ] **Step 1: Write failing tests** asserting the exact RPC payload, error propagation, and query invalidation list using the repository’s Supabase test pattern.
- [ ] **Step 2: Run the focused test** and confirm it fails because the archive client contract is absent.
- [ ] **Step 3: Implement the minimal typed helper and mutation hook**; do not add optimistic removal.
- [ ] **Step 4: Run the focused test** and confirm it passes.
- [ ] **Step 5: Commit** with `feat: add catalogue archive client mutation`.

### Task 3: Add role-gated confirmation UI to inventory settings

**Files:**
- Modify: `src/pages/clinic/settings/InventorySettings.tsx`
- Create: `src/components/clinic/settings/DeleteCatalogueEntryDialog.tsx`
- Test: `src/test/inventory-settings-delete.test.tsx`

**Interfaces:**
- Dialog props: `{ open: boolean; onOpenChange(open: boolean): void; name: string; onConfirm(): Promise<void>; isPending: boolean }`.
- The page maps inventory rows to `inventory_item`, service rows to `service`, and package rows to `package`.
- `useAuth().role` is checked against the literal allowlist `admin | special_admin`.

- [ ] **Step 1: Write failing component tests** for Delete visibility by role, confirmation copy, disabled pending state, successful close/refresh, and failure retaining the row.
- [ ] **Step 2: Run the focused component test** and confirm failure because no Delete control/dialog exists.
- [ ] **Step 3: Implement the dialog and row actions** beside Edit, using a destructive button, explicit name, “historical records remain unchanged” copy, toast success/error, and no optimistic row removal.
- [ ] **Step 4: Filter settings lists to omit `archived_at` rows** while preserving inactive-unarchived rows.
- [ ] **Step 5: Run the focused component test** and confirm it passes for all six tabs and all role cases.
- [ ] **Step 6: Commit** with `feat: add role-gated catalogue deletion controls`.

### Task 4: Ensure future-use pickers exclude archived entries

**Files:**
- Modify: `src/components/clinic/visit/CatalogItemPicker.tsx`
- Modify: `src/components/clinic/settings/PackageDialog.tsx`
- Modify: `src/hooks/clinic/useInventoryItems.ts`
- Modify: `src/hooks/clinic/useServices.ts`
- Modify: `src/hooks/clinic/usePackages.ts`
- Test: `src/test/catalogue-archive-filtering.test.ts`

- [ ] **Step 1: Write failing tests** showing archived inventory items, services, and packages are absent from new consultation and package-definition selections.
- [ ] **Step 2: Run the focused test** and confirm archived rows are currently selectable or returned.
- [ ] **Step 3: Add explicit `status = active` and `archived_at IS NULL` filtering** at query/selector boundaries, while allowing historical detail views to resolve retained rows by id.
- [ ] **Step 4: Run the focused test** and confirm it passes.
- [ ] **Step 5: Commit** with `fix: exclude archived catalogue entries from pickers`.

### Task 5: Full verification and deployment

**Files:**
- Modify only if verification reveals a defect.

- [ ] **Step 1: Run focused frontend tests** for Tasks 2–4 and confirm zero failures.
- [ ] **Step 2: Run the complete frontend test suite** with `npm test`.
- [ ] **Step 3: Run type/build verification** with `npm run build` and `git diff --check`.
- [ ] **Step 4: Review the migration diff** to confirm it is additive, role-restricted, and has no automatic data mutation.
- [ ] **Step 5: Push the tested commits** and wait for the Security Gate and Pages deployment workflows.
- [ ] **Step 6: Verify the deployed route** loads and the generated bundle contains the archive confirmation copy and role gate.
- [ ] **Step 7: Commit any verification-only fixes** with a focused message and repeat the affected checks.
