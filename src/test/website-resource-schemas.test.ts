import { describe, expect, it } from "vitest";

import {
  blogPostDraftSchema,
  galleryImageDraftSchema,
  reviewDraftSchema,
  serviceDraftSchema,
  teamMemberDraftSchema,
  websiteResourceTypeSchema,
} from "@/features/website-cms/resources/schemas";

describe("website resource schemas", () => {
  it("registers only public website resource types", () => {
    for (const type of ["service", "team_member", "blog_post", "gallery_image", "review"]) {
      expect(websiteResourceTypeSchema.parse(type)).toBe(type);
    }
    expect(websiteResourceTypeSchema.safeParse("patient").success).toBe(false);
    expect(websiteResourceTypeSchema.safeParse("payment").success).toBe(false);
  });

  it("requires Malay presentation content and rejects unknown keys", () => {
    expect(serviceDraftSchema.safeParse({ titleMs: "Rawatan", descriptionMs: "<p>Selamat</p>", ctaMs: "Hubungi", servicesMs: ["Konsultasi"], slug: "rawatan-am" }).success).toBe(true);
    expect(serviceDraftSchema.safeParse({ titleEn: "Care", slug: "rawatan-am" }).success).toBe(false);
    expect(serviceDraftSchema.safeParse({ titleMs: "Rawatan", descriptionMs: "x", ctaMs: "x", servicesMs: ["x"], slug: "rawatan-am", patientId: "secret" }).success).toBe(false);
  });

  it("validates team, blog, gallery and review bounds", () => {
    expect(teamMemberDraftSchema.safeParse({ type: "doctor", nameMs: "Dr Awfa", nameEn: "", titleMs: "Doktor", bioMs: "Bio", expertiseMs: [], qualifications: [], yearsExperience: 10, photoUrl: "https://example.com/a.webp", isActive: true, displayOrder: 0 }).success).toBe(true);
    expect(blogPostDraftSchema.safeParse({ titleMs: "Tip", excerptMs: "Ringkas", contentMs: "<p>Isi</p>", slug: "tip", status: "draft", readingTime: 2 }).success).toBe(true);
    expect(galleryImageDraftSchema.safeParse({ url: "javascript:alert(1)", altMs: "Gambar", tags: [], displayOrder: 0, visible: true }).success).toBe(false);
    expect(reviewDraftSchema.safeParse({ nameMs: "A", reviewTextMs: "Baik", rating: 6, sourceLabel: "Google", status: "published", displayOrder: 0 }).success).toBe(false);
  });
});
