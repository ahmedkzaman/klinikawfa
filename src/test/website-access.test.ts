import { describe, expect, it } from "vitest";
import {
  canManageTrackingSettingsRole,
  canManageWebsiteRole,
  isWebsiteEditorRole,
} from "@/lib/website-access";

describe("website role capabilities", () => {
  it("allows Website Editor and Administrator roles to manage content", () => {
    expect(canManageWebsiteRole("website_editor")).toBe(true);
    expect(canManageWebsiteRole("admin")).toBe(true);
    expect(canManageWebsiteRole("special_admin")).toBe(true);
    expect(canManageWebsiteRole("doctor_admin")).toBe(true);
  });

  it.each(["admin", "special_admin", "doctor_admin", "website_editor"])(
    "allows %s to manage Meta tracking settings",
    (role) => expect(canManageTrackingSettingsRole(role)).toBe(true),
  );

  it.each(["staff", "ops_staff", "operations", "locum", "resident_doctor", "guest", null])(
    "denies Meta tracking settings to %s",
    (role) => expect(canManageTrackingSettingsRole(role)).toBe(false),
  );

  it.each(["staff", "ops_staff", "operations", "locum", "resident_doctor", "guest", null])(
    "denies website management to %s",
    (role) => expect(canManageWebsiteRole(role)).toBe(false),
  );

  it("identifies only the dedicated editor role", () => {
    expect(isWebsiteEditorRole("website_editor")).toBe(true);
    expect(isWebsiteEditorRole("admin")).toBe(false);
  });
});
