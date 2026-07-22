import { beforeAll, expect, test } from "bun:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

if (process.env.RLS_MATRIX_RUNNER !== "1") throw new Error("Run through scripts/run-rls-matrix.sh only");

const url = process.env.STAGING_API_URL!;
const anonKey = process.env.STAGING_ANON_KEY!;
type Role = "website_editor" | "admin" | "special_admin" | "doctor_admin" | "staff" | "locum" | "resident";
const roles: Role[] = ["website_editor", "admin", "special_admin", "doctor_admin", "staff", "locum", "resident"];
const clients = new Map<Role, SupabaseClient>();

beforeAll(async () => {
  for (const role of roles) {
    const prefix = `RLS_${role.toUpperCase()}_`;
    const client = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data, error } = await client.auth.signInWithPassword({ email: process.env[`${prefix}EMAIL`]!, password: process.env[`${prefix}PASSWORD`]! });
    if (error || !data.user || data.user.id !== process.env[`${prefix}UID`]) throw new Error(`staging sign-in failed for ${role}`);
    clients.set(role, client);
  }
});

for (const role of ["website_editor", "admin", "special_admin", "doctor_admin"] as const) {
  test(`[${role}] can read website lifecycle and media`, async () => {
    for (const table of ["website_content_lifecycle", "website_media", "website_content_audit"] as const) {
      const { error } = await clients.get(role)!.from(table).select("id").limit(1);
      expect(error).toBeNull();
    }
  });
}

for (const role of ["staff", "locum", "resident"] as const) {
  test(`[${role}] cannot read website management state`, async () => {
    const { data, error } = await clients.get(role)!.from("website_content_lifecycle").select("resource_id").limit(1);
    expect(error === null ? data ?? [] : []).toEqual([]);
  });
}

test("website_editor cannot read clinic operational fixtures", async () => {
  const client = clients.get("website_editor")!;
  const probes: Array<[string, string]> = [
    ["clinic_appointments", "a99caaaa-0000-4000-8000-000000000001"],
    ["consultations", "babebbbb-0000-4000-8000-000000000002"],
    ["payments", "fee00001-0000-4000-8000-000000000001"],
    ["panel_claims", "c1a10001-0000-4000-8000-000000000001"],
  ];
  for (const [table, id] of probes) {
    const { data, error } = await client.from(table).select("id").eq("id", id);
    expect(error === null ? data ?? [] : []).toEqual([]);
  }
});

test("anonymous users cannot read CMS management tables", async () => {
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await client.from("website_media").select("id").limit(1);
  expect(error === null ? data ?? [] : []).toEqual([]);
});
