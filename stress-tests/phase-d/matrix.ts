/**
 * RLS / role abuse matrix. Each entry describes a role acting on a resource
 * and the exact expected denial. The Phase D test asserts every row.
 */
export type AbuseCase = {
  actor: "guest" | "locum" | "operations" | "staff" | "doctor_admin" | "admin" | "special_admin";
  action: string;
  call: (api: any) => Promise<any>;
  expect: { status?: number; code?: string; match?: RegExp };
};

export const MATRIX: AbuseCase[] = [
  {
    actor: "staff",
    action: "admin_assign_role",
    call: (api) => api.rpc("admin_assign_role", { target_user_id: api.uid, new_role: "special_admin" }),
    expect: { code: "42501", match: /NOT_AUTHORIZED/ },
  },
  {
    actor: "operations",
    action: "insert consultation for arbitrary patient",
    call: (api) => api.from("consultations").insert({ patient_id: api.someOtherPatient }),
    expect: { match: /row-level security|permission/i },
  },
  {
    actor: "locum",
    action: "select payments outside own consultation",
    call: (api) => api.from("payments").select("*").limit(1),
    expect: { match: /row-level security|permission|empty/i },
  },
  {
    actor: "guest",
    action: "GET /rest/v1/patients",
    call: (api) => api.from("patients").select("*").limit(1),
    expect: { match: /row-level security|permission|empty/i },
  },
  {
    actor: "staff",
    action: "promote self to special_admin via user_roles UPDATE",
    call: (api) => api.from("user_roles").update({ role: "special_admin" }).eq("user_id", api.uid),
    expect: { match: /row-level security|permission/i },
  },
  {
    actor: "locum",
    action: "select panel_claims",
    call: (api) => api.from("panel_claims").select("*").limit(1),
    expect: { match: /row-level security|permission|empty/i },
  },
  {
    actor: "guest",
    action: "select appointment_submission_log",
    call: (api) => api.from("appointment_submission_log").select("*").limit(1),
    expect: { match: /row-level security|permission|empty/i },
  },
];
