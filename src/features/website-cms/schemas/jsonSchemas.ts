import {
  PROTECTED_INTERNAL_HTTP_HREF_PATTERN,
  PROTECTED_INTERNAL_RELATIVE_HREF_PATTERN,
  SAFE_HREF_DOT_SEGMENT_PATTERN,
  SAFE_HREF_ENCODED_PATH_BYPASS_PATTERN,
  SAFE_HREF_FORBIDDEN_CHARACTERS_PATTERN,
} from "./common";

const DRAFT_7 = "http://json-schema.org/draft-07/schema#";

const BILINGUAL_TEXT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ms"],
  properties: {
    ms: { type: "string", pattern: "\\S" },
    en: { type: "string", default: "" },
  },
} as const;

const OPTIONAL_BILINGUAL_TEXT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ms"],
  properties: {
    ms: { type: "string" },
    en: { type: "string", default: "" },
  },
} as const;

const SAFE_HREF_JSON_SCHEMA = {
  type: "string",
  minLength: 1,
  allOf: [
    { not: { pattern: SAFE_HREF_FORBIDDEN_CHARACTERS_PATTERN } },
    { not: { pattern: SAFE_HREF_ENCODED_PATH_BYPASS_PATTERN } },
    { not: { pattern: SAFE_HREF_DOT_SEGMENT_PATTERN } },
  ],
  anyOf: [
    { pattern: "^/(?!/)" },
    { pattern: "^#" },
    {
      allOf: [
        { pattern: "^[hH][tT][tT][pP][sS]?://[^/?#]+" },
        { format: "uri" },
      ],
    },
    { allOf: [{ pattern: "^[mM][aA][iI][lL][tT][oO]:" }, { format: "uri" }] },
    { allOf: [{ pattern: "^[tT][eE][lL]:" }, { format: "uri" }] },
  ],
} as const;

const WEBSITE_CTA_HREF_JSON_SCHEMA = {
  allOf: [
    SAFE_HREF_JSON_SCHEMA,
    {
      not: { anyOf: [{ pattern: PROTECTED_INTERNAL_RELATIVE_HREF_PATTERN }, { pattern: PROTECTED_INTERNAL_HTTP_HREF_PATTERN }] },
    },
  ],
} as const;

const HOME_LINK_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["label", "href"],
  properties: {
    label: BILINGUAL_TEXT_JSON_SCHEMA,
    href: SAFE_HREF_JSON_SCHEMA,
  },
} as const;

const HOME_SECTION_IDS = [
  "hero",
  "why",
  "video",
  "services",
  "gallery",
  "testimonials",
  "map",
] as const;

