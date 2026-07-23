import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  GENERAL_PAGE_JSON_SCHEMA,
  HOME_JSON_SCHEMA,
} from "@/features/website-cms/schemas/jsonSchemas";

const migrations = join(process.cwd(), "supabase", "migrations");

function publishingMigration(): { name: string; sql: string } {
  const name = readdirSync(migrations).find((file) =>
    file.endsWith("_add_website_page_publishing.sql"),
  );
  expect(
    name,
    "missing migration ending in _add_website_page_publishing.sql",
  ).toBeTruthy();
  return { name: name!, sql: readFileSync(join(migrations, name!), "utf8") };
}

function functionDefinition(sql: string, name: string): string {
  const escapedName = name.replaceAll(".", "\\.");
  const definition =
    sql.match(
      new RegExp(
        `CREATE OR REPLACE FUNCTION ${escapedName}\\([\\s\\S]*?\\n\\$[a-z_]+\\$;`,
        "i",
      ),
    )?.[0] ?? "";
  expect(definition, `missing definition for ${name}`).not.toBe("");
  return definition;
}

function functionBody(definition: string): string {
  const body =
    definition.match(/AS \$(?<tag>[a-z_]+)\$([\s\S]*?)\$\k<tag>\$;/i)?.[2] ??
    "";
  expect(body, "function body was not extracted").not.toBe("");
  return body;
}

function embeddedSchemaAfter(body: string, marker: RegExp): unknown {
  const markerMatch = marker.exec(body);
  expect(markerMatch, `missing schema branch ${marker}`).toBeTruthy();
  const branch = body.slice(markerMatch!.index + markerMatch![0].length);
  const embedded = branch.match(
    /extensions\.jsonb_matches_schema\(\s*\$(?<tag>[a-z_]+)\$([\s\S]*?)\$\k<tag>\$\s*::jsonb?\s*,\s*p_payload\s*\)/i,
  );
  expect(embedded, `missing JSON schema call after ${marker}`).toBeTruthy();
  return JSON.parse(embedded![2]);
}

