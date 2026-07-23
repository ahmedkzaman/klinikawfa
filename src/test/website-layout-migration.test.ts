import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  GENERAL_PAGE_JSON_SCHEMA,
  HOME_JSON_SCHEMA,
} from "@/features/website-cms/schemas/jsonSchemas";
import {
  GENERAL_PAGE_LAYOUT_KINDS,
  HOME_LAYOUT_KINDS,
} from "@/features/website-cms/layout/types";

const migrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260723190000_add_website_page_layout_validation.sql",
);

describe("website layout server validation", () => {
  it("adds the same strict optional layout shape to both client JSON schemas", () => {
    for (const [schema, kinds] of [
      [HOME_JSON_SCHEMA, HOME_LAYOUT_KINDS],
      [GENERAL_PAGE_JSON_SCHEMA, GENERAL_PAGE_LAYOUT_KINDS],
    ] as const) {
      expect(schema.required).not.toContain("layout");
      const layout = schema.properties.layout;
      expect(layout.additionalProperties).toBe(false);
      expect(layout.properties.version).toEqual({ type: "integer", enum: [1] });
      expect(layout.properties.blocks.items.additionalProperties).toBe(false);
      expect(layout.properties.blocks.items.properties.kind.enum).toEqual(kinds);
    }
  });

  it("wraps legacy validation with strict semantic layout checks", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("website_page_payload_without_layout_is_valid");
    expect(sql).toContain("website_layout_is_valid");
    expect(sql).toMatch(/p_payload\s*-\s*'layout'/);
    expect(sql).toMatch(/count\(DISTINCT block->>'id'\)/i);
    expect(sql).toMatch(/count\(DISTINCT block->>'contentRef'\)/i);
    expect(sql).toMatch(/count\(DISTINCT \(block->>'order'\)::integer\)/i);
    expect(sql).toMatch(/generate_series\(0,\s*v_block_count\s*-\s*1\)/i);
    expect(sql).toMatch(/a\.a_column\s*<\s*b\.b_column\s*\+\s*b\.b_width/i);
    expect(sql).toMatch(/a\.a_row\s*<\s*b\.b_row\s*\+\s*b\.b_height/i);
  });

  it("keeps validation unavailable to anonymous users, preserves trigger access, and performs no application-data writes", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION private\.website_layout_is_valid\(text, jsonb\)\s+FROM PUBLIC, anon;/i,
    );
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION private\.website_page_payload_is_valid\(text, jsonb\)\s+FROM PUBLIC, anon;/i,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION private\.website_page_payload_is_valid\(text, jsonb\)\s+TO authenticated;/i,
    );
    expect(sql).not.toMatch(
      /GRANT EXECUTE ON FUNCTION [^\n]+\s+TO (?:anon|service_role);/i,
    );
    expect(sql).not.toMatch(
      /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:public\.)?(?:website_pages|website_page_drafts|website_content_versions)\b/i,
    );
  });
});
