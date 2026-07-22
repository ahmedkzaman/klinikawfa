export interface ScheduledPublisherDependencies {
  cronSecret: string | undefined;
  publishDue(limit: number): Promise<number>;
}

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export function constantTimeEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const length = Math.max(a.length, b.length, 1);
  let difference = a.length ^ b.length;
  for (let index = 0; index < length; index += 1) difference |= (a[index % Math.max(a.length, 1)] ?? 0) ^ (b[index % Math.max(b.length, 1)] ?? 0);
  return difference === 0;
}

export function createScheduledContentHandler(dependencies: ScheduledPublisherDependencies) {
  return async (request: Request) => {
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    if (!dependencies.cronSecret) return json({ error: "Server misconfigured" }, 500);
    const provided = request.headers.get("x-cron-secret") ?? "";
    if (!constantTimeEqual(provided, dependencies.cronSecret)) return json({ error: "Unauthorized" }, 401);
    try {
      const published = await dependencies.publishDue(100);
      return json({ success: true, published });
    } catch {
      return json({ error: "Scheduled publishing failed" }, 500);
    }
  };
}
