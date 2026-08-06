import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

import { authorizeYezzaImportRequest } from "./auth.ts";
import {
  ImportHttpError,
  createYezzaImportHandler,
  type ApprovedDryRun,
  type ImportApplyResult,
  type ImportGateway,
  type YezzaImportPayload,
} from "./import-core.ts";

type RpcError = { message?: string; code?: string };

function rpcFailure(error: RpcError): never {
  const message = error.message ?? "";
  if (message.includes("YEZZA_IMPORT_FORBIDDEN")) {
    throw new ImportHttpError(403, "Forbidden");
  }
  if (
    message.includes("YEZZA_IMPORT_BATCH_NOT_APPROVED")
    || message.includes("YEZZA_IMPORT_BATCH_NOT_FOUND")
    || message.includes("YEZZA_IMPORT_APPROVAL_MISMATCH")
  ) {
    throw new ImportHttpError(409, "Import batch is not approved");
  }
  if (
    message.includes("YEZZA_IMPORT_INVALID")
    || message.includes("YEZZA_IMPORT_COUNT_MISMATCH")
  ) {
    throw new ImportHttpError(400, "Invalid import payload");
  }
  throw new Error(`Yezza import RPC failed (${error.code ?? "unknown"})`);
}

function serverClient() {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !serviceRoleKey) throw new Error("Missing server configuration");
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

class SupabaseImportGateway implements ImportGateway {
  async approve(input: ApprovedDryRun): Promise<{ importBatchId: string; status: "approved" }> {
    const { data, error } = await serverClient().rpc("approve_yezza_import", {
      p_actor_id: input.actorId,
      p_source_batch_id: input.payload.sourceBatchId,
      p_payload_hash: input.payloadHash,
      p_source_counts: input.counts,
      p_review_counts: input.payload.reviewCounts,
      p_review_artifacts: input.reviewArtifacts,
    });
    if (error) rpcFailure(error);
    if (!data || data.status !== "approved" || typeof data.importBatchId !== "string") {
      throw new Error("Invalid approval RPC response");
    }
    return data as { importBatchId: string; status: "approved" };
  }

  async apply(input: {
    importBatchId: string;
    actorId: string;
    payloadHash: string;
    payload: YezzaImportPayload;
  }): Promise<ImportApplyResult> {
    const { data, error } = await serverClient().rpc("apply_yezza_import", {
      p_import_batch_id: input.importBatchId,
      p_actor_id: input.actorId,
      p_payload_hash: input.payloadHash,
      p_payload: input.payload,
    });
    if (error) rpcFailure(error);
    if (!data || !["completed", "failed"].includes(data.status)) {
      throw new Error("Invalid apply RPC response");
    }
    return data as ImportApplyResult;
  }
}

const handler = createYezzaImportHandler({
  authorize: authorizeYezzaImportRequest,
  gateway: new SupabaseImportGateway(),
});

Deno.serve(handler);
