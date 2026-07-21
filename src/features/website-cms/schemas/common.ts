import { z } from "zod";

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

export const MANAGED_HREF_MAX_LENGTH = 2048;

const internalPathSegment = "[a-z0-9]+(?:-[a-z0-9]+)*";
const rootRelativePath = `/(?:${internalPathSegment}(?:/${internalPathSegment})*)?`;
const safeQuery = "(?:\\?[A-Za-z0-9._~!$'()*,-=&]{0,256})?";
const safeHash = "(?:#[A-Za-z0-9._~-]{0,128})?";
const dnsLabel = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
const dnsHost = `(?:${dnsLabel}\\.)+[a-z]{2,63}`;
const absolutePathSegment = "[A-Za-z0-9_~!$&'()*+,;=:@-][A-Za-z0-9._~!$&'()*+,;=:@-]*";
const absolutePath = `(?:/(?:${absolutePathSegment}(?:/${absolutePathSegment})*)?)?`;
const assetDirectorySegment = "[a-z0-9]+(?:-[a-z0-9]+)*";
const assetFilename = "[A-Za-z0-9][A-Za-z0-9_.-]{0,191}";
const assetImageExtension = "(?:avif|gif|jpe?g|png|svg|webp)";

export const ROOT_RELATIVE_MANAGED_HREF_PATTERN =
  `^${rootRelativePath}${safeQuery}${safeHash}$`;
export const ANCHOR_MANAGED_HREF_PATTERN = "^#[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$";
export const HTTP_MANAGED_HREF_PATTERN =
  `^https?://${dnsHost}${absolutePath}${safeQuery}${safeHash}$`;
export const MAILTO_MANAGED_HREF_PATTERN =
  `^mailto:[A-Za-z0-9._+-]+@${dnsHost}$`;
export const TEL_MANAGED_HREF_PATTERN = "^tel:\\+?[0-9][0-9-]{0,30}$";

export const MANAGED_LINK_GRAMMAR_PATTERNS = [
  ROOT_RELATIVE_MANAGED_HREF_PATTERN,
  ANCHOR_MANAGED_HREF_PATTERN,
  HTTP_MANAGED_HREF_PATTERN,
  MAILTO_MANAGED_HREF_PATTERN,
  TEL_MANAGED_HREF_PATTERN,
] as const;
export const MANAGED_ASSET_PATH_PATTERN =
  `^/(?:${assetDirectorySegment}/)*${assetFilename}\\.${assetImageExtension}$`;
export const MANAGED_HREF_GRAMMAR_PATTERNS = [
  ...MANAGED_LINK_GRAMMAR_PATTERNS,
  MANAGED_ASSET_PATH_PATTERN,
] as const;

const protectedSegmentsPattern = PROTECTED_INTERNAL_PATH_SEGMENTS.join("|");
const protectedSegmentsCaseInsensitivePattern = PROTECTED_INTERNAL_PATH_SEGMENTS.map(
  (segment) => [...segment].map((character) => `[${character}${character.toUpperCase()}]`).join(""),
).join("|");
const protectedInternalSuffix = `(?:/${internalPathSegment})*${safeQuery}${safeHash}`;
const protectedSameSiteSuffix = `(?:/${absolutePathSegment})*${safeQuery}${safeHash}`;

export const PROTECTED_INTERNAL_RELATIVE_HREF_PATTERN =
  `^/(?:${protectedSegmentsPattern})${protectedInternalSuffix}$`;
export const PROTECTED_INTERNAL_SAME_SITE_HREF_PATTERN =
  `^https?://(?:www\\.)?klinikawfa\\.com/(?:${protectedSegmentsCaseInsensitivePattern})${protectedSameSiteSuffix}$`;

const protectedManagedHrefPatterns = [
  new RegExp(PROTECTED_INTERNAL_RELATIVE_HREF_PATTERN),
  new RegExp(PROTECTED_INTERNAL_SAME_SITE_HREF_PATTERN),
];

export function isSafeManagedHref(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= MANAGED_HREF_MAX_LENGTH &&
    MANAGED_HREF_GRAMMAR_PATTERNS.some((pattern) => new RegExp(pattern).test(value))
  );
}

export function isSafeManagedLinkHref(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= MANAGED_HREF_MAX_LENGTH &&
    MANAGED_LINK_GRAMMAR_PATTERNS.some((pattern) => new RegExp(pattern).test(value))
  );
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
export const managedLinkHrefSchema = z
  .string()
  .refine(isSafeManagedLinkHref, "Unsafe managed link");

export const websiteCtaHrefSchema = managedLinkHrefSchema.refine(
  (href) => !protectedManagedHrefPatterns.some((pattern) => pattern.test(href)),
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
