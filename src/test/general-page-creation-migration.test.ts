import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { RESERVED_PAGE_SLUGS } from "@/features/website-cms/schemas/page";

const migrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260721170000_create_general_website_page_rpc.sql",
);
const foundationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260720115031_create_website_cms_foundation.sql",
);
const migrationSql = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8")
  : "";
const foundationSql = readFileSync(foundationPath, "utf8");
const CREATION_OUTPUT_COLUMNS = ["id", "kind", "slug", "status", "revision"];

function quotedValues(input: string): string[] {
  return Array.from(input.matchAll(/'([^']+)'/g), (match) => match[1]);
}

function reservedSlugsFrom(
  sql: string,
  expression: RegExp,
): string[] {
  const match = sql.match(expression);
  return match ? quotedValues(match[1]) : [];
}

describe("general-page creation migration contract", () => {
  it("adds one invoker-rights transaction with the exact CMS authorization predicate", () => {
    expect(existsSync(migrationPath)).toBe(true);
    expect(migrationSql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.create_general_website_page\s*\(\s*p_slug text,\s*p_draft_content jsonb\s*\)/i,
    );
    expect(migrationSql).toMatch(/LANGUAGE plpgsql[\s\S]*SECURITY INVOKER/i);
    expect(migrationSql).toMatch(/SET search_path = pg_catalog/i);
    expect(migrationSql).not.toMatch(/SECURITY DEFINER/i);
    expect(migrationSql).toMatch(
      /\(SELECT auth\.uid\(\)\) IS NULL[\s\S]*NOT \(SELECT private\.can_manage_website\(\)\)/i,
    );
    expect(migrationSql).not.toMatch(/service_role/i);

    const pageInsert = migrationSql.search(
      /INSERT INTO public\.website_pages(?:\s+AS\s+created_page)?\s*\(kind, slug\)/i,
    );
    const draftInsert = migrationSql.search(
      /INSERT INTO public\.website_page_drafts\s*\(page_id, draft_content, base_revision\)/i,
    );
    expect(pageInsert).toBeGreaterThan(-1);
    expect(draftInsert).toBeGreaterThan(pageInsert);
    expect(migrationSql).not.toMatch(/EXCEPTION\s+WHEN/i);
  });

  it("validates the content payload and keeps every reserved slug aligned", () => {
    expect(migrationSql).toMatch(
      /private\.website_page_payload_is_valid\('content', p_draft_content\)/i,
    );
    expect(migrationSql).toMatch(
      /p_slug !~ '\^\[a-z0-9\]\+\(\?:-\[a-z0-9\]\+\)\*\$'/i,
    );

    const rpcReserved = reservedSlugsFrom(
      migrationSql,
      /p_slug\s+IN\s*\(([\s\S]*?)\)/i,
    );
    const foundationReserved = reservedSlugsFrom(
      foundationSql,
      /kind\s*<>\s*'content'\s+OR\s+slug\s+NOT\s+IN\s*\(([\s\S]*?)\)/i,
    );
    expect(rpcReserved).toEqual([...RESERVED_PAGE_SLUGS]);
    expect(foundationReserved).toEqual([...RESERVED_PAGE_SLUGS]);
  });

  it("captures only creation outputs that authenticated callers may select", () => {
    const returning = migrationSql.match(
      /INSERT INTO public\.website_pages[\s\S]*?RETURNING\s+([\s\S]*?)\s+INTO/i,
    );
    const selectGrant = foundationSql.match(
      /GRANT SELECT\s*\(([\s\S]*?)\)\s+ON TABLE public\.website_pages TO anon, authenticated/i,
    );
    const returnedColumns = returning
      ? returning[1]
          .split(",")
          .map((column) => column.trim().replace(/^created_page\./i, ""))
      : [];
    const grantedColumns = selectGrant
      ? selectGrant[1].split(",").map((column) => column.trim())
      : [];

    expect(migrationSql).not.toMatch(/RETURNING\s+\*/i);
    expect(migrationSql).not.toMatch(/%ROWTYPE/i);
    expect(migrationSql).not.toMatch(/\bpublished_by\b/i);
    expect(returnedColumns).toEqual(CREATION_OUTPUT_COLUMNS);
    expect(
      CREATION_OUTPUT_COLUMNS.every((column) => grantedColumns.includes(column)),
    ).toBe(true);
    expect(grantedColumns).not.toContain("published_by");
    expect(migrationSql).toMatch(
      /RETURNS TABLE\s*\(\s*id uuid,\s*kind text,\s*slug text,\s*status text,\s*revision integer\s*\)/i,
    );
  });

  it("exposes only execute access to authenticated callers", () => {
    expect(migrationSql).toMatch(
      /REVOKE ALL ON FUNCTION public\.create_general_website_page\(text, jsonb\) FROM PUBLIC/i,
    );
    expect(migrationSql).toMatch(
      /REVOKE ALL ON FUNCTION public\.create_general_website_page\(text, jsonb\) FROM anon, authenticated/i,
    );
    expect(migrationSql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.create_general_website_page\(text, jsonb\) TO authenticated/i,
    );
  });
});
