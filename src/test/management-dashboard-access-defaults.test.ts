import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260810223000_restore_management_dashboard_role_defaults.sql", "utf8");

describe("management dashboard access defaults", () => {
  it("allows intended roles by default and keeps account overrides", () => {
    expect(sql).toContain("'admin', 'special_admin', 'doctor_admin', 'resident_doctor'");
    expect(sql).toContain("'purchaser', 'staff_nurse'");
    expect(sql).toContain("clinic_user_permission_overrides");
    expect(sql).toContain("COALESCE");
  });
});
