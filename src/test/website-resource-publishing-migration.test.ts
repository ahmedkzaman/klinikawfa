import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/20260722190000_add_website_resource_publishing.sql"), "utf8");

describe("website resource publishing migration", () => {
  it("uses fixed resource branches with authorization and revision checks", () => {
    expect(sql).toContain("NOT private.can_manage_website()");
    expect(sql).toContain("USING ERRCODE = '40001'");
    for (const type of ["service", "team_member", "blog_post", "gallery_image", "review"]) {
      expect(sql).toContain(`WHEN '${type}'`);
    }
    expect(sql).not.toMatch(/EXECUTE\s+format|EXECUTE\s+p_/i);
  });

  it("keeps drafts private, versions bounded and public execution revoked", () => {
    expect(sql).toContain("public.website_content_drafts");
    expect(sql).toContain("public.website_content_versions");
    expect(sql).toContain("OFFSET 20");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.publish_website_resource");
    expect(sql).toContain("TO authenticated");
  });

  it("does not touch clinic or patient operational tables", () => {
    expect(sql).not.toMatch(/patients|appointments|payments|payroll|attendance_records/i);
  });
});
