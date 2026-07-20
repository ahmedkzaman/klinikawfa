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
});
