import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const migrations = join(root, "supabase", "migrations");

function migrationEndingWith(suffix: string): { name: string; sql: string } {
  const name = readdirSync(migrations).find((file) => file.endsWith(suffix));
  expect(name, `missing migration ending in ${suffix}`).toBeTruthy();
  return { name: name!, sql: readFileSync(join(migrations, name!), "utf8") };
}

function policy(sql: string, name: string, table: string): string {
  return (
    sql.match(
      new RegExp(
        `CREATE POLICY "${name}"\\s+ON ${table.replace(".", "\\.")}([\\s\\S]*?);`,
        "i",
      ),
    )?.[0] ?? ""
  );
}

describe("CMS foundation integration hardening migration", () => {
  it("is a distinct CLI-generated migration after the CMS foundation", () => {
    const { name } = migrationEndingWith("_harden_website_cms_integration.sql");
    expect(name.localeCompare("20260720115031_create_website_cms_foundation.sql")).toBeGreaterThan(0);
  });

  it("removes every direct public clinic_reviews read without granting Website Editor access", () => {
    const { sql } = migrationEndingWith("_harden_website_cms_integration.sql");
    expect(sql).toMatch(
      /DROP POLICY IF EXISTS "Public can read clinic_reviews active"\s+ON public\.clinic_reviews;/i,
    );
    expect(sql).not.toMatch(/CREATE POLICY[\s\S]*clinic_reviews[\s\S]*status\s*=\s*'active'/i);
    expect(sql).not.toMatch(/clinic_reviews[\s\S]*can_manage_website/i);
    expect(sql).not.toMatch(/clinic_reviews[\s\S]*website_editor/i);
  });

  it("authorizes self-service through the exact established workforce role set", () => {
    const { sql } = migrationEndingWith("_harden_website_cms_integration.sql");
    const body =
      sql.match(
        /CREATE OR REPLACE FUNCTION private\.is_workforce_self_service_user\(\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/i,
      )?.[1] ?? "";

    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION private\.is_workforce_self_service_user\(\)[\s\S]*SECURITY DEFINER[\s\S]*SET search_path = pg_catalog/i,
    );
    expect(body).toContain("FROM public.user_roles AS ur");
    expect(body).toContain("ur.user_id = (SELECT auth.uid())");
    expect(body).toContain(
      "ur.role::text IN ('admin', 'special_admin', 'doctor_admin', 'ops_staff', 'operations', 'staff', 'locum', 'resident_doctor')",
    );
    expect(body).not.toContain("website_editor");
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION private\.is_workforce_self_service_user\(\) FROM PUBLIC/i,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION private\.is_workforce_self_service_user\(\) TO authenticated/i,
    );
    expect(sql).not.toContain("user_metadata");
  });

  it("replaces attendance, daily report, and private Storage self-service policies", () => {
    const { sql } = migrationEndingWith("_harden_website_cms_integration.sql");
    const expectedDrops = [
      ['Staff can view own attendance', 'public.attendance_records'],
      ['Staff can insert own attendance', 'public.attendance_records'],
      ['Staff can view own daily reports', 'public.daily_reports'],
      ['Staff can insert own daily reports', 'public.daily_reports'],
      ['Staff can update own daily reports', 'public.daily_reports'],
      ['Staff view own daily report files', 'storage.objects'],
      ['Staff can upload own daily report files', 'storage.objects'],
      ['Staff can update own daily report files', 'storage.objects'],
      ['Staff can delete own daily report files', 'storage.objects'],
    ] as const;
    for (const [name, table] of expectedDrops) {
      expect(sql).toMatch(
        new RegExp(`DROP POLICY IF EXISTS "${name}"\\s+ON ${table.replace(".", "\\.")};`, "i"),
      );
    }

    const policies = [
      policy(sql, "Workforce can view own attendance", "public.attendance_records"),
      policy(sql, "Workforce can insert own attendance", "public.attendance_records"),
      policy(sql, "Workforce can view own daily reports", "public.daily_reports"),
      policy(sql, "Workforce can insert own daily reports", "public.daily_reports"),
      policy(sql, "Workforce can update own daily reports", "public.daily_reports"),
      policy(sql, "Workforce can view own daily report files", "storage.objects"),
      policy(sql, "Workforce can upload own daily report files", "storage.objects"),
      policy(sql, "Workforce can update own daily report files", "storage.objects"),
      policy(sql, "Workforce can delete own daily report files", "storage.objects"),
    ];
    for (const definition of policies) {
      expect(definition).not.toBe("");
      expect(definition).toContain("(SELECT private.is_workforce_self_service_user())");
      expect(definition).toMatch(/TO authenticated/i);
      expect(definition).not.toContain("website_editor");
    }
    expect(policies.slice(0, 5).join("\n")).toContain("auth.uid() = user_id");
    expect(policies.slice(5).join("\n")).toContain("bucket_id = 'daily-reports'");
    expect(policy(sql, "Workforce can update own daily reports", "public.daily_reports")).toMatch(
      /USING[\s\S]*WITH CHECK/i,
    );
    expect(policy(sql, "Workforce can update own daily report files", "storage.objects")).toMatch(
      /USING[\s\S]*WITH CHECK/i,
    );
  });

  it("stamps tracking actors through the tracking-specific authorization helper", () => {
    const { sql } = migrationEndingWith("_harden_website_cms_integration.sql");
    const body =
      sql.match(
        /CREATE OR REPLACE FUNCTION private\.stamp_website_tracking_settings_actor\(\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/i,
      )?.[1] ?? "";
    expect(body).toContain("private.can_manage_tracking_settings()");
    expect(body).not.toContain("private.can_manage_website()");
    expect(body).toMatch(/NEW\.updated_by\s*:=\s*\(SELECT auth\.uid\(\)\)/i);
    expect(body).toMatch(/NEW\.updated_at\s*:=\s*now\(\)/i);
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION private\.stamp_website_tracking_settings_actor\(\) FROM PUBLIC/i,
    );
    expect(sql).not.toMatch(
      /GRANT EXECUTE ON FUNCTION private\.stamp_website_tracking_settings_actor\(\) TO (anon|authenticated)/i,
    );
    expect(sql).toMatch(
      /CREATE TRIGGER stamp_website_tracking_settings_actor\s+BEFORE UPDATE ON public\.website_tracking_settings[\s\S]*EXECUTE FUNCTION private\.stamp_website_tracking_settings_actor\(\)/i,
    );
  });

  it("reserves blog in the not-yet-applied foundation slug constraint", () => {
    const { sql } = migrationEndingWith("_create_website_cms_foundation.sql");
    const reserved =
      sql.match(/kind <> 'content' OR slug NOT IN \(([\s\S]*?)\)\s*\)/i)?.[1] ?? "";
    expect(reserved).toMatch(/'blog'/i);
  });
});

