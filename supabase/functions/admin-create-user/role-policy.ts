export const CREATABLE_USER_ROLES = [
  "locum",
  "resident_doctor",
  "ops_staff",
  "staff",
  "operations",
  "website_editor",
] as const;

export type CreatableUserRole = (typeof CREATABLE_USER_ROLES)[number];

const ADMIN_TIER_CALLERS = new Set(["admin", "special_admin", "doctor_admin"]);
const OPS_TIER_CALLERS = new Set(["ops_staff", "staff", "operations"]);

export function resolveCreatableRole(
  callerRole: string | null | undefined,
  requestedRole: CreatableUserRole,
): CreatableUserRole {
  if (callerRole && ADMIN_TIER_CALLERS.has(callerRole)) return requestedRole;
  if (callerRole && OPS_TIER_CALLERS.has(callerRole)) return "locum";
  throw new Error("FORBIDDEN");
}

export function requiresStaffOnboarding(role: CreatableUserRole): boolean {
  return new Set(["resident_doctor", "ops_staff", "staff", "operations"]).has(role);
}
