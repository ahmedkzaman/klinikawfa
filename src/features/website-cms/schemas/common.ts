import { z } from "zod";

import { isSafeUrl } from "@/lib/security";

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

export const safeHrefSchema = z.string().trim().refine(isSafeUrl, "Unsafe URL");

const protectedInternalPrefix =
  /^\/(?:auth|staff|clinic|editor|appointment|video-call|reset-password|locum-register|tv|api|functions|payment|payments|callback)(?:\/|$)/;

export const websiteCtaHrefSchema = safeHrefSchema.refine(
  (href) => !protectedInternalPrefix.test(href),
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
