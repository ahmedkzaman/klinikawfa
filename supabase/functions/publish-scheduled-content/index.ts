import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createScheduledContentHandler } from "./handler.ts";

const client = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const handler = createScheduledContentHandler({
  cronSecret: Deno.env.get("CRON_SECRET"),
  async publishDue(limit) {
    const { data, error } = await client.rpc("publish_due_website_content", { p_limit: limit });
    if (error) throw new Error(error.message);
    const published = Number((data as { published?: unknown } | null)?.published ?? 0);
    if (!Number.isInteger(published) || published < 0) throw new Error("Invalid publisher response");
    return published;
  },
});

Deno.serve(handler);
