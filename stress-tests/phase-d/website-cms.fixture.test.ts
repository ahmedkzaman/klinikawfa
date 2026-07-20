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
  ["website editor reads own punch record", "website_editor", "attendance_records.select", false],
  ["website editor inserts own punch record", "website_editor", "attendance_records.insert", false],
  ["website editor updates own punch record", "website_editor", "attendance_records.update", false],
  ["website editor deletes own punch record", "website_editor", "attendance_records.delete", false],
  ["website editor reads own staff daily report", "website_editor", "daily_reports.select", false],
  ["website editor inserts own staff daily report", "website_editor", "daily_reports.insert", false],
  ["website editor updates own staff daily report", "website_editor", "daily_reports.update", false],
  ["website editor deletes own staff daily report", "website_editor", "daily_reports.delete", false],
  ["website editor reads private daily-report file", "website_editor", "daily-reports.select", false],
  ["website editor uploads private daily-report file", "website_editor", "daily-reports.insert", false],
  ["website editor updates private daily-report file", "website_editor", "daily-reports.update", false],
  ["website editor deletes private daily-report file", "website_editor", "daily-reports.delete", false],
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
const ATTENDANCE_ROW_ID = "cafe5005-0000-4000-8000-000000000006";
const DAILY_REPORT_ROW_ID = "cafe5005-0000-4000-8000-000000000007";
const ATTENDANCE_INSERT_ID = "cafe5005-0000-4000-8000-000000000008";
const DAILY_REPORT_INSERT_ID = "cafe5005-0000-4000-8000-000000000009";
const FIXTURE_PATIENT_ID = "babeaaaa-0000-4000-8000-000000000001";
const mediaBase = `rls-matrix-${credentials.website_editor.uid}.webp`;
const MEDIA_PATH = `pages/${mediaBase}`;
const PRIVATE_MEDIA_PATH = `rls-matrix/${mediaBase}`;
const MEDIA_BYTES = new Uint8Array([0x52, 0x49, 0x46, 0x46]);
const DAILY_REPORT_MEDIA_PATH = `${credentials.staff.uid}/rls-matrix-daily-report.webp`;
const DENIED_DAILY_REPORT_MEDIA_PATH = `${credentials.website_editor.uid}/rls-matrix-daily-report.webp`;
const DAILY_REPORT_MEDIA_BYTES = new Uint8Array([0x44, 0x41, 0x49, 0x4c, 0x59]);
const MUTATED_DAILY_REPORT_MEDIA_BYTES = new Uint8Array([0x44, 0x45, 0x4e, 0x49, 0x45, 0x44]);
const PRIVILEGED_STORAGE_TARGETS = [
  { bucket: "website-media", path: MEDIA_PATH },
  { bucket: "panel-claim-docs", path: PRIVATE_MEDIA_PATH },
  { bucket: "daily-reports", path: DAILY_REPORT_MEDIA_PATH },
  { bucket: "daily-reports", path: DENIED_DAILY_REPORT_MEDIA_PATH },
] as const;
type PrivilegedStorageTarget = (typeof PRIVILEGED_STORAGE_TARGETS)[number];
const WEBSITE_MEDIA_TARGET = PRIVILEGED_STORAGE_TARGETS[0];
const PRIVATE_MEDIA_TARGET = PRIVILEGED_STORAGE_TARGETS[1];
const DAILY_REPORT_MEDIA_TARGET = PRIVILEGED_STORAGE_TARGETS[2];
const DENIED_DAILY_REPORT_MEDIA_TARGET = PRIVILEGED_STORAGE_TARGETS[3];

let privilegedStorageClient: SupabaseClient | undefined;

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

function requirePrivilegedStorageClient(): SupabaseClient {
  if (!privilegedStorageClient) {
    throw new Error("privileged Storage cleanup client is not initialized");
  }
  return privilegedStorageClient;
}

