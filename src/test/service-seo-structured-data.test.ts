import { describe, expect, it } from "vitest";

import { buildServiceStructuredData } from "@/features/website-cms/service-seo/structuredData";

describe("service SEO structured data", () => {
  it("builds bilingual FAQ and medical service JSON-LD from approved data", () => {
    const result = buildServiceStructuredData({
      path: "/services/microsuction-kuantan/",
      labelMs: "Rawatan Telinga Kuantan",
      labelEn: "Ear Treatment in Kuantan",
      aeoMs: { answerSummary: "Penilaian telinga di Klinik Awfa.", faqs: [] },
      aeoEn: {
        answerSummary: "Ear assessment at Klinik Awfa.",
        faqs: [{ question: "Is assessment required?", answer: "Yes. A doctor assesses suitability." }],
      },
    }, "en");

    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ "@type": "MedicalWebPage", url: "https://klinikawfa.com/services/microsuction-kuantan/" }),
      expect.objectContaining({ "@type": "FAQPage", mainEntity: [expect.objectContaining({ "@type": "Question" })] }),
    ]));
  });

  it("omits FAQPage when no approved questions exist", () => {
    const result = buildServiceStructuredData({
      path: "/services/microsuction-kuantan/",
      labelMs: "Rawatan Telinga",
      labelEn: "Ear Treatment",
      aeoMs: { answerSummary: "Ringkasan.", faqs: [] },
      aeoEn: { answerSummary: "Summary.", faqs: [] },
    }, "ms");

    expect(result.some((item) => item["@type"] === "FAQPage")).toBe(false);
  });
});
