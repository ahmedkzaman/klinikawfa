import { describe, expect, it } from "vitest";

import { prepareResourcePayloadForPublish } from "@/features/website-cms/resources/publishing";

describe("resource publish payload", () => {
  it("forces posts and reviews into their public state", () => {
    expect(prepareResourcePayloadForPublish("blog_post", {
      status: "draft",
      scheduledAt: "2026-08-01T10:00:00.000Z",
    })).toMatchObject({ status: "published", scheduledAt: null });
    expect(prepareResourcePayloadForPublish("review", { status: "draft" }))
      .toMatchObject({ status: "published" });
  });

  it("does not rewrite visibility choices for other resources", () => {
    const payload = { visible: false };
    expect(prepareResourcePayloadForPublish("gallery_image", payload)).toBe(payload);
  });
});
