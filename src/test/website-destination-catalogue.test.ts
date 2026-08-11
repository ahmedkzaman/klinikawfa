import { beforeEach, describe, expect, it, vi } from "vitest";

const pages = vi.hoisted(() => ({ listEditorPages: vi.fn() }));
const resources = vi.hoisted(() => ({
  listResourceSummaries: vi.fn(),
  listServiceResources: vi.fn(),
}));

vi.mock("@/features/website-cms/api/pages", () => pages);
vi.mock("@/features/website-cms/api/resources", () => resources);

import { listWebsiteDestinations } from "@/features/website-cms/catalogue/api";

describe("website destination catalogue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pages.listEditorPages.mockResolvedValue([
      { id: "page-1", slug: "about-us", kind: "content", status: "published", revision: 2, scheduledAt: null, updatedAt: "2026-08-10T00:00:00Z" },
    ]);
    resources.listServiceResources.mockResolvedValue([
      { id: "service-1", slug: "rawatan-am", title: "Rawatan Umum", revision: 1 },
    ]);
    resources.listResourceSummaries.mockResolvedValue([
      { id: "post-1", slug: "demam", title: "Demam", subtitle: "demam", status: "draft", revision: 1, scheduledAt: null, updatedAt: "2026-08-09T00:00:00Z" },
    ]);
  });

  it("combines fixed, generic, service and post destinations with their owning editors", async () => {
    const result = await listWebsiteDestinations();
    expect(result.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ href: "/", type: "fixed", editHref: "/editor/home" }),
      expect.objectContaining({ href: "/pages/about-us", type: "page", editHref: "/editor/pages/page-1" }),
      expect.objectContaining({ href: "/services/rawatan-am", type: "service", editHref: "/editor/services/service-1" }),
      expect.objectContaining({ href: "/health-tips/demam", type: "post", editHref: "/editor/posts/post-1", status: "draft" }),
    ]));
    expect(result.errors).toEqual([]);
  });

  it("keeps successful sources visible and identifies a failed source", async () => {
    pages.listEditorPages.mockRejectedValue(new Error("pages unavailable"));

    const result = await listWebsiteDestinations();

    expect(result.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ href: "/" }),
      expect.objectContaining({ href: "/services/rawatan-am" }),
      expect.objectContaining({ href: "/health-tips/demam" }),
    ]));
    expect(result.items.some((item) => item.type === "page")).toBe(false);
    expect(result.errors).toEqual(["page"]);
  });
});
