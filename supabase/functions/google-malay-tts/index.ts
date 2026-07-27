const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonError = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonError(405, "Method not allowed");
  }

  try {
    await requireRole(req, ["clinical", "ops", "admin", "special_admin"]);

    const contentLength = Number(req.headers.get("Content-Length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > 1024) {
      return jsonError(413, "Payload too large");
    }

    const body = await req.json() as { text?: unknown };
    const text = typeof body.text === "string"
      ? body.text.trim().replace(/\s+/g, " ")
      : "";
    if (!text || text.length > 300) {
      return jsonError(400, "Invalid text");
    }

    const url = new URL("https://translate.google.com/translate_tts");
    url.searchParams.set("ie", "UTF-8");
    url.searchParams.set("client", "tw-ob");
    url.searchParams.set("tl", "ms");
    url.searchParams.set("q", text);

    const upstream = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!upstream.ok) {
      console.error("[google-malay-tts] upstream_error", upstream.status);
      return jsonError(502, "Speech service unavailable");
    }

    return new Response(await upstream.arrayBuffer(), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/octet-stream",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonError(error.status, error.safeMessage);
    }
    console.error(
      "[google-malay-tts] internal_error",
      error instanceof Error ? error.name : typeof error,
    );
    return jsonError(500, "Speech service unavailable");
  }
});
import {
  HttpError,
  requireRole,
} from "../_shared/auth-helpers.ts";
