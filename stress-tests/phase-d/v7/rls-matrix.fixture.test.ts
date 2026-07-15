/**
 * Deterministic per-role RLS matrix test (v7).
 *
 * Every role/table combination required by the review is covered. Every
 * assertion uses exact sorted fixture-id equality.
 *
 * Fails at import unless RLS_MATRIX_RUNNER=1.
 */
import { test, expect, beforeAll } from "bun:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

if (process.env.RLS_MATRIX_RUNNER !== "1") {
  throw new Error(
    "v7 rls-matrix.fixture.test.ts must only be executed through scripts/v7/run-rls-matrix.sh"
  );
}

const URL_ = process.env.STAGING_API_URL!;
const ANON = process.env.STAGING_ANON_KEY!;

const FIX = {
  appt: {
    locum:    "a99caaaa-0000-4000-8000-000000000001",
    resident: "a99cbbbb-0000-4000-8000-000000000002",
  },
  item: {
    locumActive:    "dead0001-0000-4000-8000-000000000001",
    residentActive: "dead0002-0000-4000-8000-000000000002",
    locumVoided:    "dead000f-0000-4000-8000-00000000000f",
  },
  pay: {
    locumActive:    "fee00001-0000-4000-8000-000000000001",
    residentActive: "fee00002-0000-4000-8000-000000000002",
    locumVoided:    "fee0000f-0000-4000-8000-00000000000f",
  },
  claim: { only: "c1a10001-0000-4000-8000-000000000001" },
};
const APPT_IDS  = [FIX.appt.locum, FIX.appt.resident];
const ITEM_IDS  = [FIX.item.locumActive, FIX.item.residentActive, FIX.item.locumVoided];
const PAY_IDS   = [FIX.pay.locumActive, FIX.pay.residentActive, FIX.pay.locumVoided];
const CLAIM_IDS = [FIX.claim.only];

type Role =
  | "locum" | "resident" | "staff" | "ops" | "ops_staff"
  | "doctor_admin" | "admin" | "special_admin" | "guest";

const CRED: Record<Role, { uid: string; email: string; pw: string }> = {
  locum:         { uid: process.env.RLS_LOCUM_UID!,         email: process.env.RLS_LOCUM_EMAIL!,         pw: process.env.RLS_LOCUM_PASSWORD! },
  resident:      { uid: process.env.RLS_RESIDENT_UID!,      email: process.env.RLS_RESIDENT_EMAIL!,      pw: process.env.RLS_RESIDENT_PASSWORD! },
  staff:         { uid: process.env.RLS_STAFF_UID!,         email: process.env.RLS_STAFF_EMAIL!,         pw: process.env.RLS_STAFF_PASSWORD! },
  ops:           { uid: process.env.RLS_OPS_UID!,           email: process.env.RLS_OPS_EMAIL!,           pw: process.env.RLS_OPS_PASSWORD! },
  ops_staff:     { uid: process.env.RLS_OPS_STAFF_UID!,     email: process.env.RLS_OPS_STAFF_EMAIL!,     pw: process.env.RLS_OPS_STAFF_PASSWORD! },
  doctor_admin:  { uid: process.env.RLS_DOCTOR_ADMIN_UID!,  email: process.env.RLS_DOCTOR_ADMIN_EMAIL!,  pw: process.env.RLS_DOCTOR_ADMIN_PASSWORD! },
  admin:         { uid: process.env.RLS_ADMIN_UID!,         email: process.env.RLS_ADMIN_EMAIL!,         pw: process.env.RLS_ADMIN_PASSWORD! },
  special_admin: { uid: process.env.RLS_SPECIAL_ADMIN_UID!, email: process.env.RLS_SPECIAL_ADMIN_EMAIL!, pw: process.env.RLS_SPECIAL_ADMIN_PASSWORD! },
  guest:         { uid: process.env.RLS_GUEST_UID!,         email: process.env.RLS_GUEST_EMAIL!,         pw: process.env.RLS_GUEST_PASSWORD! },
};

const clients: Partial<Record<Role | "anon", SupabaseClient>> = {};

async function signIn(role: Role): Promise<SupabaseClient> {
  const sb = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({
    email: CRED[role].email, password: CRED[role].pw,
  });
  if (error || !data.user) throw new Error(`sign-in failed for ${role}`);
  if (data.user.id !== CRED[role].uid) {
    throw new Error(`signed-in user id does not match RLS_${role.toUpperCase()}_UID`);
  }
  return sb;
}

