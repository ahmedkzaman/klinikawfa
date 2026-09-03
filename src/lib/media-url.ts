/**
 * Normalize legacy Supabase storage URLs to the current project.
 *
 * The production cutover moved the clinic database from the pre-cutover
 * project (ref `ncysmppzfjtiekfnomdv`, now deleted) to the promoted project.
 * Rows written before the cutover still store absolute storage URLs that point
 * at the deleted project's host, which no longer resolves (ERR_NAME_NOT_RESOLVED).
 * The files themselves were migrated: the same storage path on the current
 * project host serves them fine.
 *
 * This module rewrites any legacy-project storage URL to the current project
 * host at read time so every consumer (gallery, landing hero/video, service
 * images, team photos, blog covers) renders regardless of when the row was
 * written. It is idempotent and leaves unrelated URLs untouched.
 */

const LEGACY_PROJECT_REFS = ["ncysmppzfjtiekfnomdv"] as const;

/**
 * Current project ref, inlined at build time from VITE_SUPABASE_URL
 * (see vite.config.ts `define`). Undefined in bare vitest runs, where the
 * function then behaves as a safe passthrough unless a ref is passed
 * explicitly.
 */
const CURRENT_PROJECT_REF = (() => {
  const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL;
  if (!supabaseUrl) return null;
  const match = /^https:\/\/([a-z0-9]+)\.supabase\.co/i.exec(supabaseUrl.trim());
  return match ? match[1].toLowerCase() : null;
})();

/**
 * Rewrite legacy Supabase storage URLs to the current project host.
 *
 * - Legacy `<ref>.supabase.co/storage/v1/object/public/<path>` URLs are
 *   rewritten to `<current-ref>.supabase.co` with the path preserved.
 * - Already-current URLs, relative paths, and non-Supabase URLs pass through
 *   unchanged (idempotent).
 * - Null/undefined/blank input resolves to an empty string.
 */
export function normalizeSupabaseStorageUrl(
  url: string | null | undefined,
  currentProjectRef: string | null = CURRENT_PROJECT_REF,
): string {
  const trimmed = (url ?? "").trim();
  if (!trimmed) return "";
  if (!currentProjectRef) return trimmed;
  if (!trimmed.toLowerCase().includes("supabase.co/")) return trimmed;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return trimmed;
  }
  if (parsed.protocol !== "https:") return trimmed;
  if (parsed.pathname.indexOf("/storage/") !== 0) return trimmed;

  const hostMatch = /^([a-z0-9]+)\.supabase\.co$/i.exec(parsed.hostname);
  if (!hostMatch) return trimmed;

  const hostRef = hostMatch[1].toLowerCase();
  const isLegacy = (LEGACY_PROJECT_REFS as readonly string[]).includes(hostRef);
  const isCurrent = hostRef === currentProjectRef;
  if (!isLegacy && !isCurrent) return trimmed;
  if (isCurrent) return parsed.toString();

  return `https://${currentProjectRef}.supabase.co${parsed.pathname}${parsed.search}`;
}
