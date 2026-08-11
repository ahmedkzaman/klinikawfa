import type { ServiceAeoLanguage, ServiceSeoPath } from "./domain";
import { serviceSeoCanonicalUrl } from "./domain";

export type ServiceStructuredDataInput = {
  path: ServiceSeoPath;
  labelMs: string;
  labelEn: string;
  aeoMs: ServiceAeoLanguage;
  aeoEn: ServiceAeoLanguage;
};

export type JsonLdObject = Record<string, unknown>;

export function buildServiceStructuredData(
  input: ServiceStructuredDataInput,
  language: "ms" | "en",
): JsonLdObject[] {
  const selected = language === "en" ? input.aeoEn : input.aeoMs;
  const name = language === "en" ? input.labelEn || input.labelMs : input.labelMs || input.labelEn;
  const url = serviceSeoCanonicalUrl(input.path);
  const result: JsonLdObject[] = [{
    "@context": "https://schema.org",
    "@type": "MedicalWebPage",
    name,
    description: selected.answerSummary,
    url,
    about: {
      "@type": "MedicalProcedure",
      name,
    },
    provider: {
      "@type": "MedicalClinic",
      name: "Klinik Awfa, KotaSAS",
      url: "https://klinikawfa.com/",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Kuantan",
        addressRegion: "Pahang",
        addressCountry: "MY",
      },
    },
  }];

  if (selected.faqs.length > 0) {
    result.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: selected.faqs.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: { "@type": "Answer", text: faq.answer },
      })),
    });
  }
  return result;
}
