import { afterEach, describe, expect, it, vi } from "vitest";

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(() => ({ auth: {} })),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock,
}));

describe("Supabase browser fetch adapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    createClientMock.mockClear();
  });

  it("passes a browser-bound native fetch to the Supabase client", async () => {
    const nativeFetch = vi.fn(function (this: typeof globalThis) {
      expect(this).toBe(globalThis);
      return Promise.resolve(new Response(null, { status: 204 }));
    });
    vi.stubGlobal("fetch", nativeFetch);

    await import("@/integrations/supabase/client");

    const options = createClientMock.mock.calls[0]?.[2];
    expect(options?.global?.fetch).toBeTypeOf("function");
    await options.global.fetch("https://example.test/auth/v1/health");
    expect(nativeFetch).toHaveBeenCalledOnce();
  });
});