async function privilegedStorageSnapshot(
  target: PrivilegedStorageTarget
): Promise<string> {
  const client = requirePrivilegedStorageClient();
  const matches = await matchingStorageRows(client, target.bucket, target.path);
  if (matches.length === 0) return JSON.stringify({ exists: false });
  if (matches.length !== 1) {
    throw new Error("reserved Storage path matched more than one object");
  }

  const { data, error } = await client.storage
    .from(target.bucket)
    .download(target.path);
  if (error || !data) throw new Error("privileged Storage snapshot download failed");
  return JSON.stringify({
    exists: true,
    bytes: Array.from(new Uint8Array(await data.arrayBuffer())),
  });
}

async function cleanupPrivilegedStorageTarget(
  target: PrivilegedStorageTarget
): Promise<void> {
  const before = await privilegedStorageSnapshot(target);
  if (before === JSON.stringify({ exists: false })) return;

  const { error } = await requirePrivilegedStorageClient()
    .storage.from(target.bucket)
    .remove([target.path]);
  if (error) throw new Error("privileged reserved Storage cleanup request failed");
  if ((await privilegedStorageSnapshot(target)) !== JSON.stringify({ exists: false })) {
    throw new Error("privileged reserved Storage cleanup did not remove the object");
  }
}

async function resetPrivilegedStorageTarget(
  target: PrivilegedStorageTarget
): Promise<void> {
  await cleanupPrivilegedStorageTarget(target);
  if ((await privilegedStorageSnapshot(target)) !== JSON.stringify({ exists: false })) {
    throw new Error("privileged reserved Storage preflight reset failed");
  }
}

async function restorePrivilegedStorageSnapshot(
  target: PrivilegedStorageTarget,
  before: string
): Promise<void> {
  const parsed = JSON.parse(before) as { exists: boolean; bytes?: number[] };
  if (!parsed.exists) {
    await cleanupPrivilegedStorageTarget(target);
  } else {
    if (!parsed.bytes) {
      throw new Error("privileged Storage restoration snapshot has no bytes");
    }
    const client = requirePrivilegedStorageClient();
    const exists =
      (await matchingStorageRows(client, target.bucket, target.path)).length === 1;
    const bucket = client.storage.from(target.bucket);
    const bytes = new Uint8Array(parsed.bytes);
    const result = exists
      ? await bucket.update(target.path, bytes, {
          contentType: "image/webp",
          upsert: true,
        })
      : await bucket.upload(target.path, bytes, {
          contentType: "image/webp",
          upsert: false,
        });
    if (result.error) throw new Error("privileged Storage restoration failed");
  }

  if ((await privilegedStorageSnapshot(target)) !== before) {
    throw new Error("privileged Storage restoration verification failed");
  }
}

async function attemptAndVerifyDeniedMutation(
  snapshot: () => Promise<string>,
  attempt: () => PromiseLike<unknown>,
  restore: (before: string) => Promise<void>
): Promise<boolean> {
  const before = await snapshot();
  try {
    await attempt();
  } catch {
    // A thrown client error is an acceptable denial; the privileged post-read
    // below remains the source of truth for whether anything changed.
  }
  const after = await snapshot();
  if (after === before) return false;

  await restore(before);
  if ((await snapshot()) !== before) {
    throw new Error("denied mutation changed state and restoration failed");
  }
  return true;
}

async function rowSnapshot(
  client: SupabaseClient,
  table: string,
  columns: string,
  key: string,
  value: string
): Promise<string> {
  const { data, error } = await client.from(table).select(columns).eq(key, value);
  if (error) throw new Error(`privileged ${table} snapshot failed`);
  return JSON.stringify(data ?? []);
}

async function restoreAttendanceFixture(): Promise<void> {
  const deleted = await clients.admin!
    .from("attendance_records")
    .delete()
    .eq("id", ATTENDANCE_ROW_ID);
  if (deleted.error) throw new Error("attendance fixture reset delete failed");

  const inserted = await clients.admin!.from("attendance_records").insert({
    id: ATTENDANCE_ROW_ID,
    user_id: credentials.website_editor.uid,
    punch_type: "in",
    punch_time: "2099-12-30T01:00:00.000Z",
    face_verified: false,
    logical_work_date: "2099-12-30",
    shift_key: null,
    admin_note: "RLS matrix Website Editor attendance denial",
    recorded_by: credentials.admin.uid,
  });
  if (inserted.error) throw new Error("attendance fixture reset insert failed");
}