export const HOME_JSON_SCHEMA = {
  $schema: DRAFT_7,
  type: "object",
  additionalProperties: false,
  required: ["hero", "why", "video", "services", "gallery", "testimonials", "map", "sectionOrder"],
  properties: {
    hero: {
      type: "object",
      additionalProperties: false,
      required: ["backgroundImage", "backgroundAlt", "backgroundOpacity", "autoplayMs", "slides", "ctas"],
      properties: {
        backgroundImage: SAFE_HREF_JSON_SCHEMA,
        backgroundAlt: OPTIONAL_BILINGUAL_TEXT_JSON_SCHEMA,
        backgroundOpacity: { type: "number", minimum: 5, maximum: 25 },
        autoplayMs: { type: "integer", minimum: 3000, maximum: 15000 },
        slides: {
          type: "array",
          minItems: 1,
          maxItems: 12,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["title", "subtitle"],
            properties: { title: BILINGUAL_TEXT_JSON_SCHEMA, subtitle: BILINGUAL_TEXT_JSON_SCHEMA },
          },
        },
        ctas: { type: "array", minItems: 1, maxItems: 12, items: HOME_LINK_JSON_SCHEMA },
      },
    },
    why: {
      type: "object",
      additionalProperties: false,
      required: ["eyebrow", "title", "description", "items"],
      properties: {
        eyebrow: BILINGUAL_TEXT_JSON_SCHEMA,
        title: BILINGUAL_TEXT_JSON_SCHEMA,
        description: BILINGUAL_TEXT_JSON_SCHEMA,
        items: {
          type: "array",
          minItems: 1,
          maxItems: 12,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["icon", "title", "description"],
            properties: {
              icon: { enum: ["clock", "sofa", "users", "user-check", "scissors", "ear"] },
              title: BILINGUAL_TEXT_JSON_SCHEMA,
              description: BILINGUAL_TEXT_JSON_SCHEMA,
            },
          },
        },
      },
    },
    video: {
      type: "object",
      additionalProperties: false,
      required: ["eyebrow", "title", "description", "videoUrlSettingKey", "posterSettingKey"],
      properties: {
        eyebrow: BILINGUAL_TEXT_JSON_SCHEMA,
        title: BILINGUAL_TEXT_JSON_SCHEMA,
        description: BILINGUAL_TEXT_JSON_SCHEMA,
        videoUrlSettingKey: { enum: ["homepage_video_url"] },
        posterSettingKey: { enum: ["homepage_video_poster"] },
      },
    },
    services: {
      type: "object",
      additionalProperties: false,
      required: ["eyebrow", "title", "description", "cta", "itemLimit"],
      properties: {
        eyebrow: BILINGUAL_TEXT_JSON_SCHEMA,
        title: BILINGUAL_TEXT_JSON_SCHEMA,
        description: BILINGUAL_TEXT_JSON_SCHEMA,
        cta: HOME_LINK_JSON_SCHEMA,
        itemLimit: { type: "integer", minimum: 1, maximum: 12 },
      },
    },
    gallery: {
      type: "object",
      additionalProperties: false,
      required: ["eyebrow", "title", "description", "cta", "itemLimit"],
      properties: {
        eyebrow: BILINGUAL_TEXT_JSON_SCHEMA,
        title: BILINGUAL_TEXT_JSON_SCHEMA,
        description: BILINGUAL_TEXT_JSON_SCHEMA,
        cta: HOME_LINK_JSON_SCHEMA,
        itemLimit: { type: "integer", minimum: 1, maximum: 12 },
      },
    },
    testimonials: {
      type: "object",
      additionalProperties: false,
      required: ["eyebrow", "title", "description"],
      properties: {
        eyebrow: BILINGUAL_TEXT_JSON_SCHEMA,
        title: BILINGUAL_TEXT_JSON_SCHEMA,
        description: BILINGUAL_TEXT_JSON_SCHEMA,
      },
    },
    map: {
      type: "object",
      additionalProperties: false,
      required: ["eyebrow", "title", "description", "directionsCta", "embedUrl"],
      properties: {
        eyebrow: BILINGUAL_TEXT_JSON_SCHEMA,
        title: BILINGUAL_TEXT_JSON_SCHEMA,
        description: BILINGUAL_TEXT_JSON_SCHEMA,
        directionsCta: HOME_LINK_JSON_SCHEMA,
        embedUrl: SAFE_HREF_JSON_SCHEMA,
      },
    },
    sectionOrder: {
      type: "array",
      minItems: 1,
      maxItems: 7,
      uniqueItems: true,
      items: { enum: HOME_SECTION_IDS },
    },
  },
} as const;

export const GENERAL_PAGE_JSON_SCHEMA = {
  $schema: DRAFT_7,
  type: "object",
  additionalProperties: false,
  required: ["title", "heroImage", "heroAlt", "body", "media", "cta", "seo"],
  properties: {
    title: BILINGUAL_TEXT_JSON_SCHEMA,
    heroImage: { anyOf: [SAFE_HREF_JSON_SCHEMA, { type: "null" }] },
    heroAlt: OPTIONAL_BILINGUAL_TEXT_JSON_SCHEMA,
    body: BILINGUAL_TEXT_JSON_SCHEMA,
    media: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "url", "alt"],
        properties: {
          type: { enum: ["image", "video"] },
          url: SAFE_HREF_JSON_SCHEMA,
          alt: OPTIONAL_BILINGUAL_TEXT_JSON_SCHEMA,
        },
      },
    },
    cta: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["label", "href"],
          properties: { label: BILINGUAL_TEXT_JSON_SCHEMA, href: WEBSITE_CTA_HREF_JSON_SCHEMA },
        },
        { type: "null" },
      ],
    },
    seo: {
      type: "object",
      additionalProperties: false,
      required: ["title", "description"],
      properties: { title: BILINGUAL_TEXT_JSON_SCHEMA, description: BILINGUAL_TEXT_JSON_SCHEMA },
    },
  },
} as const;
