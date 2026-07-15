/**
 * Privilege-escalation and mutation-abuse tests (v7). Uses reserved fixture
 * IDs, schema-valid mutation payloads, and post-call verify steps to defeat
 * silent zero-row updates.
 *
 * Fails at import unless RLS_MATRIX_RUNNER=1.
 */
import { test, expect } from "bun:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { MATRIX, type AbuseCase } from "./matrix";

if (process.env.RLS_MATRIX_RUNNER !== "1") {
  throw new Error(
    "v7 rls.test.ts must only be executed through scripts/v7/run-rls-matrix.sh"
  );
}

const URL_ = process.env.STAGING_API_URL!;
const ANON = process.env.STAGING_ANON_KEY!;

type Actor = AbuseCase["actor"];

const CRED: Record<Actor, { uid: string; email: string; pw: string }> = {
  guest:         { uid: process.env.RLS_GUEST_UID!,         email: process.env.RLS_GUEST_EMAIL!,         pw: process.env.RLS_GUEST_PASSWORD! },
  locum:         { uid: process.env.RLS_LOCUM_UID!,         email: process.env.RLS_LOCUM_EMAIL!,         pw: process.env.RLS_LOCUM_PASSWORD! },
  resident:      { uid: process.env.RLS_RESIDENT_UID!,      email: process.env.RLS_RESIDENT_EMAIL!,      pw: process.env.RLS_RESIDENT_PASSWORD! },
  staff:         { uid: process.env.RLS_STAFF_UID!,         email: process.env.RLS_STAFF_EMAIL!,         pw: process.env.RLS_STAFF_PASSWORD! },
  ops:           { uid: process.env.RLS_OPS_UID!,           email: process.env.RLS_OPS_EMAIL!,           pw: process.env.RLS_OPS_PASSWORD! },
  ops_staff:     { uid: process.env.RLS_OPS_STAFF_UID!,     email: process.env.RLS_OPS_STAFF_EMAIL!,     pw: process.env.RLS_OPS_STAFF_PASSWORD! },
  doctor_admin:  { uid: process.env.RLS_DOCTOR_ADMIN_UID!,  email: process.env.RLS_DOCTOR_ADMIN_EMAIL!,  pw: process.env.RLS_DOCTOR_ADMIN_PASSWORD! },
  admin:         { uid: process.env.RLS_ADMIN_UID!,         email: process.env.RLS_ADMIN_EMAIL!,         pw: process.env.RLS_ADMIN_PASSWORD! },
  special_admin: { uid: process.env.RLS_SPECIAL_ADMIN_UID!, email: process.env.RLS_SPECIAL_ADMIN_EMAIL!, pw: process.env.RLS_SPECIAL_ADMIN_PASSWORD! },
};

async function clientFor(actor: Actor): Promise<SupabaseClient & { uid: string }> {
  const sb = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({
    email: CRED[actor].email, password: CRED[actor].pw,
  });
  if (error || !data.user) throw new Error(`sign-in failed for ${actor}`);
  if (data.user.id !== CRED[actor].uid) {
    throw new Error(`signed-in user id does not match RLS_${actor.toUpperCase()}_UID`);
  }
  return Object.assign(sb, { uid: data.user.id }) as SupabaseClient & { uid: string };
}

for (const c of MATRIX) {
  test(`[${c.actor}] ${c.action}`, async () => {
    const api = await clientFor(c.actor);
    const res: any = await c.call(api).catch((e: any) => ({ error: e }));

    if (c.expect.emptyOk) {
      expect(res.error).toBeNull();
      expect(Array.isArray(res.data) ? res.data.length : 0).toBe(0);
    } else {
      const err = res?.error;
      expect(err).not.toBeNull();
      if (c.expect.code) expect(err?.code).toBe(c.expect.code);
      if (c.expect.messageIncludes) {
        expect(String(err?.message ?? "").toLowerCase())
          .toContain(c.expect.messageIncludes.toLowerCase());
      }
    }

    // Verify step defeats silent zero-row UPDATE.
    if (c.expect.verify) {
      const v = c.expect.verify;
      const idValue = v.id === "__self__" ? api.uid : v.id;
      const idColumn = v.table === "user_roles" ? "user_id" : "id";
      const { data, error } = await api.from(v.table).select(v.column).eq(idColumn, idValue);
      expect(error).toBeNull();
      expect(Array.isArray(data) && data.length > 0).toBe(true);
      for (const row of data as Array<Record<string, unknown>>) {
        expect(row[v.column]).toBe(v.equals as never);
      }
    }

    // Absence check: probe with a role broad enough to read the row if it
    // exists (special_admin sees active + voided across all fixture tables).
    if (c.expect.assertAbsentRow) {
      const a = c.expect.assertAbsentRow;
      const probe = await clientFor("special_admin");
      const { data, error } = await probe.from(a.table).select("id").eq("id", a.id);
      expect(error).toBeNull();
      expect((data ?? []).length).toBe(0);
    }
  });
}