async function restoreDailyReportFixture(): Promise<void> {
  const deleted = await clients.admin!
    .from("daily_reports")
    .delete()
    .eq("id", DAILY_REPORT_ROW_ID);
  if (deleted.error) throw new Error("daily report fixture reset delete failed");

  const inserted = await clients.admin!.from("daily_reports").insert({
    id: DAILY_REPORT_ROW_ID,
    user_id: credentials.website_editor.uid,
    report_date: "2099-12-30",
    whatsapp_blast_count: 7,
  });
  if (inserted.error) throw new Error("daily report fixture reset insert failed");
}

async function verifyActiveReviewFixture(): Promise<void> {
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
    data.status !== "active"
  ) {
    throw new Error("active clinic review fixture is missing or changed");
  }
}

beforeAll(async () => {
  privilegedStorageClient = createClient(URL, requiredEnv("STAGING_SERVICE_ROLE_KEY"), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  for (const target of PRIVILEGED_STORAGE_TARGETS) {
    await resetPrivilegedStorageTarget(target);
  }

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

  await verifyActiveReviewFixture();

  const attendanceFixture = JSON.parse(
    await rowSnapshot(
      clients.admin!,
      "attendance_records",
      "id,user_id,punch_type,admin_note",
      "id",
      ATTENDANCE_ROW_ID
    )
  ) as unknown;
  if (!exactRow(attendanceFixture, "id", ATTENDANCE_ROW_ID)) {
    throw new Error("Website Editor attendance denial fixture is missing");
  }

  const dailyReportFixture = JSON.parse(
    await rowSnapshot(
      clients.admin!,
      "daily_reports",
      "id,user_id,report_date,whatsapp_blast_count",
      "id",
      DAILY_REPORT_ROW_ID
    )
  ) as unknown;
  if (!exactRow(dailyReportFixture, "id", DAILY_REPORT_ROW_ID)) {
    throw new Error("Website Editor daily report denial fixture is missing");
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

  if (!(await upload(clients.staff!, "daily-reports", DAILY_REPORT_MEDIA_PATH))) {
    throw new Error("daily-report Storage fixture upload failed");
  }
  const expectedStorageSnapshot = JSON.stringify({
    exists: true,
    bytes: Array.from(DAILY_REPORT_MEDIA_BYTES),
  });
  if (
    (await privilegedStorageSnapshot(DAILY_REPORT_MEDIA_TARGET)) !==
    expectedStorageSnapshot
  ) {
    throw new Error("daily-report Storage fixture is missing or changed");
  }
});

afterAll(async () => {
  const failures: string[] = [];
  for (const target of PRIVILEGED_STORAGE_TARGETS) {
    try {
      await cleanupPrivilegedStorageTarget(target);
    } catch {
      failures.push(`${target.bucket}/${target.path}`);
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
      return attemptAndVerifyDeniedMutation(
        () =>
          rowSnapshot(
            clients.website_editor!,
            "website_page_drafts",
            "page_id,draft_content,base_revision",
            "page_id",
            STAFF_INSERT_PAGE_ID
          ),
        () =>
          client.from("website_page_drafts").upsert(
            {
              page_id: STAFF_INSERT_PAGE_ID,
              draft_content: { matrix: "staff-insert-denial" },
              base_revision: 0,
            },
            { onConflict: "page_id" }
          ),
        async () => {
          const { error } = await clients.website_editor!
            .from("website_page_drafts")
            .delete()
            .eq("page_id", STAFF_INSERT_PAGE_ID);
          if (error) throw new Error("unexpected staff draft cleanup failed");
        }
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
    return attemptAndVerifyDeniedMutation(
      () =>
        rowSnapshot(
          clients.admin!,
          "patients",
          "id,name",
          "id",
          FIXTURE_PATIENT_ID
        ),
      () =>
        client
          .from("patients")
          .update({ name: "RLS Fixture Patient A unauthorized mutation" })
          .eq("id", FIXTURE_PATIENT_ID),
      async (before) => {
        const rows = JSON.parse(before) as Array<{ name: string }>;
        const { error } = await clients.admin!
          .from("patients")
          .update({ name: rows[0]!.name })
          .eq("id", FIXTURE_PATIENT_ID);
        if (error) throw new Error("unexpected patient mutation restoration failed");
      }
    );
  },
  "private_documents.insert": async (client) =>
    attemptAndVerifyDeniedMutation(
      () => privilegedStorageSnapshot(PRIVATE_MEDIA_TARGET),
      () =>
        client.storage
          .from("panel-claim-docs")
          .upload(PRIVATE_MEDIA_PATH, MEDIA_BYTES, {
            contentType: "image/webp",
            upsert: false,
          }),
      async (before) =>
        restorePrivilegedStorageSnapshot(PRIVATE_MEDIA_TARGET, before)
    ),
  "website-media.insert": (client) => upload(client, "website-media", MEDIA_PATH),
  "website-media.list": async (client) =>
    (await matchingStorageRows(client, "website-media", MEDIA_PATH)).length === 1,
  "website_tracking_settings.update": async (client, actor) => {
    if (actor === "staff") {
      return attemptAndVerifyDeniedMutation(
        () =>
          rowSnapshot(
            clients.admin!,
            "website_tracking_settings",
            "provider,enabled,pixel_id,consent_version",
            "provider",
            trackingSetting.provider
          ),
        () =>
          client
            .from("website_tracking_settings")
            .update({ consent_version: trackingSetting.consent_version + 1000 })
            .eq("provider", trackingSetting.provider),
        async (before) => {
          const rows = JSON.parse(before) as Array<typeof trackingSetting>;
          const { error } = await clients.admin!
            .from("website_tracking_settings")
            .update({
              enabled: rows[0]!.enabled,
              pixel_id: rows[0]!.pixel_id,
              consent_version: rows[0]!.consent_version,
            })
            .eq("provider", rows[0]!.provider);
          if (error) throw new Error("unexpected tracking mutation restoration failed");
        }
      );
    }
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
  "attendance_records.select": async (client) => {
    const { data, error } = await client
      .from("attendance_records")
      .select("id")
      .eq("id", ATTENDANCE_ROW_ID);
    return error === null && exactRow(data, "id", ATTENDANCE_ROW_ID);
  },
  "attendance_records.insert": async (client) =>
    attemptAndVerifyDeniedMutation(
      () =>
        rowSnapshot(
          clients.admin!,
          "attendance_records",
          "id,user_id,punch_type,admin_note",
          "id",
          ATTENDANCE_INSERT_ID
        ),
      () =>
        client.from("attendance_records").insert({
          id: ATTENDANCE_INSERT_ID,
          user_id: credentials.website_editor.uid,
          punch_type: "in",
          punch_time: "2099-12-31T01:00:00.000Z",
          face_verified: false,
          logical_work_date: "2099-12-31",
          admin_note: "unauthorized Website Editor attendance insert",
        }),
      async () => {
        const { error } = await clients.admin!
          .from("attendance_records")
          .delete()
          .eq("id", ATTENDANCE_INSERT_ID);
        if (error) throw new Error("unexpected attendance insert cleanup failed");
      }
    ),
  "attendance_records.update": async (client) =>
    attemptAndVerifyDeniedMutation(
      () =>
        rowSnapshot(
          clients.admin!,
          "attendance_records",
          "id,user_id,punch_type,admin_note",
          "id",
          ATTENDANCE_ROW_ID
        ),
      () =>
        client
          .from("attendance_records")
          .update({ admin_note: "unauthorized Website Editor attendance update" })
          .eq("id", ATTENDANCE_ROW_ID),
      async () => restoreAttendanceFixture()
    ),
  "attendance_records.delete": async (client) =>
    attemptAndVerifyDeniedMutation(
      () =>
        rowSnapshot(
          clients.admin!,
          "attendance_records",
          "id,user_id,punch_type,admin_note",
          "id",
          ATTENDANCE_ROW_ID
        ),
      () => client.from("attendance_records").delete().eq("id", ATTENDANCE_ROW_ID),
      async () => restoreAttendanceFixture()
    ),
  "daily_reports.select": async (client) => {
    const { data, error } = await client
      .from("daily_reports")
      .select("id")
      .eq("id", DAILY_REPORT_ROW_ID);
    return error === null && exactRow(data, "id", DAILY_REPORT_ROW_ID);
  },
  "daily_reports.insert": async (client) =>
    attemptAndVerifyDeniedMutation(
      () =>
        rowSnapshot(
          clients.admin!,
          "daily_reports",
          "id,user_id,report_date,whatsapp_blast_count",
          "id",
          DAILY_REPORT_INSERT_ID
        ),
      () =>
        client.from("daily_reports").insert({
          id: DAILY_REPORT_INSERT_ID,
          user_id: credentials.website_editor.uid,
          report_date: "2099-12-31",
          whatsapp_blast_count: 999,
        }),
      async () => {
        const { error } = await clients.admin!
          .from("daily_reports")
          .delete()
          .eq("id", DAILY_REPORT_INSERT_ID);
        if (error) throw new Error("unexpected daily report insert cleanup failed");
      }
    ),
  "daily_reports.update": async (client) =>
    attemptAndVerifyDeniedMutation(
      () =>
        rowSnapshot(
          clients.admin!,
          "daily_reports",
          "id,user_id,report_date,whatsapp_blast_count",
          "id",
          DAILY_REPORT_ROW_ID
        ),
      () =>
        client
          .from("daily_reports")
          .update({ whatsapp_blast_count: 999 })
          .eq("id", DAILY_REPORT_ROW_ID),
      async () => restoreDailyReportFixture()
    ),
  "daily_reports.delete": async (client) =>
    attemptAndVerifyDeniedMutation(
      () =>
        rowSnapshot(
          clients.admin!,
          "daily_reports",
          "id,user_id,report_date,whatsapp_blast_count",
          "id",
          DAILY_REPORT_ROW_ID
        ),
      () => client.from("daily_reports").delete().eq("id", DAILY_REPORT_ROW_ID),
      async () => restoreDailyReportFixture()
    ),
  "daily-reports.select": async (client) => {
    try {
      return (
        await matchingStorageRows(client, "daily-reports", DAILY_REPORT_MEDIA_PATH)
      ).length === 1;
    } catch {
      return false;
    }
  },
  "daily-reports.insert": async (client) =>
    attemptAndVerifyDeniedMutation(
      () => privilegedStorageSnapshot(DENIED_DAILY_REPORT_MEDIA_TARGET),
      () =>
        client.storage
          .from("daily-reports")
          .upload(DENIED_DAILY_REPORT_MEDIA_PATH, DAILY_REPORT_MEDIA_BYTES, {
            contentType: "image/webp",
            upsert: false,
          }),
      async (before) =>
        restorePrivilegedStorageSnapshot(DENIED_DAILY_REPORT_MEDIA_TARGET, before)
    ),
  "daily-reports.update": async (client) =>
    attemptAndVerifyDeniedMutation(
      () => privilegedStorageSnapshot(DAILY_REPORT_MEDIA_TARGET),
      () =>
        client.storage
          .from("daily-reports")
          .update(DAILY_REPORT_MEDIA_PATH, MUTATED_DAILY_REPORT_MEDIA_BYTES, {
            contentType: "image/webp",
            upsert: true,
          }),
      async (before) =>
        restorePrivilegedStorageSnapshot(DAILY_REPORT_MEDIA_TARGET, before)
    ),
  "daily-reports.delete": async (client) =>
    attemptAndVerifyDeniedMutation(
      () => privilegedStorageSnapshot(DAILY_REPORT_MEDIA_TARGET),
      () => client.storage.from("daily-reports").remove([DAILY_REPORT_MEDIA_PATH]),
      async (before) =>
        restorePrivilegedStorageSnapshot(DAILY_REPORT_MEDIA_TARGET, before)
    ),
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
    const after = await privilegedStorageSnapshot(WEBSITE_MEDIA_TARGET);
    return (
      error === null &&
      Array.isArray(data) &&
      data.length === 1 &&
      data[0]?.name === MEDIA_PATH &&
      after === JSON.stringify({ exists: false })
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
