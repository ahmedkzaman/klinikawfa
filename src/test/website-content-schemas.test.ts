import Ajv from "ajv";
import { describe, expect, it } from "vitest";

import {
  homeAutoplayMsSchema,
  homeBackgroundOpacitySchema,
  homeContentSchema,
  homeItemLimitSchema,
  homeSectionOrderSchema,
} from "@/features/website-cms/schemas/home";
import {
  RESERVED_PAGE_SLUGS,
  generalPageContentSchema,
  pageSlugSchema,
} from "@/features/website-cms/schemas/page";
import {
  PROTECTED_INTERNAL_PATH_SEGMENTS,
  safeHrefSchema,
  websiteCtaHrefSchema,
} from "@/features/website-cms/schemas/common";
import {
  GENERAL_PAGE_JSON_SCHEMA,
  HOME_JSON_SCHEMA,
} from "@/features/website-cms/schemas/jsonSchemas";

const ajv = new Ajv({ allErrors: true });
const validateHome = ajv.compile(HOME_JSON_SCHEMA);
const validateGeneralPage = ajv.compile(GENERAL_PAGE_JSON_SCHEMA);

const validGeneralPage = {
  title: { ms: "Halaman" },
  heroImage: null,
  heroAlt: { ms: "" },
  body: { ms: "<p>Kandungan</p>" },
  media: [],
  cta: null,
  seo: {
    title: { ms: "Halaman" },
    description: { ms: "Ringkasan" },
  },
};

const validHome = {
  hero: {
    backgroundImage: "https://cdn.example/hero.webp",
    backgroundAlt: { ms: "" },
    backgroundOpacity: 13,
    autoplayMs: 5000,
    slides: [{ title: { ms: "Klinik" }, subtitle: { ms: "Rawatan" } }],
    ctas: [{ label: { ms: "Hubungi" }, href: "/appointment" }],
  },
  why: {
    eyebrow: { ms: "Mengapa" },
    title: { ms: "Pilih Kami" },
    description: { ms: "Rawatan berkualiti" },
    items: [{ icon: "clock", title: { ms: "Setiap hari" }, description: { ms: "Buka" } }],
  },
  video: {
    eyebrow: { ms: "Video" },
    title: { ms: "Klinik" },
    description: { ms: "Lawati kami" },
    videoUrlSettingKey: "homepage_video_url",
    posterSettingKey: "homepage_video_poster",
  },
  services: {
    eyebrow: { ms: "Perkhidmatan" },
    title: { ms: "Rawatan" },
    description: { ms: "Untuk anda" },
    cta: { label: { ms: "Lihat semua" }, href: "/services" },
    itemLimit: 6,
  },
  gallery: {
    eyebrow: { ms: "Galeri" },
    title: { ms: "Klinik kami" },
    description: { ms: "Suasana" },
    cta: { label: { ms: "Lihat semua" }, href: "/gallery" },
    itemLimit: 8,
  },
  testimonials: {
    eyebrow: { ms: "Testimoni" },
    title: { ms: "Pesakit" },
    description: { ms: "Keutamaan" },
  },
  map: {
    eyebrow: { ms: "Cari kami" },
    title: { ms: "Lokasi" },
    description: { ms: "Kuantan" },
    directionsCta: { label: { ms: "Arah" }, href: "https://maps.example/directions" },
    embedUrl: "https://maps.example/embed",
  },
  sectionOrder: ["hero", "why", "video", "services", "gallery", "testimonials", "map"],
};

function expectPairedResult(
  schema: typeof homeContentSchema | typeof generalPageContentSchema,
  validate: typeof validateHome | typeof validateGeneralPage,
  value: unknown,
  accepted: boolean,
) {
  expect(schema.safeParse(value).success).toBe(accepted);
  expect(validate(value)).toBe(accepted);
}

