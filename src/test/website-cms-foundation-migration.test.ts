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
    expect(sql).toContain("CREATE OR REPLACE FUNCTION private.can_manage_tracking_settings()");
    expect(sql).toContain("auth.uid()");
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION private\.can_manage_website\(\) FROM PUBLIC/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION private\.can_manage_tracking_settings\(\) FROM PUBLIC/i);
    expect(sql).toContain("CREATE OR REPLACE FUNCTION private.stamp_website_draft_actor()");
    expect(sql).toMatch(/NEW\.updated_by\s*:=\s*\(SELECT auth\.uid\(\)\)/i);
    expect(sql).not.toContain("user_metadata");
  });

  it("restricts tracking settings to the exact approved role set", () => {
    const sql = foundationSql();
    const body = sql.match(
      /CREATE OR REPLACE FUNCTION private\.can_manage_tracking_settings\(\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/i,
    )?.[1] ?? "";
    expect(body).toContain(
      "ur.role::text IN ('admin', 'special_admin', 'doctor_admin', 'website_editor')",
    );
    for (const denied of ["staff", "ops_staff", "operations", "locum", "resident_doctor", "guest"]) {
      expect(body).not.toContain(`'${denied}'`);
    }
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

  it("wraps every row-independent policy helper call in SELECT", () => {
    const sql = foundationSql();
    const policies = sql.slice(
      sql.indexOf('CREATE POLICY "Published website pages are readable"'),
    );
    expect(
      policies.match(/\(SELECT private\.can_manage_website\(\)\)/g) ?? [],
    ).toHaveLength(25);
    expect(
      policies.match(/\(SELECT private\.can_manage_tracking_settings\(\)\)/g) ?? [],
    ).toHaveLength(3);
    const withoutWrappedCalls = policies
      .replaceAll("(SELECT private.can_manage_website())", "")
      .replaceAll("(SELECT private.can_manage_tracking_settings())", "");
    expect(withoutWrappedCalls).not.toContain("private.can_manage_website()");
    expect(withoutWrappedCalls).not.toContain("private.can_manage_tracking_settings()");
  });

  it("indexes non-unique foreign-key columns without duplicating keyed links", () => {
    const sql = foundationSql();
    for (const index of [
      "CREATE INDEX idx_website_pages_published_by ON public.website_pages (published_by);",
      "CREATE INDEX idx_website_page_drafts_updated_by ON public.website_page_drafts (updated_by);",
      "CREATE INDEX idx_website_content_drafts_updated_by ON public.website_content_drafts (updated_by);",
      "CREATE INDEX idx_website_content_versions_published_by ON public.website_content_versions (published_by);",
      "CREATE INDEX idx_website_navigation_items_page_id ON public.website_navigation_items (page_id);",
      "CREATE INDEX idx_website_navigation_items_parent_id ON public.website_navigation_items (parent_id);",
      "CREATE INDEX idx_website_navigation_drafts_updated_by ON public.website_navigation_drafts (updated_by);",
      "CREATE INDEX idx_website_tracking_settings_updated_by ON public.website_tracking_settings (updated_by);",
    ]) {
      expect(sql).toContain(index);
    }
  });
});