describe("website page publishing migration", () => {
  it("enables pg_jsonschema in extensions and embeds the exact Draft 7 schemas", () => {
    const { sql } = publishingMigration();
    expect(sql).toMatch(
      /CREATE EXTENSION IF NOT EXISTS pg_jsonschema WITH SCHEMA extensions;/i,
    );

    const validator = functionDefinition(
      sql,
      "private.website_page_payload_is_valid",
    );
    const body = functionBody(validator);
    expect(validator).toMatch(/RETURNS boolean[\s\S]*LANGUAGE plpgsql/i);
    expect(validator).toMatch(/IMMUTABLE[\s\S]*SECURITY INVOKER/i);
    expect(validator).toMatch(/SET search_path = pg_catalog/i);
    const { layout: _homeLayout, ...legacyHomeProperties } =
      HOME_JSON_SCHEMA.properties;
    const legacyHomeSchema = {
      ...HOME_JSON_SCHEMA,
      properties: legacyHomeProperties,
    };
    const { layout: _generalLayout, ...legacyGeneralProperties } =
      GENERAL_PAGE_JSON_SCHEMA.properties;
    const legacyGeneralSchema = {
      ...GENERAL_PAGE_JSON_SCHEMA,
      properties: legacyGeneralProperties,
    };

    expect(embeddedSchemaAfter(body, /WHEN p_kind = 'home' THEN/i)).toEqual(
      legacyHomeSchema,
    );
    expect(
      embeddedSchemaAfter(
        body,
        /WHEN p_kind IN \('system_content', 'content'\) THEN/i,
      ),
    ).toEqual(legacyGeneralSchema);
    expect(body).toMatch(/ELSE\s+RETURN false;\s+END CASE;/i);
    expect(body.match(/extensions\.jsonb_matches_schema/gi) ?? []).toHaveLength(
      2,
    );
  });

  it("validates every inserted or changed draft through an invoker trigger", () => {
    const { sql } = publishingMigration();
    expect(sql).toMatch(
      /ADD COLUMN publish_requested_at timestamptz;/i,
    );
    const validatorTrigger = functionDefinition(
      sql,
      "private.validate_website_page_draft_payload",
    );
    const body = functionBody(validatorTrigger);
    expect(validatorTrigger).toMatch(/RETURNS trigger[\s\S]*SECURITY INVOKER/i);
    expect(validatorTrigger).toMatch(/SET search_path = pg_catalog/i);
    expect(body).toMatch(/FROM public\.website_pages AS [a-z_]+/i);
    expect(body).toContain(
      "private.website_page_payload_is_valid(v_kind, NEW.draft_content)",
    );
    expect(body).toMatch(/ERRCODE = '22023'/i);
    expect(sql).toMatch(
      /CREATE TRIGGER validate_website_page_draft_payload\s+BEFORE INSERT OR UPDATE OF draft_content ON public\.website_page_drafts[\s\S]*?EXECUTE FUNCTION private\.validate_website_page_draft_payload\(\);/i,
    );
  });

  it("publishes under one private trigger transaction with a locked optimistic revision", () => {
    const { sql } = publishingMigration();
    const publisher = functionDefinition(
      sql,
      "private.publish_website_page_draft",
    );
    const body = functionBody(publisher);

    expect(publisher).toMatch(/RETURNS trigger[\s\S]*SECURITY DEFINER/i);
    expect(publisher).toMatch(/SET search_path = pg_catalog/i);
    expect(body).toContain("private.can_manage_website()");
    expect(body).toMatch(/ERRCODE = '42501'/i);

    const lockIndex = body.search(
      /SELECT \* INTO v_page\s+FROM public\.website_pages\s+WHERE id = NEW\.page_id\s+FOR UPDATE;/i,
    );
    const validationIndex = body.search(
      /private\.website_page_payload_is_valid\(\s*v_page\.kind,\s*NEW\.draft_content\s*\)/i,
    );
    const conflictIndex = body.search(
      /IF NEW\.base_revision <> v_page\.revision THEN[\s\S]*?ERRCODE = '40001'/i,
    );
    const snapshotIndex = body.search(
      /INSERT INTO public\.website_content_versions\s*\(resource_type, resource_id, revision, payload, published_by\)\s*VALUES\s*\('page', v_page\.id, v_page\.revision, v_page\.published_content, auth\.uid\(\)\);/i,
    );
    const replaceIndex = body.search(
      /UPDATE public\.website_pages\s+SET published_content = NEW\.draft_content,\s*status = 'published',\s*revision = revision \+ 1,\s*published_at = now\(\),\s*published_by = auth\.uid\(\),\s*updated_at = now\(\)\s+WHERE id = NEW\.page_id;/i,
    );
    const advanceDraftIndex = body.search(
      /NEW\.base_revision := v_page\.revision \+ 1;[\s\S]*NEW\.updated_by := auth\.uid\(\);[\s\S]*NEW\.updated_at := now\(\);[\s\S]*RETURN NEW;/i,
    );

    for (const [label, index] of [
      ["page lock", lockIndex],
      ["publish validation", validationIndex],
      ["revision conflict", conflictIndex],
      ["version snapshot", snapshotIndex],
      ["published replacement", replaceIndex],
      ["draft revision advance", advanceDraftIndex],
    ] as const) {
      expect(index, `missing ${label}`).toBeGreaterThanOrEqual(0);
    }
    expect(lockIndex).toBeLessThan(validationIndex);
    expect(validationIndex).toBeLessThan(conflictIndex);
    expect(conflictIndex).toBeLessThan(snapshotIndex);
    expect(snapshotIndex).toBeLessThan(replaceIndex);
    expect(replaceIndex).toBeLessThan(advanceDraftIndex);

    expect(sql).toMatch(
      /CREATE TRIGGER publish_website_page_draft\s+BEFORE UPDATE OF publish_requested_at ON public\.website_page_drafts[\s\S]*?EXECUTE FUNCTION private\.publish_website_page_draft\(\);/i,
    );
  });

  it("keeps privileged trigger functions internal and grants only required validator execution", () => {
    const { sql } = publishingMigration();

    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION private\.website_page_payload_is_valid\(text, jsonb\) FROM PUBLIC;/i,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION private\.website_page_payload_is_valid\(text, jsonb\) TO authenticated;/i,
    );
    expect(sql).not.toMatch(
      /GRANT EXECUTE ON FUNCTION private\.website_page_payload_is_valid\(text, jsonb\) TO (?:anon|service_role)/i,
    );

    for (const triggerFunction of [
      "validate_website_page_draft_payload",
      "publish_website_page_draft",
    ]) {
      expect(sql).toMatch(
        new RegExp(
          `REVOKE ALL ON FUNCTION private\\.${triggerFunction}\\(\\) FROM PUBLIC;`,
          "i",
        ),
      );
      expect(sql).not.toMatch(
        new RegExp(
          `GRANT EXECUTE ON FUNCTION private\\.${triggerFunction}\\(\\) TO (?:anon|authenticated|service_role|PUBLIC)`,
          "i",
        ),
      );
    }

    const publisherBody = functionBody(
      functionDefinition(sql, "private.publish_website_page_draft"),
    );
    expect(publisherBody).not.toMatch(
      /(?:FROM|UPDATE|INSERT INTO)\s+website_(?:pages|content_versions)/i,
    );
    expect(publisherBody).toContain("FROM public.website_pages");
    expect(publisherBody).toContain(
      "INSERT INTO public.website_content_versions",
    );
    expect(publisherBody).toContain("UPDATE public.website_pages");
    expect(publisherBody).toContain("auth.uid()");
    expect(sql).toMatch(
      /GRANT UPDATE \(publish_requested_at\)\s+ON TABLE public\.website_page_drafts TO authenticated;/i,
    );
  });
});