describe("website content schemas", () => {
  it("applies English defaults while Draft 7 accepts omitted English at every bilingual nesting level", () => {
    const parsedPage = generalPageContentSchema.parse(validGeneralPage);
    const parsedHome = homeContentSchema.parse(validHome);

    expect(parsedPage.title.en).toBe("");
    expect(parsedPage.seo.description.en).toBe("");
    expect(parsedHome.hero.slides[0].title.en).toBe("");
    expect(parsedHome.why.items[0].description.en).toBe("");
    expect(validateGeneralPage(validGeneralPage)).toBe(true);
    expect(validateHome(validHome)).toBe(true);
  });

  it.each([
    { name: "valid general page", schema: generalPageContentSchema, validate: validateGeneralPage, value: validGeneralPage, accepted: true },
    { name: "nested unknown general-page key", schema: generalPageContentSchema, validate: validateGeneralPage, value: { ...validGeneralPage, media: [{ type: "image", url: "https://cdn.example/image.webp", alt: { ms: "Imej" }, unexpected: true }] }, accepted: false },
    { name: "valid Home", schema: homeContentSchema, validate: validateHome, value: validHome, accepted: true },
    { name: "nested unknown Home key", schema: homeContentSchema, validate: validateHome, value: { ...validHome, hero: { ...validHome.hero, unexpected: true } }, accepted: false },
    { name: "duplicate Home section", schema: homeContentSchema, validate: validateHome, value: { ...validHome, sectionOrder: ["hero", "hero"] }, accepted: false },
    { name: "unknown Home section", schema: homeContentSchema, validate: validateHome, value: { ...validHome, sectionOrder: ["hero", "payments"] }, accepted: false },
  ])("keeps Zod and Draft 7 aligned for $name", ({ schema, validate, value, accepted }) => {
    expectPairedResult(schema, validate, value, accepted);
  });

  it.each([
    [5, true],
    [25, true],
    [4, false],
    [26, false],
  ])("enforces Home opacity boundary %s", (opacity, accepted) => {
    expect(homeBackgroundOpacitySchema.safeParse(opacity).success).toBe(accepted);
    expectPairedResult(homeContentSchema, validateHome, { ...validHome, hero: { ...validHome.hero, backgroundOpacity: opacity } }, accepted);
  });

  it.each([
    [3000, true],
    [15000, true],
    [2999, false],
    [15001, false],
    [5000.5, false],
  ])("enforces Home autoplay boundary %s", (autoplayMs, accepted) => {
    expect(homeAutoplayMsSchema.safeParse(autoplayMs).success).toBe(accepted);
    expectPairedResult(homeContentSchema, validateHome, { ...validHome, hero: { ...validHome.hero, autoplayMs } }, accepted);
  });

  it.each([
    [1, true],
    [12, true],
    [0, false],
    [13, false],
    [1.5, false],
  ])("enforces configured item-limit boundary %s without capping testimonials", (itemLimit, accepted) => {
    expect(homeItemLimitSchema.safeParse(itemLimit).success).toBe(accepted);
    expectPairedResult(homeContentSchema, validateHome, { ...validHome, services: { ...validHome.services, itemLimit } }, accepted);
  });

  it.each([
    [0, false],
    [1, true],
    [12, true],
    [13, false],
  ])("enforces Home slide-array boundary %s", (count, accepted) => {
    const slides = Array.from({ length: count }, () => ({
      title: { ms: "Klinik" },
      subtitle: { ms: "Rawatan" },
    }));
    expectPairedResult(homeContentSchema, validateHome, {
      ...validHome,
      hero: { ...validHome.hero, slides },
    }, accepted);
  });

  it.each([
    [0, true],
    [12, true],
    [13, false],
  ])("enforces general-page media-array boundary %s", (count, accepted) => {
    const media = Array.from({ length: count }, () => ({
      type: "image" as const,
      url: "https://cdn.example/image.webp",
      alt: { ms: "Imej" },
    }));
    expectPairedResult(generalPageContentSchema, validateGeneralPage, {
      ...validGeneralPage,
      media,
    }, accepted);
  });

  it("does not require or expose a testimonial item limit", () => {
    expect(homeContentSchema.safeParse(validHome).success).toBe(true);
    expect(validateHome(validHome)).toBe(true);
    expectPairedResult(homeContentSchema, validateHome, { ...validHome, testimonials: { ...validHome.testimonials, itemLimit: 3 } }, false);
  });

  it.each([
    ["/services", true],
    ["/appointment", true],
    ["https://example.test/health", true],
    ["http://example.test/health", true],
    ["mailto:hello@example.test", true],
    ["tel:+6091234567", true],
    ["#contact", true],
    ["//example.test", false],
    ["\\clinic", false],
    ["/clinic\\patients", false],
    ["/safe\u0000path", false],
    ["/public/../clinic", false],
    ["/public/%2e%2e/clinic", false],
    ["/%2fclinic", false],
    ["http://#", false],
  ])("keeps safe-href Zod and Draft 7 results aligned for %j", (href, accepted) => {
    expect(safeHrefSchema.safeParse(href).success).toBe(accepted);
    expectPairedResult(generalPageContentSchema, validateGeneralPage, { ...validGeneralPage, heroImage: href }, accepted);
  });

  it.each(PROTECTED_INTERNAL_PATH_SEGMENTS)("rejects every protected prefix through canonical CTA paths: %s", (segment) => {
    const ctaValues = [
      `/${segment}?source=editor`,
      `/${segment.toUpperCase()}#preview`,
      `https://example.test/${segment}/nested`,
      `/public/../${segment}`,
      `/public/%2e%2e/${segment}`,
    ];

    for (const href of ctaValues) {
      expect(websiteCtaHrefSchema.safeParse(href).success).toBe(false);
      expectPairedResult(generalPageContentSchema, validateGeneralPage, {
        ...validGeneralPage,
        cta: { label: { ms: "Baca lanjut" }, href },
      }, false);
    }
  });

  it.each(RESERVED_PAGE_SLUGS)("rejects reserved slug %s", (slug) => {
    expect(pageSlugSchema.safeParse(slug).success).toBe(false);
  });

  it.each([
    ["a", true],
    ["a".repeat(100), true],
    ["a".repeat(101), false],
    ["Clinic", false],
    ["two--hyphens", false],
    ["-leading", false],
    ["trailing-", false],
    ["two words", false],
    [" clinic ", false],
    [" page ", false],
  ])("enforces page slug boundary and syntax %j", (slug, accepted) => {
    expect(pageSlugSchema.safeParse(slug).success).toBe(accepted);
  });

  it("exports Draft 7 schemas with closed roots", () => {
    expect(HOME_JSON_SCHEMA.$schema).toBe("http://json-schema.org/draft-07/schema#");
    expect(HOME_JSON_SCHEMA.additionalProperties).toBe(false);
    expect(GENERAL_PAGE_JSON_SCHEMA.$schema).toBe("http://json-schema.org/draft-07/schema#");
    expect(GENERAL_PAGE_JSON_SCHEMA.additionalProperties).toBe(false);
  });
});
