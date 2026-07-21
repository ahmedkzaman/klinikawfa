import {
  MANAGED_HREF_GRAMMAR_PATTERNS,
  MANAGED_LINK_GRAMMAR_PATTERNS,
  MANAGED_HREF_MAX_LENGTH,
  PROTECTED_INTERNAL_RELATIVE_HREF_PATTERN,
  PROTECTED_INTERNAL_SAME_SITE_HREF_PATTERN,
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
  maxLength: MANAGED_HREF_MAX_LENGTH,
  anyOf: MANAGED_HREF_GRAMMAR_PATTERNS.map((pattern) => ({ pattern })),
} as const;

const MANAGED_LINK_HREF_JSON_SCHEMA = {
  type: "string",
  minLength: 1,
  maxLength: MANAGED_HREF_MAX_LENGTH,
  anyOf: MANAGED_LINK_GRAMMAR_PATTERNS.map((pattern) => ({ pattern })),
} as const;

const WEBSITE_CTA_HREF_JSON_SCHEMA = {
  allOf: [
    MANAGED_LINK_HREF_JSON_SCHEMA,
    {
      not: { anyOf: [{ pattern: PROTECTED_INTERNAL_RELATIVE_HREF_PATTERN }, { pattern: PROTECTED_INTERNAL_SAME_SITE_HREF_PATTERN }] },
    },
  ],
} as const;

const HOME_LINK_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["label", "href"],
  properties: {
    label: BILINGUAL_TEXT_JSON_SCHEMA,
    href: MANAGED_LINK_HREF_JSON_SCHEMA,
  },
} as const;

const HOME_CAROUSEL_LABELS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["previous", "next", "goTo"],
  properties: {
    previous: BILINGUAL_TEXT_JSON_SCHEMA,
    next: BILINGUAL_TEXT_JSON_SCHEMA,
    goTo: BILINGUAL_TEXT_JSON_SCHEMA,
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
  required: ["hero", "why", "video", "services", "gallery", "testimonials", "map", "seo", "sectionOrder"],
  properties: {
    hero: {
      type: "object",
      additionalProperties: false,
      required: ["backgroundImage", "backgroundAlt", "backgroundOpacity", "autoplayMs", "slides", "ctas", "carouselLabels"],
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
        carouselLabels: HOME_CAROUSEL_LABELS_JSON_SCHEMA,
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
      required: ["eyebrow", "title", "description", "placeholder", "unsupportedMessage", "videoUrlSettingKey", "posterSettingKey"],
      properties: {
        eyebrow: BILINGUAL_TEXT_JSON_SCHEMA,
        title: BILINGUAL_TEXT_JSON_SCHEMA,
        description: BILINGUAL_TEXT_JSON_SCHEMA,
        placeholder: BILINGUAL_TEXT_JSON_SCHEMA,
        unsupportedMessage: BILINGUAL_TEXT_JSON_SCHEMA,
        videoUrlSettingKey: { enum: ["homepage_video_url"] },
        posterSettingKey: { enum: ["homepage_video_poster"] },
      },
    },
    services: {
      type: "object",
      additionalProperties: false,
      required: ["eyebrow", "title", "description", "cta", "learnMoreLabel", "itemLimit"],
      properties: {
        eyebrow: BILINGUAL_TEXT_JSON_SCHEMA,
        title: BILINGUAL_TEXT_JSON_SCHEMA,
        description: BILINGUAL_TEXT_JSON_SCHEMA,
        cta: HOME_LINK_JSON_SCHEMA,
        learnMoreLabel: BILINGUAL_TEXT_JSON_SCHEMA,
        itemLimit: { type: "integer", minimum: 1, maximum: 12 },
      },
    },
    gallery: {
      type: "object",
      additionalProperties: false,
      required: ["eyebrow", "title", "description", "cta", "emptyMessage", "moreLabel", "carouselLabels", "closeLabel", "previousLabel", "nextLabel", "swipeHint", "itemLimit"],
      properties: {
        eyebrow: BILINGUAL_TEXT_JSON_SCHEMA,
        title: BILINGUAL_TEXT_JSON_SCHEMA,
        description: BILINGUAL_TEXT_JSON_SCHEMA,
        cta: HOME_LINK_JSON_SCHEMA,
        emptyMessage: BILINGUAL_TEXT_JSON_SCHEMA,
        moreLabel: BILINGUAL_TEXT_JSON_SCHEMA,
        carouselLabels: HOME_CAROUSEL_LABELS_JSON_SCHEMA,
        closeLabel: BILINGUAL_TEXT_JSON_SCHEMA,
        previousLabel: BILINGUAL_TEXT_JSON_SCHEMA,
        nextLabel: BILINGUAL_TEXT_JSON_SCHEMA,
        swipeHint: BILINGUAL_TEXT_JSON_SCHEMA,
        itemLimit: { type: "integer", minimum: 1, maximum: 12 },
      },
    },
    testimonials: {
      type: "object",
      additionalProperties: false,
      required: ["eyebrow", "title", "description", "patientLabel", "goToSlideLabel", "previousSlideLabel", "nextSlideLabel", "carouselRoleDescription", "slideRoleDescription"],
      properties: {
        eyebrow: BILINGUAL_TEXT_JSON_SCHEMA,
        title: BILINGUAL_TEXT_JSON_SCHEMA,
        description: BILINGUAL_TEXT_JSON_SCHEMA,
        patientLabel: BILINGUAL_TEXT_JSON_SCHEMA,
        goToSlideLabel: BILINGUAL_TEXT_JSON_SCHEMA,
        previousSlideLabel: BILINGUAL_TEXT_JSON_SCHEMA,
        nextSlideLabel: BILINGUAL_TEXT_JSON_SCHEMA,
        carouselRoleDescription: BILINGUAL_TEXT_JSON_SCHEMA,
        slideRoleDescription: BILINGUAL_TEXT_JSON_SCHEMA,
      },
    },
    map: {
      type: "object",
      additionalProperties: false,
      required: ["eyebrow", "title", "description", "hoursLabel", "everydayLabel", "callLabel", "directionsCta", "embedUrl", "embedTitle"],
      properties: {
        eyebrow: BILINGUAL_TEXT_JSON_SCHEMA,
        title: BILINGUAL_TEXT_JSON_SCHEMA,
        description: BILINGUAL_TEXT_JSON_SCHEMA,
        hoursLabel: BILINGUAL_TEXT_JSON_SCHEMA,
        everydayLabel: BILINGUAL_TEXT_JSON_SCHEMA,
        callLabel: BILINGUAL_TEXT_JSON_SCHEMA,
        directionsCta: HOME_LINK_JSON_SCHEMA,
        embedUrl: SAFE_HREF_JSON_SCHEMA,
        embedTitle: BILINGUAL_TEXT_JSON_SCHEMA,
      },
    },
    seo: {
      type: "object",
      additionalProperties: false,
      required: ["title", "description"],
      properties: {
        title: BILINGUAL_TEXT_JSON_SCHEMA,
        description: BILINGUAL_TEXT_JSON_SCHEMA,
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