beforeAll(async () => {
  clients.anon          = createClient(URL_, ANON, { auth: { persistSession: false } });
  clients.locum         = await signIn("locum");
  clients.resident      = await signIn("resident");
  clients.staff         = await signIn("staff");
  clients.ops           = await signIn("ops");
  clients.ops_staff     = await signIn("ops_staff");
  clients.doctor_admin  = await signIn("doctor_admin");
  clients.admin         = await signIn("admin");
  clients.special_admin = await signIn("special_admin");
  clients.guest         = await signIn("guest");
});

const sorted = (xs: string[]) => [...xs].sort();

async function selectIds(sb: SupabaseClient, table: string, scope: string[]): Promise<string[]> {
  const { data, error } = await sb.from(table).select("id").in("id", scope);
  expect(error).toBeNull();
  return sorted((data ?? []).map((r: { id: string }) => r.id));
}

// ---------------------------------------------------------------------------
// clinic_appointments — all nine actors + anon
// ---------------------------------------------------------------------------
test("[locum]         clinic_appointments → own only", async () => {
  expect(await selectIds(clients.locum!, "clinic_appointments", APPT_IDS))
    .toEqual(sorted([FIX.appt.locum]));
});
test("[resident]      clinic_appointments → all", async () => {
  expect(await selectIds(clients.resident!, "clinic_appointments", APPT_IDS))
    .toEqual(sorted(APPT_IDS));
});
test("[staff]         clinic_appointments → all", async () => {
  expect(await selectIds(clients.staff!, "clinic_appointments", APPT_IDS))
    .toEqual(sorted(APPT_IDS));
});
test("[ops]           clinic_appointments → all", async () => {
  expect(await selectIds(clients.ops!, "clinic_appointments", APPT_IDS))
    .toEqual(sorted(APPT_IDS));
});
test("[ops_staff]     clinic_appointments → all", async () => {
  expect(await selectIds(clients.ops_staff!, "clinic_appointments", APPT_IDS))
    .toEqual(sorted(APPT_IDS));
});
test("[doctor_admin]  clinic_appointments → all", async () => {
  expect(await selectIds(clients.doctor_admin!, "clinic_appointments", APPT_IDS))
    .toEqual(sorted(APPT_IDS));
});
test("[admin]         clinic_appointments → all", async () => {
  expect(await selectIds(clients.admin!, "clinic_appointments", APPT_IDS))
    .toEqual(sorted(APPT_IDS));
});
test("[special_admin] clinic_appointments → all", async () => {
  expect(await selectIds(clients.special_admin!, "clinic_appointments", APPT_IDS))
    .toEqual(sorted(APPT_IDS));
});
test("[guest]         clinic_appointments → none", async () => {
  expect(await selectIds(clients.guest!, "clinic_appointments", APPT_IDS)).toEqual([]);
});
test("[anon]          clinic_appointments → none", async () => {
  expect(await selectIds(clients.anon!, "clinic_appointments", APPT_IDS)).toEqual([]);
});

// ---------------------------------------------------------------------------
// consultation_items — all nine actors + anon
// ---------------------------------------------------------------------------
const CI_ACTIVE = [FIX.item.locumActive, FIX.item.residentActive];

test("[locum]         consultation_items → own active only", async () => {
  expect(await selectIds(clients.locum!, "consultation_items", ITEM_IDS))
    .toEqual(sorted([FIX.item.locumActive]));
});
test("[resident]      consultation_items → own active only", async () => {
  expect(await selectIds(clients.resident!, "consultation_items", ITEM_IDS))
    .toEqual(sorted([FIX.item.residentActive]));
});
test("[staff]         consultation_items → none (staff not in ops_or_admin)", async () => {
  expect(await selectIds(clients.staff!, "consultation_items", ITEM_IDS)).toEqual([]);
});
test("[ops]           consultation_items → all active", async () => {
  expect(await selectIds(clients.ops!, "consultation_items", ITEM_IDS))
    .toEqual(sorted(CI_ACTIVE));
});
test("[ops_staff]     consultation_items → all active", async () => {
  expect(await selectIds(clients.ops_staff!, "consultation_items", ITEM_IDS))
    .toEqual(sorted(CI_ACTIVE));
});
test("[doctor_admin]  consultation_items → all active", async () => {
  expect(await selectIds(clients.doctor_admin!, "consultation_items", ITEM_IDS))
    .toEqual(sorted(CI_ACTIVE));
});
test("[admin]         consultation_items → all active", async () => {
  expect(await selectIds(clients.admin!, "consultation_items", ITEM_IDS))
    .toEqual(sorted(CI_ACTIVE));
});
test("[special_admin] consultation_items → active + voided", async () => {
  expect(await selectIds(clients.special_admin!, "consultation_items", ITEM_IDS))
    .toEqual(sorted(ITEM_IDS));
});
test("[guest]         consultation_items → none", async () => {
  expect(await selectIds(clients.guest!, "consultation_items", ITEM_IDS)).toEqual([]);
});
test("[anon]          consultation_items → none", async () => {
  expect(await selectIds(clients.anon!, "consultation_items", ITEM_IDS)).toEqual([]);
});

