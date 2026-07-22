import { z } from "zod";

const id = z.string().uuid();
const text = z.string().max(20_000);
const shortText = z.string().max(300);
const spacing = z.enum(["compact", "normal", "spacious"]);
const alignment = z.enum(["left", "center", "right"]);

function isSafeRootOrHttpsUrl(value: string): boolean {
  if (
    value.startsWith("/")
    && value[1] !== "/"
    && value[1] !== "\\"
  ) return true;

  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

const mediaUrl = z.string().max(2_048).refine(
  (value) => value === "" || isSafeRootOrHttpsUrl(value),
  "Use a safe media URL",
);
const baseShape = { id, visible: z.boolean(), spacing };

const youtubeUrl = z.string().url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && (url.hostname === "www.youtube.com" || url.hostname === "youtube.com" || url.hostname === "youtu.be");
}, "Use a valid YouTube URL");

const heroSectionSchema = z.object({
  ...baseShape,
  type: z.literal("hero"),
  headingMs: shortText,
  headingEn: shortText,
  bodyMs: text,
  bodyEn: text,
  mediaId: id.nullable(),
  mediaUrl: mediaUrl.optional().default(""),
  mediaAltMs: shortText.optional().default(""),
  mediaAltEn: shortText.optional().default(""),
  alignment,
}).strict();

const richTextSectionSchema = z.object({
  ...baseShape,
  type: z.literal("rich_text"),
  contentMs: text,
  contentEn: text,
  alignment,
}).strict();

const imageTextSectionSchema = z.object({
  ...baseShape,
  type: z.literal("image_text"),
  headingMs: shortText,
  headingEn: shortText,
  bodyMs: text,
  bodyEn: text,
  mediaId: id.nullable(),
  mediaUrl: mediaUrl.optional().default(""),
  mediaAltMs: shortText.optional().default(""),
  mediaAltEn: shortText.optional().default(""),
  imagePosition: z.enum(["left", "right"]),
}).strict();

function collectionSection<T extends "services" | "team" | "gallery" | "reviews">(type: T) {
  return z.object({
    ...baseShape,
    type: z.literal(type),
    headingMs: shortText,
    headingEn: shortText,
    selectedIds: z.array(id).max(24),
  }).strict();
}

const ctaSectionSchema = z.object({
  ...baseShape,
  type: z.literal("cta"),
  headingMs: shortText,
  headingEn: shortText,
  bodyMs: text,
  bodyEn: text,
  buttonLabelMs: shortText,
  buttonLabelEn: shortText,
  href: z.string().max(500).refine(isSafeRootOrHttpsUrl, "Use a safe link"),
  alignment,
}).strict();

const youtubeSectionSchema = z.object({
  ...baseShape,
  type: z.literal("youtube"),
  titleMs: shortText,
  titleEn: shortText,
  url: youtubeUrl,
}).strict();

const faqItemSchema = z.object({
  id,
  questionMs: shortText,
  questionEn: shortText,
  answerMs: text,
  answerEn: text,
}).strict();

const faqSectionSchema = z.object({
  ...baseShape,
  type: z.literal("faq"),
  headingMs: shortText,
  headingEn: shortText,
  items: z.array(faqItemSchema).max(30),
}).strict();

const contactSectionSchema = z.object({
  ...baseShape,
  type: z.literal("contact"),
  headingMs: shortText,
  headingEn: shortText,
  bodyMs: text,
  bodyEn: text,
  showAddress: z.boolean(),
  showHours: z.boolean(),
  showPhone: z.boolean(),
  showMap: z.boolean(),
}).strict();

export const pageSectionSchema = z.discriminatedUnion("type", [
  heroSectionSchema,
  richTextSectionSchema,
  imageTextSectionSchema,
  collectionSection("services"),
  collectionSection("team"),
  collectionSection("gallery"),
  collectionSection("reviews"),
  ctaSectionSchema,
  youtubeSectionSchema,
  faqSectionSchema,
  contactSectionSchema,
]);

export const pageSectionsSchema = z.array(pageSectionSchema).max(40);

export type PageSection = z.infer<typeof pageSectionSchema>;
export type PageSectionType = PageSection["type"];
