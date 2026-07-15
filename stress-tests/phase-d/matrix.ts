/**
 * Deterministic RLS/role abuse matrix. Every entry uses reserved fixture IDs
 * and expects an exact denial signature (error code and/or message substring).
 * No arrayContaining, no bare regex on user-supplied strings.
 */
export type AbuseExpect = {
  /** Postgres SQLSTATE or PostgREST error code expected. */
  code?: string;
  /** Case-insensitive substring that MUST appear in the error message. */
  messageIncludes?: string;
  /** If set, the query must return an empty rowset with no error. */
  emptyOk?: boolean;
};

export type AbuseCase = {
  actor:
    | "guest" | "locum" | "resident" | "staff"
    | "ops" | "ops_staff" | "doctor_admin" | "admin" | "special_admin";
  action: string;
  call: (api: any) => Promise<any>;
  expect: AbuseExpect;
};

// Reserved fixture IDs — kept in sync with seed-rls-matrix.sql.
export const FIXTURE_IDS = {
  patient: {
    resident: "babebbbb-0000-4000-8000-000000000002",
  },
  payment: {
    residentActive: "fee00002-0000-4000-8000-000000000002",
  },
  claim: {
    only: "c1a10001-0000-4000-8000-000000000001",
  },
};

export const MATRIX: AbuseCase[] = [
  // Privilege escalation via RPC.
  {
    actor: "staff",
    action: "admin_assign_role (self → special_admin) must be denied",
    call: (api) =>
      api.rpc("admin_assign_role", {
        target_user_id: api.uid, new_role: "special_admin",
      }),
    expect: { code: "42501", messageIncludes: "NOT_AUTHORIZED" },
  },
  // Mutation abuse: ops cannot insert consultations for arbitrary patients.
  {
    actor: "ops",
    action: "insert consultation for arbitrary patient must be blocked",
    call: (api) =>
      api.from("consultations").insert({
        patient_id: FIXTURE_IDS.patient.resident,
      }),
    expect: { messageIncludes: "row-level security" },
  },
  // Locum cannot read another clinician's payment.
  {
    actor: "locum",
    action: "select resident payment by exact id must return empty",
    call: (api) =>
      api.from("payments").select("id").eq("id", FIXTURE_IDS.payment.residentActive),
    expect: { emptyOk: true },
  },
  // Privilege escalation via direct user_roles UPDATE.
  {
    actor: "staff",
    action: "self-promote via user_roles UPDATE must be denied",
    call: (api) =>
      api.from("user_roles").update({ role: "special_admin" }).eq("user_id", api.uid),
    expect: { messageIncludes: "row-level security" },
  },
  // Locum cannot read any panel_claims fixture row.
  {
    actor: "locum",
    action: "select panel_claim fixture id must return empty",
    call: (api) =>
      api.from("panel_claims").select("id").eq("id", FIXTURE_IDS.claim.only),
    expect: { emptyOk: true },
  },
  // Guest role cannot read appointment_submission_log.
  {
    actor: "guest",
    action: "select appointment_submission_log must return empty or denied",
    call: (api) => api.from("appointment_submission_log").select("id").limit(1),
    expect: { emptyOk: true },
  },
];
