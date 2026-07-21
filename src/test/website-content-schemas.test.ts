import { describe, expect, it } from "vitest";

import {
  homeBackgroundOpacitySchema,
  homeContentSchema,
  homeSectionOrderSchema,
} from "@/features/website-cms/schemas/home";
import {
  generalPageContentSchema,
  pageSlugSchema,
} from "@/features/website-cms/schemas/page";
import {
  safeHrefSchema,
  websiteCtaHrefSchema,
} from "@/features/website-cms/schemas/common";
import {
  GENERAL_PAGE_JSON_SCHEMA,
  HOME_JSON_SCHEMA,
} from "@/features/website-cms/schemas/jsonSchemas";

const validGeneralPage = {
  title: { ms: "Halaman", en: "" },
  heroImage: null,
  heroAlt: { ms: "", en: "" },
  body: { ms: "<p>Kandungan</p>", en: "" },
  media: [],
  cta: null,
  seo: {
    title: { ms: "Halaman", en: "" },
    description: { ms: "Ringkasan", en: "" },
  },
};

const validHome = {
  hero: {
    backgroundImage: "https://cdn.example/hero.webp",
    backgroundAlt: { ms: "", en: "" },
    backgroundOpacity: 13,
    autoplayMs: 5000,
    slides: [{ title: { ms: "Klinik", en: "" }, subtitle: { ms: "Rawatan", en: "" } }],
    ctas: [{ label: { ms: "Hubungi", en: "" }, href: "/contact" }],
  },
  why: {
    eyebrow: { ms: "Mengapa", en: "" },
    title: { ms: "Pilih Kami", en: "" },
    description: { ms: "Rawatan berkualiti", en: "" },
    items: [{ icon: "clock", title: { ms: "Setiap hari", en: "" }, description: { ms: "Buka", en: "" } }],
  },
  video: {
    eyebrow: { ms: "Video", en: "" },
    title: { ms: "Klinik", en: "" },
    description: { ms: "Lawati kami", en: "" },
    videoUrlSettingKey: "homepage_video_url",
    posterSettingKey: "homepage_video_poster",
  },
  services: {
    eyebrow: { ms: "Perkhidmatan", en: "" },
    title: { ms: "Rawatan", en: "" },
    description: { ms: "Untuk anda", en: "" },
    cta: { label: { ms: "Lihat semua", en: "" }, href: "/services" },
    itemLimit: 6,
  },
  gallery: {
    eyebrow: { ms: "Galeri", en: "" },
    title: { ms: "Klinik kami", en: "" },
    description: { ms: "Suasana", en: "" },
    cta: { label: { ms: "Lihat semua", en: "" }, href: "/gallery" },
    itemLimit: 8,
  },
  testimonials: {
    eyebrow: { ms: "Testimoni", en: "" },
    title: { ms: "Pesakit", en: "" },
    description: { ms: "Keutamaan", en: "" },
    itemLimit: 3,
  },
  map: {
    eyebrow: { ms: "Cari kami", en: "" },
    title: { ms: "Lokasi", en: "" },
    description: { ms: "Kuantan", en: "" },
    directionsCta: { label: { ms: "Arah", en: "" }, href: "https://maps.example/directions" },
    embedUrl: "https://maps.example/embed",
  },
  sectionOrder: ["hero", "why", "video", "services", "gallery", "testimonials", "map"],
};

const schemaFixtures = [
  { name: "valid general page", schema: generalPageContentSchema, value: validGeneralPage, accepted: true },
  { name: "rejects extra general-page keys", schema: generalPageContentSchema, value: { ...validGeneralPage, unexpected: true }, accepted: false },
  { name: "rejects an unsafe media URL", schema: generalPageContentSchema, value: { ...validGeneralPage, media: [{ type: "image", url: "javascript:alert(1)", alt: { ms: "Imej", en: "" } }] }, accepted: false },
  { name: "valid Home", schema: homeContentSchema, value: validHome, accepted: true },
  { name: "rejects duplicate Home sections", schema: homeContentSchema, value: { ...validHome, sectionOrder: ["hero", "hero"] }, accepted: false },
  { name: "rejects an out-of-range Home item limit", schema: homeContentSchema, value: { ...validHome, services: { ...validHome.services, itemLimit: 13 } }, accepted: false },
  { name: "rejects a non-allowlisted video setting key", schema: homeContentSchema, value: { ...validHome, video: { ...validHome.video, videoUrlSettingKey: "staff_private_video" } }, accepted: false },
] as const;

describe("website content schemas", () => {
  it("requires Malay and permits empty English fallback", () => {
    expect(generalPageContentSchema.safeParse(validGeneralPage).success).toBe(true);
    expect(generalPageContentSchema.safeParse({ ...validGeneralPage, title: { ms: "  ", en: "Title" } }).success).toBe(false);
  });

  it("rejects reserved slugs and unsafe CTA URLs", () => {
    expect(pageSlugSchema.safeParse("clinic").success).toBe(false);
    expect(safeHrefSchema.safeParse("javascript:alert(1)").success).toBe(false);
    expect(websiteCtaHrefSchema.safeParse("/clinic/patients").success).toBe(false);
  });

  it.each([4, 26])("rejects background opacity %s", (opacity) => {
    expect(homeBackgroundOpacitySchema.safeParse(opacity).success).toBe(false);
  });

  it("rejects unknown Home sections", () => {
    expect(homeSectionOrderSchema.safeParse(["hero", "payments"]).success).toBe(false);
  });

  it.each(schemaFixtures)("$name", ({ schema, value, accepted }) => {
    expect(schema.safeParse(value).success).toBe(accepted);
  });

  it("exports Draft 7 schemas with closed objects", () => {
    expect(HOME_JSON_SCHEMA.$schema).toBe("http://json-schema.org/draft-07/schema#");
    expect(HOME_JSON_SCHEMA.additionalProperties).toBe(false);
    expect(GENERAL_PAGE_JSON_SCHEMA.$schema).toBe("http://json-schema.org/draft-07/schema#");
    expect(GENERAL_PAGE_JSON_SCHEMA.additionalProperties).toBe(false);
  });
});
