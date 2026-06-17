/**
 * Per-role RLS abuse test. Spins up an authed Supabase client per role
 * and asserts every entry in MATRIX returns the expected denial.
 *
 * Expects pre-seeded auth users in staging:
 *   staging+{role}@klinikawfa.test  / password: stress-test-{role}
 */
import { test, expect } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { MATRIX } from "./matrix";

const URL = process.env.STAGING_API_URL!;
const ANON = process.env.STAGING_ANON_KEY!;

async function clientFor(role: string) {
  const sb = createClient(URL, ANON);
  const { data, error } = await sb.auth.signInWithPassword({
    email: `staging+${role}@klinikawfa.test`,
    password: `stress-test-${role}`,
  });
  if (error || !data.user) throw new Error(`login failed for ${role}: ${error?.message}`);
  return { ...sb, uid: data.user.id, someOtherPatient: "00000000-0000-0000-0000-000000000001" } as any;
}

for (const c of MATRIX) {
  test(`[${c.actor}] ${c.action} → denied`, async () => {
    const api = c.actor === "guest"
      ? Object.assign(createClient(URL, ANON), { uid: null, someOtherPatient: "x" })
      : await clientFor(c.actor);
    const res: any = await c.call(api).catch((e: any) => ({ error: e }));
    const err = res?.error;
    const body = err ? `${err.code ?? ""} ${err.message ?? ""}` : JSON.stringify(res?.data ?? "");
    if (c.expect.code) expect(err?.code).toBe(c.expect.code);
    if (c.expect.match) expect(body).toMatch(c.expect.match);
  });
}
