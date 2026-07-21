import {
  CREATABLE_USER_ROLES,
  requiresStaffOnboarding,
  resolveCreatableRole,
} from "./role-policy.ts";

function assertEquals<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(message ?? `Expected ${expected}, received ${actual}`);
  }
}

Deno.test("admin tiers can create website_editor accounts", () => {
  for (const callerRole of ["admin", "special_admin", "doctor_admin"]) {
    assertEquals(resolveCreatableRole(callerRole, "website_editor"), "website_editor");
  }
});

Deno.test("operations tiers are reduced to locum for every requested role", () => {
  for (const callerRole of ["ops_staff", "staff", "operations"]) {
    for (const requestedRole of CREATABLE_USER_ROLES) {
      assertEquals(resolveCreatableRole(callerRole, requestedRole), "locum");
    }
  }
});

Deno.test("website_editor does not require staff onboarding", () => {
  assertEquals(requiresStaffOnboarding("website_editor"), false);
});

Deno.test("website_editor callers cannot create accounts", () => {
  let threwForbidden = false;
  try {
    resolveCreatableRole("website_editor", "locum");
  } catch (error) {
    threwForbidden = error instanceof Error && error.message === "FORBIDDEN";
  }

  assertEquals(threwForbidden, true);
});
