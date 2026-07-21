import { z } from "zod";

import { isSafeUrl } from "@/lib/security";

export const PROTECTED_INTERNAL_PATH_SEGMENTS = [
  "auth",
  "staff",
  "clinic",
  "editor",
  "appointment",
  "video-call",
  "reset-password",
  "locum-register",
  "tv",
  "api",
  "functions",
  "payment",
  "payments",
  "callback",
] as const;

export const SAFE_HREF_FORBIDDEN_CHARACTERS_PATTERN = "[\\u0000-\\u001F\\u007F\\\\]";
export const SAFE_HREF_ENCODED_PATH_BYPASS_PATTERN = "%(?:2[eEfF]|5[cC])";
export const SAFE_HREF_DOT_SEGMENT_PATTERN = "(?:^|/)(?:\\.{1,2})(?=/|$)";

const protectedSegmentsPattern = PROTECTED_INTERNAL_PATH_SEGMENTS.map((segment) =>
  [...segment].map((character) => `[${character}${character.toUpperCase()}]`).join(""),
).join("|");

export const PROTECTED_INTERNAL_RELATIVE_HREF_PATTERN =
  `^/(?:${protectedSegmentsPattern})(?:/|[?#]|$)`;
export const PROTECTED_INTERNAL_HTTP_HREF_PATTERN =
  `^[hH][tT][tT][pP][sS]?://[^/?#]+/(?:${protectedSegmentsPattern})(?:/|[?#]|$)`;

const URL_BASE = "https://managed-content.invalid";

function hasUnsafeHrefSyntax(value: string): boolean {
  return (
    new RegExp(SAFE_HREF_FORBIDDEN_CHARACTERS_PATTERN).test(value) ||
    new RegExp(SAFE_HREF_ENCODED_PATH_BYPASS_PATTERN, "i").test(value) ||
    new RegExp(SAFE_HREF_DOT_SEGMENT_PATTERN).test(value)
  );
}

function reachesProtectedPath(value: string): boolean {
  try {
    const parsed = new URL(value, URL_BASE);
    const pathname = parsed.pathname.toLowerCase();
    return PROTECTED_INTERNAL_PATH_SEGMENTS.some(
      (segment) => pathname === `/${segment}` || pathname.startsWith(`/${segment}/`),
    );
  } catch {
    return true;
  }
}

export function isSafeManagedHref(value: string): boolean {
  if (value !== value.trim() || value.length === 0 || hasUnsafeHrefSyntax(value)) return false;
  if (value.startsWith("//")) return false;
  return isSafeUrl(value);
}

export const bilingualTextSchema = z
  .object({
    ms: z.string(),
    en: z.string().default(""),
  })
  .strict();

export const requiredBilingualTextSchema = bilingualTextSchema.refine(
  ({ ms }) => ms.trim().length > 0,
  { message: "Malay content is required", path: ["ms"] },
);

export const safeHrefSchema = z.string().refine(isSafeManagedHref, "Unsafe URL");

export const websiteCtaHrefSchema = safeHrefSchema.refine(
  (href) => !reachesProtectedPath(href),
  "Protected internal routes cannot be linked from managed content",
);

export const bilingualCtaSchema = z
  .object({
    label: requiredBilingualTextSchema,
    href: websiteCtaHrefSchema,
  })
  .strict();

export const safeMediaSchema = z
  .object({
    type: z.enum(["image", "video"]),
    url: safeHrefSchema,
    alt: bilingualTextSchema,
  })
  .strict();

export type BilingualText = z.infer<typeof bilingualTextSchema>;
export type BilingualCta = z.infer<typeof bilingualCtaSchema>;
export type SafeMedia = z.infer<typeof safeMediaSchema>;
