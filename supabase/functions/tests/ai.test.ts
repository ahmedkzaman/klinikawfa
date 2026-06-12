// Deno tests for shared edge-function auth helpers.
// Run with: supabase functions test, or via the Lovable supabase--test_edge_functions tool.
// No real Supabase keys are used; all env values are throwaway and fetch is stubbed.

import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

// Stub env BEFORE importing the helpers (createClient reads env at call time,
// but we set them up-front to be safe and deterministic).
Deno.env.set("SUPABASE_URL", "http://localhost:54321");
Deno.env.set("SUPABASE_ANON_KEY", "test-anon-key");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");

const {
  HttpError,
  requireRole,
  readJsonWithLimit,
  validatePayloadSize,
  sanitizeError,
  withAuth,
} = await import("../_shared/auth-helpers.ts");

// ---------- 401: missing Authorization header ----------
Deno.test("requireRole -> 401 when Authorization header is missing", async () => {
  const req = new Request("http://localhost/fn", { method: "POST" });
  let caught: unknown;
  try {
    await requireRole(req, ["clinical"]);
  } catch (e) {
    caught = e;
  }
  assert(caught instanceof HttpError, "expected HttpError");
  assertEquals((caught as InstanceType<typeof HttpError>).status, 401);
  assertEquals((caught as InstanceType<typeof HttpError>).safeMessage, "Unauthorized");
});

// ---------- 403: authenticated user with disallowed role ----------
Deno.test("requireRole -> 403 when role is not in allow-list (patient)", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: Request | URL | string, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    // GoTrue: GET /auth/v1/user  -> return a valid user
    if (url.includes("/auth/v1/user")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({ id: "user-1", email: "p@example.com", aud: "authenticated" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    }
    // PostgREST: user_roles lookup -> return a single row with role 'patient'
    if (url.includes("/rest/v1/user_roles")) {
      return Promise.resolve(
        new Response(JSON.stringify({ role: "patient" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    // Any other call: surface a hard error so tests fail loudly on egress.
    return Promise.resolve(
      new Response(JSON.stringify({ error: "unexpected_call", url }), { status: 599 }),
    );
  }) as typeof fetch;

  try {
    const req = new Request("http://localhost/fn", {
      method: "POST",
      headers: { Authorization: "Bearer fake.jwt.token" },
    });
    let caught: unknown;
    try {
      await requireRole(req, ["clinical", "admin", "special_admin"]);
    } catch (e) {
      caught = e;
    }
    assert(caught instanceof HttpError, "expected HttpError");
    assertEquals((caught as InstanceType<typeof HttpError>).status, 403);
    assertEquals((caught as InstanceType<typeof HttpError>).safeMessage, "Forbidden");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ---------- 413: payload over the cap (via Content-Length header) ----------
Deno.test("validatePayloadSize -> 413 when Content-Length exceeds cap", () => {
  const body = "x".repeat(30 * 1024);
  const req = new Request("http://localhost/fn", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": String(body.length),
    },
    body,
  });
  let caught: unknown;
  try {
    validatePayloadSize(req, 20 * 1024);
  } catch (e) {
    caught = e;
  }
  assert(caught instanceof HttpError);
  assertEquals((caught as InstanceType<typeof HttpError>).status, 413);
});

// ---------- 413 via streaming accumulator (no/forged Content-Length) ----------
Deno.test("readJsonWithLimit -> 413 when streamed body exceeds cap", async () => {
  const payload = "x".repeat(30 * 1024);
  // Build a Request whose body stream emits >20KB regardless of headers.
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(payload));
      controller.close();
    },
  });
  const req = new Request("http://localhost/fn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: stream,
  });
  let caught: unknown;
  try {
    await readJsonWithLimit(req, 20 * 1024);
  } catch (e) {
    caught = e;
  }
  assert(caught instanceof HttpError, "expected HttpError");
  assertEquals((caught as InstanceType<typeof HttpError>).status, 413);
});

// ---------- sanitizeError + withAuth do not leak internals ----------
Deno.test("withAuth sanitizes thrown errors (no secrets/stack leakage)", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: Request | URL | string) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes("/auth/v1/user")) {
      return Promise.resolve(
        new Response(JSON.stringify({ id: "user-1", aud: "authenticated" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (url.includes("/rest/v1/user_roles")) {
      return Promise.resolve(
        new Response(JSON.stringify({ role: "admin" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof fetch;

  try {
    const handler = withAuth(
      { fnName: "test-fn", allowedRoles: ["admin"], maxBytes: 1024 },
      async () => {
        throw new Error(
          "OPENAI_API_KEY=sk-live-XYZ leaked\n    at /home/deno/secret/path.ts:42",
        );
      },
    );

    const req = new Request("http://localhost/fn", {
      method: "POST",
      headers: {
        Authorization: "Bearer fake.jwt.token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ok: true }),
    });

    const res = await handler(req);
    assertEquals(res.status, 500);
    const text = await res.text();
    // Generic message only.
    assertStringIncludes(text, "Internal error");
    // Never leak secrets, stack frames, or filesystem paths.
    assert(!text.includes("sk-live"), "response leaked API key value");
    assert(!text.includes("OPENAI_API_KEY"), "response leaked secret name");
    assert(!text.includes("/home/"), "response leaked filesystem path");
    assert(!text.includes("at "), "response leaked stack frame");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ---------- sanitizeError directly: HttpError passes through, generic Error masked ----------
Deno.test("sanitizeError surfaces HttpError safeMessage and masks unknown errors", () => {
  const a = sanitizeError(new HttpError(401, "Unauthorized"), "fn");
  assertEquals(a.status, 401);
  assertEquals(a.body.error, "Unauthorized");

  const b = sanitizeError(new Error("boom secret=abc"), "fn");
  assertEquals(b.status, 500);
  assertEquals(b.body.error, "Internal error");
});

// ---------- withAuth CORS preflight and method gate ----------
Deno.test("withAuth handles OPTIONS preflight and rejects non-POST", async () => {
  const handler = withAuth(
    { fnName: "test-fn", allowedRoles: ["admin"], maxBytes: 1024 },
    async () => ({ ok: true }),
  );

  const pre = await handler(new Request("http://localhost/fn", { method: "OPTIONS" }));
  assertEquals(pre.status, 200);
  await pre.text();

  const get = await handler(new Request("http://localhost/fn", { method: "GET" }));
  assertEquals(get.status, 405);
  await get.text();
});
