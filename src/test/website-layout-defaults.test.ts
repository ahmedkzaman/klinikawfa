import { describe, expect, it } from "vitest";

import {
  createDefaultGeneralPageLayout,
  createDefaultHomeLayout,
} from "@/features/website-cms/layout/defaults";
import { DEFAULT_HOME_CONTENT } from "@/features/website-cms/home/homeDefaults";
import { homeContentSchema } from "@/features/website-cms/schemas/home";
import {
  generalPageContentSchema,
  type GeneralPageContent,
} from "@/features/website-cms/schemas/page";

const generalPage: GeneralPageContent = {
  title: { ms: "Tentang", en: "About" },
  heroImage: null,
  heroAlt: { ms: "", en: "" },
  body: { ms: "<p>Isi</p>", en: "<p>Body</p>" },
  media: [],
  cta: null,
  seo: {
    title: { ms: "Tentang", en: "About" },
    description: { ms: "Maklumat", en: "Information" },
  },
  sections: [],
};

describe("website layout defaults", () => {
  it("preserves Home section order as full-width blocks", () => {
    expect(createDefaultHomeLayout(["hero", "video", "map"]).blocks).toMatchObject([
      {
        id: "hero",
        kind: "hero",
        contentRef: "hero",
        order: 0,
        desktop: { column: 1, width: 12, row: 1, height: 1 },
      },
      {
        id: "video",
        kind: "video",
        contentRef: "video",
        order: 1,
        desktop: { column: 1, width: 12, row: 2, height: 1 },
      },
      {
        id: "map",
        kind: "map",
        contentRef: "map",
        order: 2,
        desktop: { column: 1, width: 12, row: 3, height: 1 },
      },
    ]);
  });

  it("creates general-page blocks only for content that exists", () => {
    expect(createDefaultGeneralPageLayout(generalPage).blocks.map((block) => block.kind))
      .toEqual(["title", "body"]);

    expect(
      createDefaultGeneralPageLayout({
        ...generalPage,
        heroImage: "/images/hero.webp",
        media: [
          {
            type: "image",
            url: "/images/photo.webp",
            alt: { ms: "Foto", en: "Photo" },
          },
        ],
        cta: {
          label: { ms: "Hubungi", en: "Contact" },
          href: "/contact",
        },
      }).blocks.map((block) => block.kind),
    ).toEqual(["title", "hero", "body", "media", "cta"]);
  });

  it("keeps layout optional while strictly validating a supplied layout", () => {
    expect(homeContentSchema.safeParse(DEFAULT_HOME_CONTENT).success).toBe(true);
    expect(generalPageContentSchema.safeParse(generalPage).success).toBe(true);

    const layout = createDefaultGeneralPageLayout(generalPage);
    expect(
      generalPageContentSchema.safeParse({ ...generalPage, layout }).success,
    ).toBe(true);
    expect(
      generalPageContentSchema.safeParse({
        ...generalPage,
        layout: { ...layout, css: "position:fixed" },
      }).success,
    ).toBe(false);
  });
});
