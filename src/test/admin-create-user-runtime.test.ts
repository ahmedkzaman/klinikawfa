import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "functions",
    "admin-create-user",
    "index.ts",
  ),
  "utf8",
);

describe("admin-create-user Edge Function runtime contract", () => {
  it("uses the token verifier supported by its pinned Supabase client", () => {
    expect(source).toContain("@supabase/supabase-js@2.45.0");
    expect(source).toContain("anon.auth.getUser(token)");
    expect(source).not.toContain("anon.auth.getClaims(token)");
  });
});
