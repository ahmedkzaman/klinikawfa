/**
 * Deterministic Website CMS RLS and Storage matrix.
 *
 * This file is deliberately guarded at import time. It may only run after the
 * production-reference guard, credential checks, and UID/email verification in
 * scripts/run-rls-matrix.sh. It uses exact reserved records and object paths;
 * no permissive subset assertions are used.
 */
import { afterAll, beforeAll, expect, test } from "bun:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

if (process.env.RLS_MATRIX_RUNNER !== "1") {
  throw new Error(
    "website-cms.fixture.test.ts must only be executed through scripts/run-rls-matrix.sh"
  );
}

export const cases = [
  ["anonymous reads published page", "anon", "website_pages.selectPublished", true],
  ["anonymous reads page draft", "anon", "website_page_drafts.select", false],
  ["website editor writes page draft", "website_editor", "website_page_drafts.upsert", true],
  ["website editor reads clinic reviews", "website_editor", "clinic_reviews.select", false],
  ["website editor writes patient", "website_editor", "patients.update", false],
  ["website editor writes private storage", "website_editor", "private_documents.insert", false],
  ["website editor writes website media", "website_editor", "website-media.insert", true],
  ["anonymous lists website media", "anon", "website-media.list", false],
  ["ordinary staff writes website draft", "staff", "website_page_drafts.upsert", false],
  ["locum opens editor data", "locum", "website_page_drafts.select", false],
  ["administrator updates tracking", "admin", "website_tracking_settings.update", true],
  ["special administrator updates tracking", "special_admin", "website_tracking_settings.update", true],
  ["doctor administrator updates tracking", "doctor_admin", "website_tracking_settings.update", true],
  ["website editor updates tracking", "website_editor", "website_tracking_settings.update", true],
  ["ordinary staff updates tracking", "staff", "website_tracking_settings.update", false],
] as const;

const supplementalCases = [
  ["resident doctor opens editor data", "resident_doctor", "website_page_drafts.select", false],
  ["website editor lists approved website media folder", "website_editor", "website-media.select", true],
  ["website editor updates website media in approved folder", "website_editor", "website-media.update", true],
  ["website editor cannot upload outside approved folders", "website_editor", "website-media.insertInvalidFolder", false],
  ["website editor cannot move media outside approved folders", "website_editor", "website-media.moveInvalidFolder", false],
  ["website editor deletes website media in approved folder", "website_editor", "website-media.delete", true],
] as const;

type Actor =
  | "anon"
  | "website_editor"
  | "admin"
  | "special_admin"
  | "doctor_admin"
  | "staff"
  | "locum"
  | "resident_doctor";

type Operation =
  | (typeof cases)[number][2]
  | (typeof supplementalCases)[number][2];

type CredentialActor = Exclude<Actor, "anon">;
type Credential = { uid: string; email: string; password: string };

const URL = requiredEnv("STAGING_API_URL");
const ANON_KEY = requiredEnv("STAGING_ANON_KEY");

const credentials: Record<CredentialActor, Credential> = {
  website_editor: credential("WEBSITE_EDITOR"),
  admin: credential("ADMIN"),
  special_admin: credential("SPECIAL_ADMIN"),
  doctor_admin: credential("DOCTOR_ADMIN"),
  staff: credential("STAFF"),
  locum: credential("LOCUM"),
  resident_doctor: credential("RESIDENT"),
};

const clients: Partial<Record<Actor, SupabaseClient>> = {};
const FIXTURE_PATIENT_ID = "babeaaaa-0000-4000-8000-000000000001";
const ABSENT_PAGE_ID = "cafe5005-0000-4000-8000-000000000005";
const mediaBase = `rls-matrix-${credentials.website_editor.uid}.webp`;
const MEDIA_PATH = `pages/${mediaBase}`;
const INVALID_MEDIA_PATH = `private/${mediaBase}`;
const PRIVATE_MEDIA_PATH = `rls-matrix/${mediaBase}`;
const MEDIA_BYTES = new Uint8Array([0x52, 0x49, 0x46, 0x46]);

let trackingSetting: {
  provider: string;
  enabled: boolean;
  pixel_id: string | null;
  consent_version: number;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`required staging variable ${name} is empty`);
  return value;
}

function credential(prefix: string): Credential {
  return {
    uid: requiredEnv(`RLS_${prefix}_UID`),
    email: requiredEnv(`RLS_${prefix}_EMAIL`),
    password: requiredEnv(`RLS_${prefix}_PASSWORD`),
  };
}

