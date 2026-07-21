import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrations = join(process.cwd(), "supabase", "migrations");

function googleTrackingSql(): string {
  const matches = readdirSync(migrations).filter((file) =>
    file.endsWith("_switch_tracking_to_google.sql"),
  );
  expect(matches).toHaveLength(1);
  return matches.length === 1
    ? readFileSync(join(migrations, matches[0]), "utf8")
    : "";
}

describe("Google tracking migration", () => {
  it("adds Google identifiers and reserves the Google tag provider", () => {
    const sql = googleTrackingSql();

    expect(sql).toMatch(/ADD COLUMN measurement_id text/i);
    expect(sql).toMatch(/ADD COLUMN ads_conversion_id text/i);
    expect(sql).toMatch(/ADD COLUMN ads_conversion_labels jsonb/i);
    expect(sql).toContain("provider = 'google_tag'");
    expect(sql).toMatch(/measurement_id[\s\S]*\^G-/i);
    expect(sql).toMatch(/ads_conversion_id[\s\S]*\^AW-/i);
  });

  it("removes the old Meta constraints but leaves the legacy column for separate cleanup", () => {
    const sql = googleTrackingSql();

    expect(sql).toMatch(
      /DROP CONSTRAINT IF EXISTS website_tracking_settings_provider_check/i,
    );
    expect(sql).toMatch(
      /DROP CONSTRAINT IF EXISTS website_tracking_settings_check/i,
    );
    expect(sql).not.toMatch(/DROP COLUMN(?: IF EXISTS)? pixel_id/i);
    expect(sql).not.toMatch(/RENAME COLUMN pixel_id/i);
  });

  it("keeps the migrated row disabled and allows only fixed contact-intent labels", () => {
    const sql = googleTrackingSql();

    expect(sql).toMatch(
      /UPDATE public\.website_tracking_settings[\s\S]*provider\s*=\s*'google_tag'[\s\S]*enabled\s*=\s*false/i,
    );
    for (const key of ["contact_click", "phone_click", "whatsapp_click"]) {
      expect(sql).toContain(`'${key}'`);
    }
    for (const forbidden of [
      "appointment_submitted",
      "patient_registered",
      "medical_event",
    ]) {
      expect(sql).not.toContain(`'${forbidden}'`);
    }
  });

  it("rewrites the provider row outside the authenticated actor trigger and restores it", () => {
    const sql = googleTrackingSql();
    const dropTrigger = sql.indexOf(
      "DROP TRIGGER IF EXISTS stamp_website_tracking_settings_actor",
    );
    const updateRow = sql.indexOf("UPDATE public.website_tracking_settings");
    const createTrigger = sql.indexOf(
      "CREATE TRIGGER stamp_website_tracking_settings_actor",
    );

    expect(dropTrigger).toBeGreaterThan(-1);
    expect(dropTrigger).toBeLessThan(updateRow);
    expect(updateRow).toBeLessThan(createTrigger);
    expect(sql.slice(createTrigger)).toMatch(
      /EXECUTE FUNCTION private\.stamp_website_tracking_settings_actor\(\)/i,
    );
  });

  it("reuses the exact four-role capability and preserves RLS authorization", () => {
    const sql = googleTrackingSql();

    expect(sql).not.toMatch(
      /CREATE OR REPLACE FUNCTION private\.can_manage_tracking_settings/i,
    );
    expect(sql).toContain(
      "'admin', 'special_admin', 'doctor_admin', 'website_editor'",
    );
    expect(sql).toContain("ALTER TABLE public.website_tracking_settings ENABLE ROW LEVEL SECURITY");
    expect(sql).toMatch(
      /CREATE POLICY "Tracking managers can update tracking settings"[\s\S]*USING \(\(SELECT private\.can_manage_tracking_settings\(\)\)\)[\s\S]*WITH CHECK \(\(SELECT private\.can_manage_tracking_settings\(\)\)\)/i,
    );
  });

  it("grants browser reads only to the six public-safe columns", () => {
    const sql = googleTrackingSql();
    const selectGrant = sql.match(
      /GRANT SELECT\s*\(([\s\S]*?)\)\s*ON TABLE public\.website_tracking_settings TO anon, authenticated;/i,
    )?.[1];

    expect(selectGrant).toBeTruthy();
    expect(selectGrant?.replace(/\s/g, "")).toBe(
      "provider,enabled,measurement_id,ads_conversion_id,ads_conversion_labels,consent_version",
    );
    expect(selectGrant).not.toMatch(/pixel_id|updated_by|updated_at/i);
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.website_tracking_settings FROM anon, authenticated/i);
  });

  it("grants only safe direct updates and keeps audit ownership database-side", () => {
    const sql = googleTrackingSql();
    const updateGrant = sql.match(
      /GRANT UPDATE\s*\(([\s\S]*?)\)\s*ON TABLE public\.website_tracking_settings TO authenticated;/i,
    )?.[1];

    expect(updateGrant).toBeTruthy();
    expect(updateGrant?.replace(/\s/g, "")).toBe(
      "enabled,measurement_id,ads_conversion_id,ads_conversion_labels,consent_version",
    );
    expect(updateGrant).not.toMatch(/provider|pixel_id|updated_by|updated_at/i);
    expect(sql).toContain("private.stamp_website_tracking_settings_actor()");
  });
});
