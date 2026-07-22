import type { WebsiteResourceType } from "@/features/website-cms/resources/types";

type JsonSchema = Readonly<Record<string, unknown>>;

const strictObject = (required: readonly string[], properties: Record<string, unknown>): JsonSchema => ({
  $schema: "http://json-schema.org/draft-07/schema#",
  additionalProperties: false,
  properties,
  required,
  type: "object",
});

const text = { type: "string", minLength: 1 } as const;
const optionalText = { type: "string" } as const;
const textArray = { type: "array", items: text, maxItems: 30 } as const;

export const websiteResourceJsonSchemas: Readonly<Record<WebsiteResourceType, JsonSchema>> = {
  service: strictObject(["slug", "titleMs", "descriptionMs", "ctaMs", "servicesMs"], {
    slug: { enum: ["rawatan-am", "prosedur-minor", "pemeriksaan-kesihatan"] }, titleMs: text, titleEn: optionalText,
    descriptionMs: text, descriptionEn: optionalText, ctaMs: text, ctaEn: optionalText, servicesMs: textArray,
    servicesEn: textArray, heroImageUrl: optionalText, promoVideoUrl: optionalText,
  }),
  team_member: strictObject(["type", "nameMs", "titleMs", "bioMs", "expertiseMs", "qualifications", "yearsExperience", "isActive", "displayOrder"], {
    type: { enum: ["doctor", "team"] }, nameMs: text, nameEn: optionalText, titleMs: text, titleEn: optionalText,
    bioMs: text, bioEn: optionalText, expertiseMs: textArray, expertiseEn: textArray, qualifications: textArray,
    yearsExperience: { type: "integer", minimum: 0, maximum: 80 }, photoUrl: optionalText, isActive: { type: "boolean" }, displayOrder: { type: "integer", minimum: 0 },
  }),
  blog_post: strictObject(["slug", "titleMs", "excerptMs", "contentMs", "readingTime", "status"], {
    slug: text, titleMs: text, titleEn: optionalText, excerptMs: text, excerptEn: optionalText, contentMs: text,
    contentEn: optionalText, categoryId: { type: ["string", "null"] }, featuredImage: optionalText,
    readingTime: { type: "integer", minimum: 1 }, status: { enum: ["draft", "scheduled", "published", "archived"] }, scheduledAt: { type: ["string", "null"] },
  }),
  gallery_image: strictObject(["url", "altMs", "tags", "displayOrder", "visible"], {
    url: text, altMs: text, altEn: optionalText, tags: textArray, displayOrder: { type: "integer", minimum: 0 }, visible: { type: "boolean" },
  }),
  review: strictObject(["nameMs", "reviewTextMs", "rating", "sourceLabel", "status", "displayOrder"], {
    nameMs: text, nameEn: optionalText, reviewTextMs: text, reviewTextEn: optionalText, rating: { type: "integer", minimum: 1, maximum: 5 },
    sourceLabel: text, status: { enum: ["draft", "published", "archived"] }, displayOrder: { type: "integer", minimum: 0 },
  }),
};
