/**
 * Deterministic RLS abuse matrix (v7). Every case uses reserved fixture IDs
 * and asserts an exact denial signature. Payloads are schema-valid so denials
 * prove RLS — not NOT NULL — is doing the blocking.
 */
export type AbuseExpect = {
  code?: string;
  messageIncludes?: string;
  emptyOk?: boolean;
  /**
   * If set, after the call the runner must re-query the row(s) and confirm
   * the state matches this predicate. Used for silent-zero-row-UPDATE cases
   * that would otherwise pass despite RLS filtering them out.
   */
  verify?: { table: string; id: string; column: string; equals: unknown };
};

export type AbuseCase = {
  actor:
    | "guest" | "locum" | "resident" | "staff"
    | "ops" | "ops_staff" | "doctor_admin" | "admin" | "special_admin";
  action: string;
  call: (api: any) => Promise<any>;
  expect: AbuseExpect;
};

// Reserved fixture IDs (kept in sync with v7 seed).
export const FIXTURE_IDS = {
  patient:      { resident: "babebbbb-0000-4000-8000-000000000002" },
  queueEntry:   { resident: "90e0bbbb-0000-4000-8000-000000000002" },
  payment:      { residentActive: "fee00002-0000-4000-8000-000000000002" },
  claim:        { only: "c1a10001-0000-4000-8000-000000000001" },
};

export const MATRIX: AbuseCase[] = [
  // 1. RPC privilege escalation.
  {
    actor: "staff",
    action: "admin_assign_role (self → special_admin) must be denied",
    call: (api) =>
      api.rpc("admin_assign_role", {
        target_user_id: api.uid, new_role: "special_admin",
      }),
    expect: { code: "42501", messageIncludes: "NOT_AUTHORIZED" },
  },

  // 2. Mutation abuse: ops cannot insert a schema-valid consultation.
  // Payload satisfies all NOT NULL columns so denial proves RLS.
  {
    actor: "ops",
    action: "insert schema-valid consultation must be blocked by RLS",
    call: (api) =>
      api.from("consultations").insert({
        queue_entry_id: FIXTURE_IDS.queueEntry.resident,
        patient_id:     FIXTURE_IDS.patient.resident,
      }),
    expect: { messageIncludes: "row-level security" },
  },

  // 3. Cross-clinician read: locum cannot see resident's payment.
  {
    actor: "locum",
    action: "select resident payment by exact id must return empty",
    call: (api) =>
      api.from("payments").select("id").eq("id", FIXTURE_IDS.payment.residentActive),
    expect: { emptyOk: true },
  },

  // 4. Direct user_roles escalation. Even if PostgREST/PG returns success
  // with zero rows affected (silent RLS filter), the follow-up verify step
  // reconfirms the role remains 'staff'.
  {
    actor: "staff",
    action: "self-promote via user_roles UPDATE must not change role",
    call: async (api) => {
      const res = await api.from("user_roles")
        .update({ role: "special_admin" })
        .eq("user_id", api.uid)
        .eq("role", "staff");
      return res; // may be { error: null, data: [] } — verify step catches it
    },
    expect: {
      emptyOk: true,
      verify: {
        table: "user_roles",
        id: "__self__",
        column: "role",
        equals: "staff",
      },
    },
  },

  // 5. Locum cannot read the panel_claim.
  {
    actor: "locum",
    action: "select panel_claim fixture id must return empty",
    call: (api) =>
      api.from("panel_claims").select("id").eq("id", FIXTURE_IDS.claim.only),
    expect: { emptyOk: true },
  },

  // 6. Guest cannot read appointment_submission_log. Deterministic: assert
  // emptyOk. If the table policy denies outright with an error instead, the
  // runner records that as a failure so the assertion must be revisited.
  {
    actor: "guest",
    action: "select appointment_submission_log must return empty (RLS filtered)",
    call: (api) => api.from("appointment_submission_log").select("id").limit(1),
    expect: { emptyOk: true },
  },
];
