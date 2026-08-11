import { describe, expect, it } from "vitest";

import {
  CANONICAL_SERVICE_SEO_TARGETS,
  createEmptyServiceSeoPayload,
  resolveServiceSeoPath,
  serviceSeoPayloadSchema,
} from "@/features/website-cms/service-seo/domain";

describe("service SEO domain", () => {
  it("maintains the eight canonical service pages in their public order", () => {
    expect(CANONICAL_SERVICE_SEO_TARGETS.map((target) => target.path)).toEqual([
      "/services/rawatan-umum/",
      "/services/prosedur-kecil/",
      "/services/pemeriksaan-kesihatan/",
      "/services/rawatan-telinga-kuantan/",
      "/services/minor-surgery-kutil-kuantan/",
      "/services/swab-test-demam-kuantan/",
      "/services/pengurusan-berat-badan-kuantan/",
      "/services/sunat-kuantan/",
    ]);
    expect(new Set(CANONICAL_SERVICE_SEO_TARGETS.map((target) => target.id)).size).toBe(8);
  });

  it.each([
    ["/services/khatan", "/services/prosedur-kecil/"],
    ["/services/rawatan-am/", "/services/rawatan-umum/"],
    ["/services/pemeriksaan-darah", "/services/pemeriksaan-kesihatan/"],
    ["/services/sunat-kuantan/", "/services/sunat-kuantan/"],
  ])("resolves %s to %s", (input, expected) => {
    expect(resolveServiceSeoPath(input)).toBe(expected);
  });

  it("accepts normalized dynamic service paths", () => {
    expect(resolveServiceSeoPath("/services/rawatan-telinga-microsuction-kuantan/?source=editor"))
      .toBe("/services/rawatan-telinga-microsuction-kuantan/");
  });

  it.each(["/services/Two-Words/", "/services/nested/page/", "/other/page/"])(
    "rejects malformed service path %s",
    (path) => expect(resolveServiceSeoPath(path)).toBeUndefined(),
  );

  it("creates a versioned bilingual AEO draft", () => {
    expect(createEmptyServiceSeoPayload("/services/microsuction-kuantan/")).toMatchObject({
      schemaVersion: 2,
      aeoMs: { answerSummary: "", faqs: [] },
      aeoEn: { answerSummary: "", faqs: [] },
    });
  });

  it("validates strict bilingual draft payloads with derived canonicals", () => {
    const valid = {
      path: "/services/rawatan-umum/",
      focusPhraseMs: "klinik kuantan",
      focusPhraseEn: "clinic Kuantan",
      seoMs: {
        title: "Rawatan Umum di Kuantan",
        description: "Rawatan penyakit akut di Klinik Awfa, KotaSAS.",
        canonicalUrl: "",
        socialTitle: "Rawatan Umum Klinik Awfa",
        socialDescription: "Ketahui perkhidmatan rawatan umum kami.",
        socialImageMediaId: null,
        index: true,
        follow: true,
      },
      seoEn: {
        title: "General Treatment in Kuantan",
        description: "Acute illness care at Klinik Awfa, KotaSAS.",
        canonicalUrl: "",
        socialTitle: "General Care at Klinik Awfa",
        socialDescription: "Explore our general treatment services.",
        socialImageMediaId: null,
        index: true,
        follow: true,
      },
      schemaVersion: 2,
      aeoMs: {
        answerSummary: "Penilaian rawatan umum di KotaSAS, Kuantan.",
        faqs: [{ question: "Perlu temujanji?", answer: "Hubungi klinik untuk semakan semasa." }],
      },
      aeoEn: {
        answerSummary: "General treatment assessment in KotaSAS, Kuantan.",
        faqs: [{ question: "Do I need an appointment?", answer: "Contact the clinic for current arrangements." }],
      },
    } as const;

    expect(serviceSeoPayloadSchema.safeParse(valid).success).toBe(true);
    expect(serviceSeoPayloadSchema.safeParse({ ...valid, patientId: "must-not-exist" }).success).toBe(false);
    expect(serviceSeoPayloadSchema.safeParse({ ...valid, path: "/services/khatan/" }).success).toBe(true);
    expect(serviceSeoPayloadSchema.safeParse({
      ...valid,
      aeoEn: { ...valid.aeoEn, faqs: Array.from({ length: 13 }, (_, index) => ({ question: `Q${index}`, answer: "Answer" })) },
    }).success).toBe(false);
    expect(serviceSeoPayloadSchema.safeParse({
      ...valid,
      seoMs: { ...valid.seoMs, canonicalUrl: "https://example.com/" },
    }).success).toBe(false);
  });
});
