import { z } from "zod";

import {
  bilingualTextSchema,
  requiredBilingualTextSchema,
  safeHrefSchema,
  safeMediaSchema,
  websiteCtaHrefSchema,
} from "./common";

export const RESERVED_PAGE_SLUGS = [
  "auth",
  "staff",
  "clinic",
  "appointment",
  "services",
  "doctors",
  "doctor-on-duty",
  "gallery",
  "health-tips",
  "editor",
  "privacy",
  "terms",
  "video-call",
  "tv",
  "reset-password",
  "locum-register",
  "api",
  "functions",
] as const;

const reservedPageSlugs = new Set<string>(RESERVED_PAGE_SLUGS);

export const pageSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid page slug")
  .refine((slug) => !reservedPageSlugs.has(slug), "Reserved page slug");

const generalPageCtaSchema = z
  .object({
    label: requiredBilingualTextSchema,
    href: websiteCtaHrefSchema,
  })
  .strict();

const generalPageSeoSchema = z
  .object({
    title: requiredBilingualTextSchema,
    description: requiredBilingualTextSchema,
  })
  .strict();

// Rich HTML is deliberately stored as content. It is sanitized only by the
// preview and public rendering boundaries, never treated as trusted schema data.
export const generalPageContentSchema = z
  .object({
    title: requiredBilingualTextSchema,
    heroImage: safeHrefSchema.nullable(),
    heroAlt: bilingualTextSchema,
    body: requiredBilingualTextSchema,
    media: z.array(safeMediaSchema).max(12),
    cta: generalPageCtaSchema.nullable(),
    seo: generalPageSeoSchema,
  })
  .strict();

export type GeneralPageContent = z.infer<typeof generalPageContentSchema>;
