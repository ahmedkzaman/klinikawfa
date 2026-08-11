import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchResourceDraft: vi.fn(),
  saveResourceDraft: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock("@/features/website-cms/api/resources", () => ({
  fetchResourceDraft: mocks.fetchResourceDraft,
  saveResourceDraft: mocks.saveResourceDraft,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from, rpc: mocks.rpc, functions: { invoke: mocks.invoke } },
}));

import {
  fetchPublishedServiceSeo,
  fetchServiceSeoForEditor,
  generateAndSaveServiceAeoDraft,
  generateAndSaveServiceSeoDraft,
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
        aeo_ms: { answerSummary: "", faqs: [] },
        aeo_en: { answerSummary: "", faqs: [] },
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
                  aeo_ms: { answerSummary: "", faqs: [] },
                  aeo_en: { answerSummary: "", faqs: [] },
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

  it("generates bilingual SEO and AEO and saves it only as a draft", async () => {
    const payload = createEmptyServiceSeoPayload("/services/microsuction-kuantan/");
    const record = {
      payload,
      revision: 0,
      publishedAt: null,
      target: { id: "b9838947-9b48-4f1d-a378-21224c4b5c09", path: payload.path, labelMs: "Rawatan Telinga", labelEn: "Ear Treatment" },
      contextMs: "Kandungan halaman",
      contextEn: "Page content",
    };
    mocks.invoke.mockResolvedValue({ data: {
      ms: { title: "Rawatan Telinga", description: "Penerangan", socialTitle: "Rawatan Telinga", socialDescription: "Penerangan sosial" },
      en: { title: "Ear Treatment", description: "Description", socialTitle: "Ear Treatment", socialDescription: "Social description" },
      aeoMs: { answerSummary: "Penilaian doktor.", faqs: [] },
      aeoEn: { answerSummary: "Doctor assessment.", faqs: [] },
    }, error: null });
    mocks.saveResourceDraft.mockImplementation(async (input) => ({ baseRevision: input.baseRevision, payload: input.payload }));

    const saved = await generateAndSaveServiceSeoDraft({ resourceId: record.target.id, record });

    expect(saved.payload.aeoEn.answerSummary).toBe("Doctor assessment.");
    expect(mocks.rpc).not.toHaveBeenCalledWith("publish_service_seo", expect.anything());
  });

  it("generates bilingual AEO while preserving every existing SEO field", async () => {
    const payload = createEmptyServiceSeoPayload("/services/rawatan-umum/");
    payload.focusPhraseMs = "rawatan umum kuantan";
    payload.focusPhraseEn = "general treatment Kuantan";
    payload.seoMs = { ...payload.seoMs, title: "Tajuk asal", description: "Penerangan asal", socialTitle: "Sosial asal", socialDescription: "Penerangan sosial asal", index: false };
    payload.seoEn = { ...payload.seoEn, title: "Original title", description: "Original description", socialTitle: "Original social", socialDescription: "Original social description", socialImageMediaId: "b9838947-9b48-4f1d-a378-21224c4b5c09" };
    const original = structuredClone(payload);
    const record = {
      payload,
      revision: 7,
      publishedAt: null,
      target: { id: "b9838947-9b48-4f1d-a378-21224c4b5c01", path: payload.path, labelMs: "Rawatan Umum", labelEn: "General Treatment" },
      contextMs: "Kandungan halaman",
      contextEn: "Page content",
    };
    mocks.invoke.mockResolvedValue({ data: {
      aeoMs: { answerSummary: "Jawapan baharu.", faqs: [{ question: "Soalan?", answer: "Jawapan." }] },
      aeoEn: { answerSummary: "New answer.", faqs: [{ question: "Question?", answer: "Answer." }] },
    }, error: null });
    mocks.saveResourceDraft.mockImplementation(async (input) => ({ baseRevision: input.baseRevision, payload: input.payload }));

    const saved = await generateAndSaveServiceAeoDraft({ resourceId: record.target.id, record });

    expect(mocks.invoke).toHaveBeenCalledWith("generate-service-seo", expect.objectContaining({ body: expect.objectContaining({ mode: "aeo" }) }));
    expect(saved.payload).toMatchObject({
      ...original,
      aeoMs: { answerSummary: "Jawapan baharu.", faqs: [{ question: "Soalan?", answer: "Jawapan." }] },
      aeoEn: { answerSummary: "New answer.", faqs: [{ question: "Question?", answer: "Answer." }] },
    });
    expect(saved.payload.seoMs).toEqual(original.seoMs);
    expect(saved.payload.seoEn).toEqual(original.seoEn);
    expect(saved.payload.focusPhraseMs).toBe(original.focusPhraseMs);
    expect(saved.payload.focusPhraseEn).toBe(original.focusPhraseEn);
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
