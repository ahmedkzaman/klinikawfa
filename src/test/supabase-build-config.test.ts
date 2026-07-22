import { describe, expect, it } from "vitest";

import { resolveSupabaseBuildConfig } from "@/config/supabase-build-config";

const completeEnvironment = {
  VITE_SUPABASE_URL: "https://example.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
  VITE_SUPABASE_PROJECT_ID: "example-project",
};

describe("resolveSupabaseBuildConfig", () => {
  it("uses the approved public production config when Lovable injects no Vite variables", () => {
    const resolved = resolveSupabaseBuildConfig("production", {});

    expect(resolved).toMatchObject({
      url: "https://nhjbqdiyptjqherdfbqk.supabase.co",
      projectId: "nhjbqdiyptjqherdfbqk",
      source: "public-production-fallback",
      missing: [],
    });
    expect(resolved.publishableKey).toMatch(/^sb_publishable_/);
  });

  it("prefers a complete environment-provided config", () => {
    expect(
      resolveSupabaseBuildConfig("production", completeEnvironment),
    ).toEqual({
      url: completeEnvironment.VITE_SUPABASE_URL,
      publishableKey: completeEnvironment.VITE_SUPABASE_PUBLISHABLE_KEY,
      projectId: completeEnvironment.VITE_SUPABASE_PROJECT_ID,
      source: "environment",
      missing: [],
    });
  });

  it("accepts the legacy anon variable as the browser key", () => {
    const { VITE_SUPABASE_PUBLISHABLE_KEY: _unused, ...environment } =
      completeEnvironment;

    expect(
      resolveSupabaseBuildConfig("production", {
        ...environment,
        VITE_SUPABASE_ANON_KEY: "legacy-anon-example",
      }),
    ).toMatchObject({
      publishableKey: "legacy-anon-example",
      source: "environment",
      missing: [],
    });
  });

  it("fails closed on a partial production environment instead of mixing projects", () => {
    expect(
      resolveSupabaseBuildConfig("production", {
        VITE_SUPABASE_URL: "https://example.supabase.co",
      }),
    ).toMatchObject({
      source: "incomplete-environment",
      missing: [
        "VITE_SUPABASE_PUBLISHABLE_KEY",
        "VITE_SUPABASE_PROJECT_ID",
      ],
    });
  });

  it("does not silently connect development to production", () => {
    expect(resolveSupabaseBuildConfig("development", {})).toEqual({
      url: undefined,
      publishableKey: undefined,
      projectId: undefined,
      source: "missing",
      missing: [
        "VITE_SUPABASE_URL",
        "VITE_SUPABASE_PUBLISHABLE_KEY",
        "VITE_SUPABASE_PROJECT_ID",
      ],
    });
  });
});
