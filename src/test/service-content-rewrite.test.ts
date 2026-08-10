import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260810230000_rewrite_general_and_minor_services.sql", "utf8");

describe("rewritten service content", () => {
  it("updates both service categories with bilingual rich content and matching lists", () => {
    expect(sql).toContain("WHERE slug = 'rawatan-am'");
    expect(sql).toContain("WHERE slug = 'prosedur-minor'");
    expect(sql).toContain('class="ql-size-large"');
    expect(sql).toContain('class="ql-size-huge"');
    expect(sql).toContain("Khatan bayi dan kanak-kanak");
    expect(sql).toContain("Baby and child circumcision");
  });
});
