import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationDirectory = resolve(process.cwd(), "supabase/migrations");
const migrationName = readdirSync(migrationDirectory)
  .filter((name) => name.endsWith("_add_service_seo_registry.sql"))
  .sort()
  .at(-1);
const migrationPath = migrationName ? resolve(migrationDirectory, migrationName) : "";
const sql = migrationPath && existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
const repairMigrationName = readdirSync(migrationDirectory)
  .filter((name) => name.endsWith("_repair_empty_service_seo_payloads.sql"))
  .sort()
  .at(-1);
const repairSql = repairMigrationName
  ? readFileSync(resolve(migrationDirectory, repairMigrationName), "utf8")
  : "";
const publishFixMigrationName = readdirSync(migrationDirectory)
  .filter((name) => name.endsWith("_fix_service_seo_object_key_count.sql"))
  .sort()
  .at(-1);
const publishFixSql = publishFixMigrationName
  ? readFileSync(resolve(migrationDirectory, publishFixMigrationName), "utf8")
  : "";
const dynamicMigrationName = readdirSync(migrationDirectory)
  .filter((name) => name.endsWith("_dynamic_service_seo_aeo.sql"))
  .sort()
  .at(-1);
const dynamicSql = dynamicMigrationName
  ? readFileSync(resolve(migrationDirectory, dynamicMigrationName), "utf8")
  : "";

describe("service SEO database contract", () => {
  it("creates a public read-only registry with all canonical targets", () => {
    expect(sql).toContain("create table public.website_service_seo");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("grant select on table public.website_service_seo to anon, authenticated");
    expect(sql).toContain("revoke insert, update, delete on table public.website_service_seo from anon, authenticated");
    expect(sql).toMatch(/for select to anon\s+using \(published_at is not null\)/i);
    expect(sql).toMatch(/for select to authenticated\s+using \(published_at is not null or \(select private\.can_manage_website\(\)\)\)/i);
    expect(sql).toContain("website_service_seo_published_by_idx");
    for (const path of [
      "/services/rawatan-umum/",
      "/services/prosedur-kecil/",
      "/services/pemeriksaan-kesihatan/",
      "/services/rawatan-telinga-kuantan/",
      "/services/minor-surgery-kutil-kuantan/",
      "/services/swab-test-demam-kuantan/",
      "/services/pengurusan-berat-badan-kuantan/",
      "/services/sunat-kuantan/",
    ]) {
      expect(sql).toContain(path);
    }
  });

  it("publishes only through an authenticated website-manager RPC", () => {
    expect(sql).toContain("private.can_manage_website()");
    expect(sql).toContain("stale website resource revision");
    expect(sql).toMatch(/revoke all on function public\.publish_service_seo\(uuid, integer\) from public, anon/i);
    expect(sql).toMatch(/grant execute on function public\.publish_service_seo\(uuid, integer\) to authenticated/i);
    expect(sql).not.toMatch(/create policy[\s\S]{0,180}website_service_seo[\s\S]{0,80}for (insert|update|delete)/i);
  });

  it("extends every CMS resource boundary and resolves safe media paths", () => {
    for (const table of [
      "website_content_drafts",
      "website_content_versions",
      "website_content_lifecycle",
      "website_media_references",
      "website_content_audit",
    ]) {
      expect(sql).toContain(`alter table public.${table}`);
    }
    expect(sql).toContain("service_seo");
    expect(sql).toContain("seo_ms_social_image_path");
    expect(sql).toContain("seo_en_social_image_path");
    expect(sql).toContain("private.website_seo_payload_is_valid");
  });

  it("repairs seeded empty SEO objects and makes complete metadata the database default", () => {
    expect(repairSql).toContain("alter column seo_ms set default");
    expect(repairSql).toContain("alter column seo_en set default");
    expect(repairSql).toContain("update public.website_service_seo");
    for (const key of ["title", "description", "canonicalUrl", "socialTitle", "socialDescription", "socialImageMediaId", "index", "follow"]) {
      expect(repairSql).toContain(`'${key}'`);
    }
  });

  it("counts top-level SEO payload keys using supported PostgreSQL JSONB functions", () => {
    expect(publishFixSql).toContain("pg_get_functiondef");
    expect(publishFixSql).toContain("jsonb_object_length(v_payload)");
    expect(publishFixSql).toMatch(/select count\(\*\)[\s\S]*pg_catalog\.jsonb_object_keys\(v_payload\)/i);
    expect(publishFixSql).toContain("raise exception 'publish_service_seo definition was not recognized'");
  });

  it("links every dynamic service to one SEO and AEO registry record", () => {
    expect(dynamicSql).toContain("add column if not exists service_id uuid");
    expect(dynamicSql).toContain("references public.clinic_services(id) on delete cascade");
    expect(dynamicSql).toContain("website_service_seo_service_id_uidx");
    expect(dynamicSql).toContain("add column if not exists aeo_ms jsonb");
    expect(dynamicSql).toContain("add column if not exists aeo_en jsonb");
    expect(dynamicSql).toContain("from public.clinic_services service");
    expect(dynamicSql).toMatch(/insert into public\.website_service_seo[\s\S]*on conflict \(path\) do update/i);
  });

  it("creates and deletes dynamic registry resources only through guarded RPCs", () => {
    expect(dynamicSql).toContain("returns table (service_id uuid, seo_id uuid, created boolean)");
    expect(dynamicSql).toContain("not public.is_admin(v_actor)");
    expect(dynamicSql).toContain("insert into public.website_service_seo");
    expect(dynamicSql).toContain("delete from public.website_content_drafts");
    expect(dynamicSql).toContain("core service pages cannot be deleted");
    expect(dynamicSql).toMatch(/revoke all on function public\.save_clinic_landing_page[\s\S]*from public, anon, authenticated/i);
    expect(dynamicSql).toMatch(/grant execute on function public\.save_clinic_landing_page[\s\S]*to authenticated/i);
  });

  it("publishes only strict version two SEO and AEO payloads", () => {
    expect(dynamicSql).toContain("array['aeoEn','aeoMs','focusPhraseEn','focusPhraseMs','path','schemaVersion','seoEn','seoMs']");
    expect(dynamicSql).toContain("v_payload->'aeoMs'");
    expect(dynamicSql).toContain("v_payload->'aeoEn'");
    expect(dynamicSql).toContain("private.service_aeo_payload_is_valid");
  });
});
