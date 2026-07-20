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
