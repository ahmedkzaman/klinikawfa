import { describe, expect, it } from "vitest";

import {
  isProtectedServiceSlug,
  landingPageFormSchema,
} from "@/features/website-cms/services/landingPageDomain";

describe("landing page domain", () => {
  it("protects only the three core database service pages", () => {
    expect(isProtectedServiceSlug("rawatan-am")).toBe(true);
    expect(isProtectedServiceSlug("prosedur-minor")).toBe(true);
    expect(isProtectedServiceSlug("pemeriksaan-kesihatan")).toBe(true);
    expect(isProtectedServiceSlug("rawatan-telinga-microsuction-kuantan")).toBe(false);
  });

  it("accepts dynamic service slugs and rejects invalid slugs", () => {
    const valid = {
      slug: "rawatan-telinga-microsuction-kuantan",
      title: "Rawatan Telinga",
      description: "<p>Maklumat rawatan.</p>",
      call_to_action: "Book Appointment",
      hero_image_url: "",
      promo_video_url: "",
      services_list: [{ value: "Microsuction" }],
    };
    expect(landingPageFormSchema.safeParse(valid).success).toBe(true);
    expect(landingPageFormSchema.safeParse({ ...valid, slug: "Invalid Slug" }).success).toBe(false);
  });
});