async function signIn(actor: CredentialActor): Promise<SupabaseClient> {
  const client = createClient(URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const expected = credentials[actor];
  const { data, error } = await client.auth.signInWithPassword({
    email: expected.email,
    password: expected.password,
  });
  if (error || !data.user) throw new Error(`sign-in failed for ${actor}`);
  if (data.user.id !== expected.uid) {
    throw new Error(`signed-in user id does not match the configured ${actor} UID`);
  }
  return client;
}

function exactRow(data: unknown, key: string, value: string): boolean {
  return (
    Array.isArray(data) &&
    data.length === 1 &&
    typeof data[0] === "object" &&
    data[0] !== null &&
    (data[0] as Record<string, unknown>)[key] === value
  );
}

async function upload(
  client: SupabaseClient,
  bucket: string,
  path: string
): Promise<boolean> {
  const { error } = await client.storage.from(bucket).upload(path, MEDIA_BYTES, {
    contentType: "image/webp",
    upsert: false,
  });
  return error === null;
}

beforeAll(async () => {
  clients.anon = createClient(URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  for (const actor of Object.keys(credentials) as CredentialActor[]) {
    clients[actor] = await signIn(actor);
  }

  const pageResult = await clients.website_editor!
    .from("website_pages")
    .select("id")
    .eq("id", ABSENT_PAGE_ID);
  if (pageResult.error || !Array.isArray(pageResult.data) || pageResult.data.length !== 0) {
    throw new Error(
      "reserved absent-page authorization probe is not empty"
    );
  }

  const trackingResult = await clients.admin!
    .from("website_tracking_settings")
    .select("provider,enabled,pixel_id,consent_version")
    .eq("provider", "meta_pixel")
    .single();
  if (trackingResult.error || !trackingResult.data) {
    throw new Error("staging prerequisite missing: meta_pixel tracking settings row");
  }
  trackingSetting = trackingResult.data as typeof trackingSetting;

  // Remove only the allowed reserved paths so an interrupted prior run cannot
  // make the positive insert case depend on stale Storage state.
  await clients.website_editor!.storage.from("website-media").remove([MEDIA_PATH]);
  await clients.admin!.storage.from("panel-claim-docs").remove([PRIVATE_MEDIA_PATH]);
});

afterAll(async () => {
  await clients.website_editor?.storage
    .from("website-media")
    .remove([MEDIA_PATH, INVALID_MEDIA_PATH]);
  await clients.admin?.storage.from("panel-claim-docs").remove([PRIVATE_MEDIA_PATH]);
});

const operations: Record<Operation, (client: SupabaseClient) => Promise<boolean>> = {
  "website_pages.selectPublished": async (client) => {
    const { data, error } = await client
      .from("website_pages")
      .select("id,status")
      .eq("status", "published")
      .order("id", { ascending: true });
    return (
      error === null &&
      Array.isArray(data) &&
      data.every((row) => row.status === "published")
    );
  },
  "website_page_drafts.select": async (client) => {
    const { data, error } = await client
      .from("website_page_drafts")
      .select("page_id")
      .eq("page_id", ABSENT_PAGE_ID);
    return error === null && exactRow(data, "page_id", ABSENT_PAGE_ID);
  },
  "website_page_drafts.upsert": async (client) => {
    const { data, error } = await client
      .from("website_page_drafts")
      .upsert(
        {
          page_id: ABSENT_PAGE_ID,
          draft_content: { matrix: "website-cms" },
          base_revision: 0,
        },
        { onConflict: "page_id" }
      )
      .select("page_id");
    // The reserved parent page is verified absent in beforeAll. Reaching its
    // exact FK failure proves INSERT/UPDATE grants, RLS, and the actor trigger
    // admitted the request, while guaranteeing that no draft row is written.
    return (
      (error === null && exactRow(data, "page_id", ABSENT_PAGE_ID)) ||
      error?.code === "23503"
    );
  },
  "clinic_reviews.select": async (client) => {
    const { data, error } = await client
      .from("clinic_reviews")
      .select("id")
      .neq("status", "active")
      .order("id", { ascending: true })
      .limit(1);
    return error === null && Array.isArray(data) && data.length > 0;
  },
  "patients.update": async (client) => {
    const { data, error } = await client
      .from("patients")
      .update({ name: "RLS Fixture Patient A" })
      .eq("id", FIXTURE_PATIENT_ID)
      .select("id");
    return error === null && exactRow(data, "id", FIXTURE_PATIENT_ID);
  },
  "private_documents.insert": (client) =>
    upload(client, "panel-claim-docs", PRIVATE_MEDIA_PATH),
  "website-media.insert": (client) => upload(client, "website-media", MEDIA_PATH),
  "website-media.list": async (client) => {
    const { data, error } = await client.storage.from("website-media").list("pages", {
      limit: 10,
      offset: 0,
      search: mediaBase,
      sortBy: { column: "name", order: "asc" },
    });
    return (
      error === null &&
      Array.isArray(data) &&
      data.length === 1 &&
      data[0]?.name === mediaBase
    );
  },
  "website_tracking_settings.update": async (client) => {
    const { data, error } = await client
      .from("website_tracking_settings")
      .update({
        enabled: trackingSetting.enabled,
        pixel_id: trackingSetting.pixel_id,
        consent_version: trackingSetting.consent_version,
      })
      .eq("provider", trackingSetting.provider)
      .select("provider");
    return error === null && exactRow(data, "provider", trackingSetting.provider);
  },
  "website-media.select": async (client) => {
    const { data, error } = await client.storage.from("website-media").list("pages", {
      limit: 10,
      offset: 0,
      search: mediaBase,
      sortBy: { column: "name", order: "asc" },
    });
    return (
      error === null &&
      Array.isArray(data) &&
      data.length === 1 &&
      data[0]?.name === mediaBase
    );
  },
  "website-media.update": async (client) => {
    const { error } = await client.storage
      .from("website-media")
      .update(MEDIA_PATH, MEDIA_BYTES, { contentType: "image/webp", upsert: true });
    return error === null;
  },
  "website-media.delete": async (client) => {
    const { data, error } = await client.storage.from("website-media").remove([MEDIA_PATH]);
    return (
      error === null &&
      Array.isArray(data) &&
      data.length === 1 &&
      data[0]?.name === MEDIA_PATH
    );
  },
  "website-media.insertInvalidFolder": (client) =>
    upload(client, "website-media", INVALID_MEDIA_PATH),
  "website-media.moveInvalidFolder": async (client) => {
    const { error } = await client.storage
      .from("website-media")
      .move(MEDIA_PATH, INVALID_MEDIA_PATH);
    return error === null;
  },
};

for (const [description, actor, operation, expected] of [
  ...cases,
  ...supplementalCases,
]) {
  test(`[${actor}] ${description}`, async () => {
    const actual = await operations[operation](clients[actor]!);
    expect(actual).toBe(expected);
  });
}
