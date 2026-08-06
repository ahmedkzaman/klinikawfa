import {
  HttpError,
  requireRole,
  type RoleLabel,
} from "../_shared/auth-helpers.ts";
import { ImportHttpError, type ImportActor } from "./import-core.ts";

type RequireRole = (
  req: Request,
  allowedLabels: RoleLabel[],
) => Promise<ImportActor>;

/**
 * The shared `admin` label expands to both concrete import roles: `admin` and
 * `doctor_admin`. Translate its safe HTTP error at this module boundary so the
 * runtime-independent import handler never mistakes an auth rejection for 500.
 */
export async function authorizeYezzaImportRequest(
  req: Request,
  authenticate: RequireRole = requireRole,
): Promise<ImportActor> {
  try {
    return await authenticate(req, ["admin"]);
  } catch (error) {
    if (error instanceof HttpError) {
      throw new ImportHttpError(error.status, error.safeMessage);
    }
    throw error;
  }
}
