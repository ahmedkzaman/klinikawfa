import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260723093000_require_clinical_role_for_consultation_doctor.sql";

describe("website editor clinical boundary migration", () => {
  it("requires a current clinical role before doctor-linked reads", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(
      /create or replace function public\.is_current_user_consultation_doctor\(\s*_consultation_id uuid\s*\)/i,
    );
    expect(sql).toMatch(
      /select public\.is_clinical\(auth\.uid\(\)\)\s+and exists/i,
    );
    expect(sql).toContain("doctor.user_id = auth.uid()");
    expect(sql).toMatch(
      /revoke all on function public\.is_current_user_consultation_doctor\(uuid\) from public/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.is_current_user_consultation_doctor\(uuid\)\s+to authenticated, service_role/i,
    );
  });
});
