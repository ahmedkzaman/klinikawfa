import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export type RoleLabel = "clinical" | "ops" | "admin" | "special_admin";

// Maps friendly labels to concrete app_role values stored in public.user_roles.
const LABEL_TO_ROLES: Record<RoleLabel, string[]> = {
  clinical: ["doctor", "doctor_admin", "resident_doctor", "locum"],
  ops: ["staff", "ops_staff", "operations"],
  admin: ["admin", "doctor_admin"],
  special_admin: ["special_admin"],
};

export class HttpError extends Error {
  constructor(public status: number, public safeMessage: string) {
    super(safeMessage);
  }
}

function expand(labels: RoleLabel[]): Set<string> {
  const out = new Set<string>();
  for (const l of labels) for (const r of LABEL_TO_ROLES[l] ?? []) out.add(r);
  return out;
}

/**
 * Verify the request bearer JWT and require that the caller's role belongs
 * to the expanded allow-list. Throws HttpError on failure.
 */
export async function requireRole(
  req: Request,
  allowedLabels: RoleLabel[],
): Promise<{ userId: string; role: string }> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  if (!token) throw new HttpError(401, "Unauthorized");

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser();
  if (userError || !userData?.user) {
    throw new HttpError(401, "Unauthorized");
  }

  const adminClient = createClient(supabaseUrl, serviceKey);
  const { data: roleRow } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  const role = roleRow?.role as string | undefined;
  const allowed = expand(allowedLabels);
  if (!role || !allowed.has(role)) {
    throw new HttpError(403, "Forbidden");
  }
  return { userId: userData.user.id, role };
}

/**
 * Validate Content-Length up-front. Throws 413 if known oversize.
 */
export function validatePayloadSize(req: Request, maxBytes: number): void {
  const len = Number(req.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(len) && len > maxBytes) {
    throw new HttpError(413, "Payload too large");
  }
}

/**
 * Read and JSON-parse the body while enforcing a hard byte cap, even when
 * Content-Length is missing or chunked.
 */
export async function readJsonWithLimit<T = unknown>(
  req: Request,
  maxBytes: number,
): Promise<T> {
  validatePayloadSize(req, maxBytes);
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError(400, "Invalid request");

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        try { await reader.cancel(); } catch { /* ignore */ }
        throw new HttpError(413, "Payload too large");
      }
      chunks.push(value);
    }
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { buf.set(c, off); off += c.byteLength; }
  const text = new TextDecoder().decode(buf);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, "Invalid request");
  }
}

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Convert any thrown value to a safe (status, body) pair. Never leaks
 * stack traces, API keys, or PHI to the response. Server-side logs only
 * include the function name and error class.
 */
export function sanitizeError(
  err: unknown,
  fnName: string,
): { status: number; body: { error: string } } {
  if (err instanceof HttpError) {
    return { status: err.status, body: { error: err.safeMessage } };
  }
  const klass = err instanceof Error ? err.name : typeof err;
  console.error(`[${fnName}] internal_error`, klass);
  return { status: 500, body: { error: "Internal error" } };
}

export interface WithAuthOptions {
  fnName: string;
  allowedRoles: RoleLabel[];
  maxBytes: number;
}

/**
 * Wraps an Edge Function handler with: CORS preflight, method check,
 * JWT/role gate, body cap + JSON parse, and error sanitization.
 * The inner handler receives the parsed body plus the auth context.
 */
export function withAuth<TBody, TOut>(
  opts: WithAuthOptions,
  handler: (
    body: TBody,
    ctx: { userId: string; role: string; req: Request },
  ) => Promise<TOut>,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }
    if (req.method !== "POST") {
      return jsonResponse(405, { error: "Method not allowed" });
    }
    try {
      const ctx = await requireRole(req, opts.allowedRoles);
      const body = await readJsonWithLimit<TBody>(req, opts.maxBytes);
      const out = await handler(body, { ...ctx, req });
      return jsonResponse(200, out);
    } catch (err) {
      const { status, body } = sanitizeError(err, opts.fnName);
      return jsonResponse(status, body);
    }
  };
}