// ---------------------------------------------------------------------------
// panel_claims — all nine actors + anon
// ---------------------------------------------------------------------------
test("[locum]         panel_claims → none", async () => {
  expect(await selectIds(clients.locum!, "panel_claims", CLAIM_IDS)).toEqual([]);
});
test("[resident]      panel_claims → none", async () => {
  expect(await selectIds(clients.resident!, "panel_claims", CLAIM_IDS)).toEqual([]);
});
test("[staff]         panel_claims → none (finance-admin only)", async () => {
  expect(await selectIds(clients.staff!, "panel_claims", CLAIM_IDS)).toEqual([]);
});
test("[ops]           panel_claims → all", async () => {
  expect(await selectIds(clients.ops!, "panel_claims", CLAIM_IDS)).toEqual(sorted(CLAIM_IDS));
});
test("[ops_staff]     panel_claims → all", async () => {
  expect(await selectIds(clients.ops_staff!, "panel_claims", CLAIM_IDS)).toEqual(sorted(CLAIM_IDS));
});
test("[doctor_admin]  panel_claims → all", async () => {
  expect(await selectIds(clients.doctor_admin!, "panel_claims", CLAIM_IDS)).toEqual(sorted(CLAIM_IDS));
});
test("[admin]         panel_claims → all", async () => {
  expect(await selectIds(clients.admin!, "panel_claims", CLAIM_IDS)).toEqual(sorted(CLAIM_IDS));
});
test("[special_admin] panel_claims → all", async () => {
  expect(await selectIds(clients.special_admin!, "panel_claims", CLAIM_IDS)).toEqual(sorted(CLAIM_IDS));
});
test("[guest]         panel_claims → none", async () => {
  expect(await selectIds(clients.guest!, "panel_claims", CLAIM_IDS)).toEqual([]);
});
test("[anon]          panel_claims → none", async () => {
  expect(await selectIds(clients.anon!, "panel_claims", CLAIM_IDS)).toEqual([]);
});

// ---------------------------------------------------------------------------
// payments — all nine actors + anon
// ---------------------------------------------------------------------------
const PAY_ACTIVE = [FIX.pay.locumActive, FIX.pay.residentActive];

test("[locum]         payments → own active only", async () => {
  expect(await selectIds(clients.locum!, "payments", PAY_IDS))
    .toEqual(sorted([FIX.pay.locumActive]));
});
test("[resident]      payments → own active only", async () => {
  expect(await selectIds(clients.resident!, "payments", PAY_IDS))
    .toEqual(sorted([FIX.pay.residentActive]));
});
test("[staff]         payments → all active", async () => {
  expect(await selectIds(clients.staff!, "payments", PAY_IDS))
    .toEqual(sorted(PAY_ACTIVE));
});
test("[ops]           payments → all active", async () => {
  expect(await selectIds(clients.ops!, "payments", PAY_IDS))
    .toEqual(sorted(PAY_ACTIVE));
});
test("[ops_staff]     payments → all active", async () => {
  expect(await selectIds(clients.ops_staff!, "payments", PAY_IDS))
    .toEqual(sorted(PAY_ACTIVE));
});
test("[doctor_admin]  payments → all active", async () => {
  expect(await selectIds(clients.doctor_admin!, "payments", PAY_IDS))
    .toEqual(sorted(PAY_ACTIVE));
});
test("[admin]         payments → all active", async () => {
  expect(await selectIds(clients.admin!, "payments", PAY_IDS))
    .toEqual(sorted(PAY_ACTIVE));
});
test("[special_admin] payments → active + voided", async () => {
  expect(await selectIds(clients.special_admin!, "payments", PAY_IDS))
    .toEqual(sorted(PAY_IDS));
});
test("[guest]         payments → none", async () => {
  expect(await selectIds(clients.guest!, "payments", PAY_IDS)).toEqual([]);
});
test("[anon]          payments → none", async () => {
  expect(await selectIds(clients.anon!, "payments", PAY_IDS)).toEqual([]);
});
