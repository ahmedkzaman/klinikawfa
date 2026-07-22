import { describe, expect, it } from "vitest";

import {
  contentStatusSchema,
  seoFieldsSchema,
} from "@/features/website-cms/domain/content";
import { contentListQuerySchema } from "@/features/website-cms/domain/content";
import { blogPostDraftSchema } from "@/features/website-cms/resources/schemas";

describe("website CMS domain", () => {
  it("accepts only the closed CMS lifecycle", () => {
    expect(contentStatusSchema.options).toEqual([
      "draft",
      "scheduled",
      "published",
      "trash",
    ]);
    expect(contentStatusSchema.safeParse("archived").success).toBe(false);
  });

  it("requires safe SEO metadata", () => {
    const result = seoFieldsSchema.parse({
      title: "Klinik Awfa",
      description: "Rawatan keluarga di Shah Alam.",
      canonicalUrl: "https://klinikawfa.com/",
      socialTitle: "Klinik Awfa",
      socialDescription: "Rawatan keluarga.",
      socialImageMediaId: null,
      index: true,
      follow: true,
    });

    expect(result.index).toBe(true);
    expect(
      seoFieldsSchema.safeParse({ ...result, canonicalUrl: "https://evil.example/" })
        .success,
    ).toBe(false);
  });

  it("normalizes safe list defaults and restricts page sizes", () => {
    expect(contentListQuerySchema.parse({})).toEqual({
      status: "all",
      search: "",
      sort: "updated_desc",
      page: 1,
      pageSize: 20,
    });
    expect(contentListQuerySchema.safeParse({ pageSize: 25 }).success).toBe(false);
  });

  it("requires a schedule only for scheduled posts and accepts SEO/media fields", () => {
    const basePost = {
      slug: "family-health",
      titleMs: "Kesihatan keluarga",
      titleEn: "Family health",
      excerptMs: "Panduan ringkas.",
      excerptEn: "A short guide.",
      contentMs: "<p>Kandungan</p>",
      contentEn: "<p>Content</p>",
      categoryId: null,
      featuredImage: "",
      featuredImageMediaId: null,
      readingTime: 4,
      status: "draft" as const,
      scheduledAt: null,
      seoMs: {
        title: "Kesihatan keluarga",
        description: "Panduan kesihatan keluarga.",
        canonicalUrl: "",
        socialTitle: "Kesihatan keluarga",
        socialDescription: "Panduan kesihatan keluarga.",
        socialImageMediaId: null,
        index: true,
        follow: true,
      },
      seoEn: {
        title: "Family health",
        description: "A family health guide.",
        canonicalUrl: "",
        socialTitle: "Family health",
        socialDescription: "A family health guide.",
        socialImageMediaId: null,
        index: true,
        follow: true,
      },
    };

    expect(blogPostDraftSchema.safeParse(basePost).success).toBe(true);
    expect(
      blogPostDraftSchema.safeParse({
        ...basePost,
        status: "scheduled",
        scheduledAt: null,
      }).success,
    ).toBe(false);
    expect(
      blogPostDraftSchema.safeParse({
        ...basePost,
        status: "published",
        scheduledAt: "2026-07-24T01:30:00.000Z",
      }).success,
    ).toBe(false);
  });
});
