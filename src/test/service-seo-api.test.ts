import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchResourceDraft: vi.fn(),
  saveResourceDraft: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/features/website-cms/api/resources", () => ({
  fetchResourceDraft: mocks.fetchResourceDraft,
  saveResourceDraft: mocks.saveResourceDraft,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from, rpc: mocks.rpc },
}));

import {
  fetchPublishedServiceSeo,
  fetchServiceSeoForEditor,
  publishServiceSeo,
  saveServiceSeoDraft,
} from "@/features/website-cms/service-seo/api";
import { createEmptyServiceSeoPayload } from "@/features/website-cms/service-seo/domain";

describe("service SEO API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("selects a published record by its canonical path", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: "b9838947-9b48-4f1d-a378-21224c4b5c04",
        path: "/services/rawatan-telinga-kuantan/",
        seo_ms: createEmptyServiceSeoPayload("/services/rawatan-telinga-kuantan/").seoMs,
        seo_en: createEmptyServiceSeoPayload("/services/rawatan-telinga-kuantan/").seoEn,
        seo_ms_social_image_path: null,
        seo_en_social_image_path: null,
        website_revision: 1,
        published_at: "2026-08-10T10:00:00Z",
      },
      error: null,
    });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    mocks.from.mockReturnValue({ select });

    const result = await fetchPublishedServiceSeo("/services/rawatan-telinga-kuantan/");

    expect(mocks.from).toHaveBeenCalledWith("website_service_seo");
    expect(eq).toHaveBeenCalledWith("path", "/services/rawatan-telinga-kuantan/");
    expect(result?.revision).toBe(1);
  });

  it("saves a validated draft without updating the published registry", async () => {
    const payload = createEmptyServiceSeoPayload("/services/rawatan-umum/");
    mocks.saveResourceDraft.mockResolvedValue({ baseRevision: 2, payload });

    await saveServiceSeoDraft("b9838947-9b48-4f1d-a378-21224c4b5c01", 2, payload);

    expect(mocks.saveResourceDraft).toHaveBeenCalledWith(expect.objectContaining({
      resourceType: "service_seo",
      resourceId: "b9838947-9b48-4f1d-a378-21224c4b5c01",
      baseRevision: 2,
    }));
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("opens a newly seeded SEO target whose published metadata is still empty", async () => {
    mocks.fetchResourceDraft.mockResolvedValue(null);
    mocks.from.mockImplementation((table: string) => {
      if (table === "website_service_seo") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: "b9838947-9b48-4f1d-a378-21224c4b5c04",
                  path: "/services/rawatan-telinga-kuantan/",
                  label_ms: "Rawatan Telinga Kuantan",
                  label_en: "Ear Treatment in Kuantan",
                  source_kind: "local_landing",
                  focus_phrase_ms: "",
                  focus_phrase_en: "",
                  seo_ms: {},
                  seo_en: {},
                  seo_ms_social_image_path: null,
                  seo_en_social_image_path: null,
                  website_revision: 0,
                  published_at: null,
                },
                error: null,
              }),
            })),
          })),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const result = await fetchServiceSeoForEditor("b9838947-9b48-4f1d-a378-21224c4b5c04");

    expect(result.payload).toEqual(createEmptyServiceSeoPayload("/services/rawatan-telinga-kuantan/"));
    expect(result.revision).toBe(0);
  });

  it("publishes through the guarded RPC and rejects malformed responses", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { revision: 3 }, error: null });
    await expect(publishServiceSeo("b9838947-9b48-4f1d-a378-21224c4b5c01", 2)).resolves.toBe(3);
    expect(mocks.rpc).toHaveBeenCalledWith("publish_service_seo", {
      p_resource_id: "b9838947-9b48-4f1d-a378-21224c4b5c01",
      p_expected_revision: 2,
    });

    mocks.rpc.mockResolvedValueOnce({ data: { revision: "bad" }, error: null });
    await expect(publishServiceSeo("b9838947-9b48-4f1d-a378-21224c4b5c01", 2)).rejects.toThrow("invalid");
  });
});
