/**
 * Deterministic Website CMS RLS and Storage matrix.
 *
 * Import is guarded by run-rls-matrix.sh. Seeded IDs and reserved Storage
 * paths make every allow/deny result non-empty or otherwise independently
 * proven, with exact booleans and no permissive subset assertions.
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

const PUBLISHED_PAGE_ID = "cafe5005-0000-4000-8000-000000000001";
const PRIVATE_DRAFT_PAGE_ID = "cafe5005-0000-4000-8000-000000000002";
const INSERT_DRAFT_PAGE_ID = "cafe5005-0000-4000-8000-000000000003";
const PRIVATE_REVIEW_ID = "cafe5005-0000-4000-8000-000000000004";
const STAFF_INSERT_PAGE_ID = "cafe5005-0000-4000-8000-000000000005";
const FIXTURE_PATIENT_ID = "babeaaaa-0000-4000-8000-000000000001";
const mediaBase = `rls-matrix-${credentials.website_editor.uid}.webp`;
const MEDIA_PATH = `pages/${mediaBase}`;
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

function exactDraft(
  data: unknown,
  pageId: string,
  matrixValue: string
): boolean {
  if (!exactRow(data, "page_id", pageId)) return false;
  const row = (data as Array<Record<string, unknown>>)[0];
  return (
    row.base_revision === 0 &&
    JSON.stringify(row.draft_content) === JSON.stringify({ matrix: matrixValue })
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

function pathParts(path: string): { folder: string; name: string } {
  const separator = path.lastIndexOf("/");
  return { folder: path.slice(0, separator), name: path.slice(separator + 1) };
}

async function matchingStorageRows(
  client: SupabaseClient,
  bucket: string,
  path: string
): Promise<Array<{ name: string }>> {
  const { folder, name } = pathParts(path);
  const { data, error } = await client.storage.from(bucket).list(folder, {
    limit: 10,
    offset: 0,
    search: name,
    sortBy: { column: "name", order: "asc" },
  });
  if (error) throw new Error("reserved Storage path listing failed");
  return (data ?? []).filter((row) => row.name === name);
}

async function assertStoragePathAbsent(
  client: SupabaseClient,
  bucket: string,
  path: string
): Promise<void> {
  if ((await matchingStorageRows(client, bucket, path)).length !== 0) {
    throw new Error("reserved Storage path is not empty");
  }
}

async function cleanupStoragePath(
  client: SupabaseClient,
  bucket: string,
  path: string
): Promise<void> {
  const { error } = await client.storage.from(bucket).remove([path]);
  if (error) throw new Error("reserved Storage cleanup request failed");
  if ((await matchingStorageRows(client, bucket, path)).length !== 0) {
    throw new Error("reserved Storage cleanup did not remove the object");
  }
}

async function verifyPrivateReviewFixture(): Promise<void> {
  const { data, error } = await clients.admin!
    .from("clinic_reviews")
    .select("id,patient_id,patient_name,rating,review_text,status")
    .eq("id", PRIVATE_REVIEW_ID)
    .single();
  if (
    error ||
    !data ||
    data.id !== PRIVATE_REVIEW_ID ||
    data.patient_id !== FIXTURE_PATIENT_ID ||
    data.patient_name !== "RLS Fixture Patient A" ||
    data.rating !== 5 ||
    data.review_text !== "RLS matrix private review" ||
    data.status !== "pending"
  ) {
    throw new Error("private clinic review fixture is missing or changed");
  }
}

beforeAll(async () => {
  clients.anon = createClient(URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  for (const actor of Object.keys(credentials) as CredentialActor[]) {
    clients[actor] = await signIn(actor);
  }

  const draftResult = await clients.website_editor!
    .from("website_page_drafts")
    .select("page_id,draft_content,base_revision")
    .eq("page_id", PRIVATE_DRAFT_PAGE_ID);
  if (
    draftResult.error ||
    !exactRow(draftResult.data, "page_id", PRIVATE_DRAFT_PAGE_ID) ||
    JSON.stringify(draftResult.data?.[0]?.draft_content) !==
      JSON.stringify({ title: "RLS matrix private draft" })
  ) {
    throw new Error("private page draft fixture is missing or changed");
  }

  const insertTarget = await clients.website_editor!
    .from("website_page_drafts")
    .select("page_id")
    .eq("page_id", INSERT_DRAFT_PAGE_ID);
  if (insertTarget.error || !Array.isArray(insertTarget.data) || insertTarget.data.length !== 0) {
    throw new Error("draft INSERT target already has a draft row");
  }

  const staffInsertTarget = await clients.website_editor!
    .from("website_page_drafts")
    .select("page_id")
    .eq("page_id", STAFF_INSERT_PAGE_ID);
  if (
    staffInsertTarget.error ||
    !Array.isArray(staffInsertTarget.data) ||
    staffInsertTarget.data.length !== 0
  ) {
    throw new Error("staff INSERT target already has a draft row");
  }

  await verifyPrivateReviewFixture();

  const trackingResult = await clients.admin!
    .from("website_tracking_settings")
    .select("provider,enabled,pixel_id,consent_version")
    .eq("provider", "meta_pixel")
    .single();
  if (trackingResult.error || !trackingResult.data) {
    throw new Error("staging prerequisite missing: meta_pixel tracking settings row");
  }
  trackingSetting = trackingResult.data as typeof trackingSetting;

  await assertStoragePathAbsent(clients.website_editor!, "website-media", MEDIA_PATH);
  await assertStoragePathAbsent(clients.admin!, "panel-claim-docs", PRIVATE_MEDIA_PATH);
});

afterAll(async () => {
  const failures: string[] = [];
  if (clients.website_editor) {
    try {
      await cleanupStoragePath(clients.website_editor, "website-media", MEDIA_PATH);
    } catch {
      failures.push("website-media");
    }
  }
  if (clients.admin) {
    try {
      await cleanupStoragePath(clients.admin, "panel-claim-docs", PRIVATE_MEDIA_PATH);
    } catch {
      failures.push("panel-claim-docs");
    }
  }
  if (failures.length !== 0) {
    throw new Error(`reserved Storage cleanup failed for ${failures.join(", ")}`);
  }
});

const operations: Record<
  Operation,
  (client: SupabaseClient, actor: Actor) => Promise<boolean>
> = {
  "website_pages.selectPublished": async (client) => {
    const { data, error } = await client
      .from("website_pages")
      .select("id,slug,published_content,status,revision")
      .eq("id", PUBLISHED_PAGE_ID);
    if (error || !exactRow(data, "id", PUBLISHED_PAGE_ID)) return false;
    const row = (data as Array<Record<string, unknown>>)[0];
    const content = row.published_content as Record<string, unknown> | null;
    return (
      Object.keys(row).sort().join(",") ===
        ["id", "published_content", "revision", "slug", "status"].sort().join(",") &&
      row.slug === "rls-matrix-published-page" &&
      row.status === "published" &&
      row.revision === 1 &&
      typeof content === "object" &&
      content !== null &&
      Object.keys(content).sort().join(",") === "body,title" &&
      content.title === "RLS matrix published" &&
      content.body === "Public fixture"
    );
  },
  "website_page_drafts.select": async (client) => {
    const { data, error } = await client
      .from("website_page_drafts")
      .select("page_id")
      .eq("page_id", PRIVATE_DRAFT_PAGE_ID);
    return error === null && exactRow(data, "page_id", PRIVATE_DRAFT_PAGE_ID);
  },
  "website_page_drafts.upsert": async (client, actor) => {
    if (actor === "staff") {
      const deniedInsert = await client
        .from("website_page_drafts")
        .upsert(
          {
            page_id: STAFF_INSERT_PAGE_ID,
            draft_content: { matrix: "staff-insert-denial" },
            base_revision: 0,
          },
          { onConflict: "page_id" }
        )
        .select("page_id,draft_content,base_revision");
      return (
        deniedInsert.error === null &&
        exactDraft(deniedInsert.data, STAFF_INSERT_PAGE_ID, "staff-insert-denial")
      );
    }
    if (actor !== "website_editor") return false;

    const inserted = await client
      .from("website_page_drafts")
      .upsert(
        {
          page_id: INSERT_DRAFT_PAGE_ID,
          draft_content: { matrix: "insert-path" },
          base_revision: 0,
        },
        { onConflict: "page_id" }
      )
      .select("page_id,draft_content,base_revision");
    if (inserted.error || !exactDraft(inserted.data, INSERT_DRAFT_PAGE_ID, "insert-path")) {
      return false;
    }

    const updated = await client
      .from("website_page_drafts")
      .upsert(
        {
          page_id: PRIVATE_DRAFT_PAGE_ID,
          draft_content: { matrix: "update-path" },
          base_revision: 0,
        },
        { onConflict: "page_id" }
      )
      .select("page_id,draft_content,base_revision");
    return (
      updated.error === null &&
      exactDraft(updated.data, PRIVATE_DRAFT_PAGE_ID, "update-path")
    );
  },
  "clinic_reviews.select": async (client) => {
    const { data, error } = await client
      .from("clinic_reviews")
      .select("id")
      .eq("id", PRIVATE_REVIEW_ID);
    return error === null && exactRow(data, "id", PRIVATE_REVIEW_ID);
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
  "website-media.list": async (client) =>
    (await matchingStorageRows(client, "website-media", MEDIA_PATH)).length === 1,
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
  "website-media.select": async (client) =>
    (await matchingStorageRows(client, "website-media", MEDIA_PATH)).length === 1,
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
      data[0]?.name === MEDIA_PATH &&
      (await matchingStorageRows(client, "website-media", MEDIA_PATH)).length === 0
    );
  },
};

for (const [description, actor, operation, expected] of [
  ...cases,
  ...supplementalCases,
]) {
  test(`[${actor}] ${description}`, async () => {
    const actual = await operations[operation](clients[actor]!, actor);
    expect(actual).toBe(expected);
  });
}
