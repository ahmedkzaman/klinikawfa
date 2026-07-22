import { z } from "zod";

import {
  contentStatusSchema,
} from "@/features/website-cms/domain/content";
import {
  emptySeoFields,
  seoFieldsSchema,
} from "@/features/website-cms/domain/seo";
import { WEBSITE_RESOURCE_TYPES } from "@/features/website-cms/resources/types";

const requiredText = z.string().trim().min(1).max(20_000);
const optionalText = z.string().trim().max(20_000).optional().default("");
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120);
const safePublicUrl = z.string().trim().max(2_048).refine((value) => {
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}, "Use a root-relative path or HTTPS URL");

export const websiteResourceTypeSchema = z.enum(WEBSITE_RESOURCE_TYPES);

export const serviceDraftSchema = z.object({
  slug: z.enum(["rawatan-am", "prosedur-minor", "pemeriksaan-kesihatan"]),
  titleMs: requiredText,
  titleEn: optionalText,
  descriptionMs: requiredText,
  descriptionEn: optionalText,
  ctaMs: requiredText,
  ctaEn: optionalText,
  servicesMs: z.array(requiredText.max(300)).min(1).max(30),
  servicesEn: z.array(z.string().trim().max(300)).max(30).optional().default([]),
  heroImageUrl: safePublicUrl.optional().or(z.literal("")),
  promoVideoUrl: safePublicUrl.optional().or(z.literal("")),
}).strict();

export const teamMemberDraftSchema = z.object({
  type: z.enum(["doctor", "team"]),
  nameMs: requiredText.max(200),
  nameEn: optionalText,
  titleMs: requiredText.max(200),
  titleEn: optionalText,
  bioMs: requiredText,
  bioEn: optionalText,
  expertiseMs: z.array(requiredText.max(200)).max(30),
  expertiseEn: z.array(z.string().trim().max(200)).max(30).optional().default([]),
  qualifications: z.array(requiredText.max(200)).max(30),
  yearsExperience: z.number().int().min(0).max(80),
  photoUrl: safePublicUrl.optional().or(z.literal("")),
  isActive: z.boolean(),
  displayOrder: z.number().int().min(0).max(10_000),
}).strict();

export const blogPostDraftSchema = z.object({
  slug,
  titleMs: requiredText.max(300),
  titleEn: optionalText,
  excerptMs: requiredText.max(1_000),
  excerptEn: optionalText,
  contentMs: requiredText,
  contentEn: optionalText,
  categoryId: z.string().uuid().optional().nullable(),
  tagIds: z.array(z.string().uuid()).max(30).optional().default([]),
  authorId: z.string().uuid().optional().nullable(),
  featuredImage: safePublicUrl.optional().or(z.literal("")),
  featuredImageMediaId: z.string().uuid().nullable().optional().default(null),
  readingTime: z.number().int().min(1).max(240),
  status: contentStatusSchema,
  scheduledAt: z.string().datetime({ offset: true }).optional().nullable(),
  seoMs: seoFieldsSchema.optional().default(emptySeoFields),
  seoEn: seoFieldsSchema.optional().default(emptySeoFields),
}).strict().superRefine((value, context) => {
  if (value.status === "scheduled" && !value.scheduledAt) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["scheduledAt"], message: "Scheduled posts require a date" });
  }
  if (value.status !== "scheduled" && value.scheduledAt) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["scheduledAt"], message: "Only scheduled posts may have a date" });
  }
});

export const galleryImageDraftSchema = z.object({
  url: safePublicUrl,
  altMs: requiredText.max(500),
  altEn: optionalText,
  tags: z.array(z.string().trim().min(1).max(50)).max(20),
  displayOrder: z.number().int().min(0).max(10_000),
  visible: z.boolean(),
}).strict();

export const reviewDraftSchema = z.object({
  nameMs: requiredText.max(200),
  nameEn: optionalText,
  reviewTextMs: requiredText.max(4_000),
  reviewTextEn: optionalText,
  rating: z.number().int().min(1).max(5),
  sourceLabel: requiredText.max(100),
  status: z.enum(["draft", "published", "archived"]),
  displayOrder: z.number().int().min(0).max(10_000),
}).strict();

export type ServiceDraft = z.infer<typeof serviceDraftSchema>;
export type TeamMemberDraft = z.infer<typeof teamMemberDraftSchema>;
export type BlogPostDraft = z.infer<typeof blogPostDraftSchema>;
export type GalleryImageDraft = z.infer<typeof galleryImageDraftSchema>;
export type ReviewDraft = z.infer<typeof reviewDraftSchema>;
