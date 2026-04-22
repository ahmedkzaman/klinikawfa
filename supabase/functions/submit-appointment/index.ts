import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const todayISO = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    .toISOString()
    .slice(0, 10);
};

const BodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  phone: z
    .string()
    .trim()
    .regex(/^[+0-9 \-()]{8,20}$/, "Invalid phone"),
  service: z.string().trim().min(1).max(100),
  preferred_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date")
    .refine((d) => d >= todayISO(), "Date must be today or later"),
  preferred_time: z.string().regex(/^\d{2}:\d{2}$/, "Invalid time"),
  message: z.string().trim().max(1000).optional().nullable(),
});

async function hashIp(ip: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}::${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    // 1. Hardened IP extraction — only trust gateway-set headers.
    // Explicitly do NOT read x-forwarded-for (client-injectable).
    const ip =
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-real-ip") ||
      "";

    if (!ip) {
      return json(
        {
          error:
            "Unable to verify request origin / Tidak dapat mengesahkan asal permintaan",
        },
        400,
      );
    }

    const salt = Deno.env.get("APPT_IP_SALT");
    if (!salt) {
      console.error("APPT_IP_SALT not configured");
      return json({ error: "Server misconfigured" }, 500);
    }

    // 2. Validate body
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return json(
        {
          error: "Validation failed",
          fields: parsed.error.flatten().fieldErrors,
        },
        400,
      );
    }
    const data = parsed.data;

    // 3. Hash IP (privacy-preserving)
    const ipHash = await hashIp(ip, salt);

    // 4. Anon Supabase client — RPC's SECURITY DEFINER provides write privileges.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );

    // 5. Atomic RPC: rate-limit check + log + appointment insert
    const { data: appointmentId, error } = await supabase.rpc(
      "record_appointment_submission",
      {
        _ip_hash: ipHash,
        _name: data.name,
        _phone: data.phone,
        _service: data.service,
        _preferred_date: data.preferred_date,
        _preferred_time: data.preferred_time,
        _message: data.message ?? null,
      },
    );

    if (error) {
      const msg = (error.message || "").toUpperCase();
      if (msg.includes("RATE_LIMIT")) {
        return json(
          {
            error:
              "Too many requests. Please try again in 10 minutes / Terlalu banyak permintaan. Sila cuba lagi dalam 10 minit",
            retryAfterMinutes: 10,
          },
          429,
        );
      }
      console.error("RPC error:", error);
      return json({ error: "Failed to submit appointment" }, 500);
    }

    return json({ ok: true, id: appointmentId }, 200);
  } catch (err) {
    console.error("Unexpected error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
