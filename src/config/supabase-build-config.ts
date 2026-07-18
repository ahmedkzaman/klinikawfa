export type SupabaseBuildEnvironment = Record<string, string | undefined>;

export type SupabaseBuildVariable =
  | "VITE_SUPABASE_URL"
  | "VITE_SUPABASE_PUBLISHABLE_KEY"
  | "VITE_SUPABASE_PROJECT_ID";

export type SupabaseBuildConfigSource =
  | "environment"
  | "public-production-fallback"
  | "incomplete-environment"
  | "missing";

export interface SupabaseBuildConfig {
  url: string | undefined;
  publishableKey: string | undefined;
  projectId: string | undefined;
  source: SupabaseBuildConfigSource;
  missing: SupabaseBuildVariable[];
}

// These values identify the public browser client. Supabase documents the
// publishable/legacy anon key as safe for browser bundles and source code when
// RLS protects the database. Never add a secret/service-role key here.
const PUBLIC_PRODUCTION_CONFIG = {
  url: "https://ncysmppzfjtiekfnomdv.supabase.co",
  publishableKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jeXNtcHB6Zmp0aWVrZm5vbWR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5MTIzNTEsImV4cCI6MjA4NTQ4ODM1MX0.4JUfcL915cqt42h-gocFeZ4OQQT27BOtI0YaQSPxlCg",
  projectId: "ncysmppzfjtiekfnomdv",
} as const;

const missingVariables = (
  url: string | undefined,
  publishableKey: string | undefined,
  projectId: string | undefined,
): SupabaseBuildVariable[] =>
  [
    !url && "VITE_SUPABASE_URL",
    !publishableKey && "VITE_SUPABASE_PUBLISHABLE_KEY",
    !projectId && "VITE_SUPABASE_PROJECT_ID",
  ].filter((name): name is SupabaseBuildVariable => Boolean(name));

export const resolveSupabaseBuildConfig = (
  mode: string,
  environment: SupabaseBuildEnvironment,
): SupabaseBuildConfig => {
  const url = environment.VITE_SUPABASE_URL;
  const publishableKey =
    environment.VITE_SUPABASE_PUBLISHABLE_KEY ||
    environment.VITE_SUPABASE_ANON_KEY;
  const projectId = environment.VITE_SUPABASE_PROJECT_ID;
  const missing = missingVariables(url, publishableKey, projectId);
  const hasAnyEnvironmentValue = Boolean(url || publishableKey || projectId);

  if (missing.length === 0) {
    return {
      url,
      publishableKey,
      projectId,
      source: "environment",
      missing,
    };
  }

  if (hasAnyEnvironmentValue) {
    return {
      url,
      publishableKey,
      projectId,
      source: "incomplete-environment",
      missing,
    };
  }

  if (mode === "production") {
    return {
      ...PUBLIC_PRODUCTION_CONFIG,
      source: "public-production-fallback",
      missing: [],
    };
  }

  return {
    url,
    publishableKey,
    projectId,
    source: "missing",
    missing,
  };
};
