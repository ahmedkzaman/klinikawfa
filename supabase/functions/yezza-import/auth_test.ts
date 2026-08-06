import { HttpError, type RoleLabel } from "../_shared/auth-helpers.ts";
import { ImportHttpError } from "./import-core.ts";
import { authorizeYezzaImportRequest } from "./auth.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("translates the shared auth error into the import handler error", async () => {
  const authenticate = async (_req: Request, _labels: RoleLabel[]) => {
    throw new HttpError(401, "Unauthorized");
  };

  try {
    await authorizeYezzaImportRequest(new Request("https://example.invalid"), authenticate);
    throw new Error("Expected authorization to fail");
  } catch (error) {
    assert(error instanceof ImportHttpError, "shared HttpError was not translated");
    assert(error.status === 401, "translated status changed");
    assert(error.safeMessage === "Unauthorized", "translated safe message changed");
  }
});

Deno.test("the admin role label accepts the concrete doctor_admin role", async () => {
  let receivedLabels: RoleLabel[] = [];
  const authenticate = async (_req: Request, labels: RoleLabel[]) => {
    receivedLabels = labels;
    return { userId: "75000000-0000-4000-8000-000000000001", role: "doctor_admin" };
  };

  const actor = await authorizeYezzaImportRequest(
    new Request("https://example.invalid"),
    authenticate,
  );

  assert(JSON.stringify(receivedLabels) === JSON.stringify(["admin"]), "secure admin label was not requested");
  assert(actor.role === "doctor_admin", "doctor_admin was not accepted");
});
