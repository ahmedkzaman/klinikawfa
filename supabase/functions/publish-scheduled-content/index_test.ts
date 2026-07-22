import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createScheduledContentHandler } from "./handler.ts";

const request = (secret?: string, method = "POST") => new Request("https://example.test/publish", { method, headers: secret ? { "x-cron-secret": secret } : undefined });

Deno.test("scheduled publisher rejects non-POST requests", async () => {
  const response = await createScheduledContentHandler({ cronSecret: "secret", publishDue: async () => 0 })(request("secret", "GET"));
  assertEquals(response.status, 405);
});

Deno.test("scheduled publisher rejects a missing secret", async () => {
  const response = await createScheduledContentHandler({ cronSecret: "secret", publishDue: async () => 0 })(request());
  assertEquals(response.status, 401);
});

Deno.test("scheduled publisher rejects an incorrect secret", async () => {
  const response = await createScheduledContentHandler({ cronSecret: "secret", publishDue: async () => 0 })(request("wrong"));
  assertEquals(response.status, 401);
});

Deno.test("scheduled publisher returns counts only", async () => {
  const response = await createScheduledContentHandler({ cronSecret: "secret", publishDue: async (limit) => { assertEquals(limit, 100); return 3; } })(request("secret"));
  assertEquals(response.status, 200);
  assertEquals(await response.json(), { success: true, published: 3 });
});

Deno.test("scheduled publisher succeeds when nothing is due", async () => {
  const response = await createScheduledContentHandler({ cronSecret: "secret", publishDue: async () => 0 })(request("secret"));
  assertEquals(await response.json(), { success: true, published: 0 });
});

Deno.test("scheduled publisher fails closed on database errors", async () => {
  const response = await createScheduledContentHandler({ cronSecret: "secret", publishDue: async () => { throw new Error("db unavailable"); } })(request("secret"));
  assertEquals(response.status, 500);
});