describe("dormant staging matrix hardening contracts", () => {
  const fixture = readFileSync(
    join(root, "stress-tests", "phase-d", "website-cms.fixture.test.ts"),
    "utf8",
  );
  const seed = readFileSync(
    join(root, "stress-tests", "phase-d", "seed-rls-matrix.sql"),
    "utf8",
  );
  const cleanup = readFileSync(
    join(root, "stress-tests", "phase-d", "cleanup-rls-matrix.sql"),
    "utf8",
  );

  it("keeps the required 15-case matrix byte-for-byte in order", () => {
    const casesBlock = fixture.match(/export const cases = \[([\s\S]*?)\] as const;/)?.[1] ?? "";
    const expected = [
      '["anonymous reads published page", "anon", "website_pages.selectPublished", true]',
      '["anonymous reads page draft", "anon", "website_page_drafts.select", false]',
      '["website editor writes page draft", "website_editor", "website_page_drafts.upsert", true]',
      '["website editor reads clinic reviews", "website_editor", "clinic_reviews.select", false]',
      '["website editor writes patient", "website_editor", "patients.update", false]',
      '["website editor writes private storage", "website_editor", "private_documents.insert", false]',
      '["website editor writes website media", "website_editor", "website-media.insert", true]',
      '["anonymous lists website media", "anon", "website-media.list", false]',
      '["ordinary staff writes website draft", "staff", "website_page_drafts.upsert", false]',
      '["locum opens editor data", "locum", "website_page_drafts.select", false]',
      '["administrator updates tracking", "admin", "website_tracking_settings.update", true]',
      '["special administrator updates tracking", "special_admin", "website_tracking_settings.update", true]',
      '["doctor administrator updates tracking", "doctor_admin", "website_tracking_settings.update", true]',
      '["website editor updates tracking", "website_editor", "website_tracking_settings.update", true]',
      '["ordinary staff updates tracking", "staff", "website_tracking_settings.update", false]',
    ];
    let cursor = -1;
    for (const matrixCase of expected) {
      const next = casesBlock.indexOf(matrixCase);
      expect(next).toBeGreaterThan(cursor);
      cursor = next;
    }
    expect(casesBlock.match(/^\s*\[/gm) ?? []).toHaveLength(15);
  });

  it("uses an active clinic review and explicit Website Editor workforce denials", () => {
    expect(seed).toMatch(
      /'cafe5005-0000-4000-8000-000000000004'[\s\S]*'RLS matrix private review'[\s\S]*'active'/i,
    );
    for (const operation of [
      "attendance_records.select",
      "attendance_records.insert",
      "attendance_records.update",
      "attendance_records.delete",
      "daily_reports.select",
      "daily_reports.insert",
      "daily_reports.update",
      "daily_reports.delete",
      "daily-reports.select",
      "daily-reports.insert",
      "daily-reports.update",
      "daily-reports.delete",
    ]) {
      expect(fixture).toContain(`"${operation}", false`);
    }
  });

  it("uses privileged before/after invariants for every denied write", () => {
    expect(fixture).toContain("async function attemptAndVerifyDeniedMutation");
    expect(fixture).toMatch(/const before = await snapshot\(\)/);
    expect(fixture).toMatch(/const after = await snapshot\(\)/);
    expect(fixture).toMatch(/await restore\(before\)/);
    for (const operation of [
      "website_page_drafts.upsert",
      "patients.update",
      "website_tracking_settings.update",
      "attendance_records.insert",
      "attendance_records.update",
      "attendance_records.delete",
      "daily_reports.insert",
      "daily_reports.update",
      "daily_reports.delete",
      "daily-reports.insert",
      "daily-reports.update",
      "daily-reports.delete",
    ]) {
      const operationBody =
        fixture.match(
          new RegExp(`"${operation.replace(".", "\\.")}":([\\s\\S]*?)(?=\\n  "[^"\\n]+":|\\n};)`),
        )?.[1] ?? "";
      expect(operationBody, operation).toContain("attemptAndVerifyDeniedMutation");
    }
  });

  it("seeds and cleans deterministic attendance and daily-report rows", () => {
    for (const id of [
      "cafe5005-0000-4000-8000-000000000006",
      "cafe5005-0000-4000-8000-000000000007",
    ]) {
      expect(seed).toContain(id);
      expect(cleanup).toContain(id);
    }
    expect(seed).toContain("INSERT INTO public.attendance_records");
    expect(seed).toContain("INSERT INTO public.daily_reports");
    expect(cleanup).toContain("DELETE FROM public.attendance_records");
    expect(cleanup).toContain("DELETE FROM public.daily_reports");
  });
});
