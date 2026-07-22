import type { ComponentType } from "react";

import { sanitizeRichHtml } from "@/lib/sanitize-rich-html";

import type { PageSection, PageSectionType } from "./schema";

export interface PageSectionRendererProps {
  language: "ms" | "en";
  section: PageSection;
}

interface PageSectionRegistration {
  label: string;
  renderer: ComponentType<PageSectionRendererProps>;
}

const localized = (section: Record<string, unknown>, key: string, language: "ms" | "en") =>
  String(section[`${key}${language === "ms" ? "Ms" : "En"}`] || section[`${key}Ms`] || "");

function GenericSection({ language, section }: PageSectionRendererProps) {
  const record = section as unknown as Record<string, unknown>;
  const heading = localized(record, section.type === "youtube" ? "title" : "heading", language);
  const body = localized(record, section.type === "rich_text" ? "content" : "body", language);
  const mediaUrl = String(record.mediaUrl || "");
  const mediaAlt = localized(record, "mediaAlt", language);
  return (
    <section className="mx-auto max-w-6xl px-6 py-12" data-section-type={section.type}>
      {heading && <h2 className="text-3xl font-bold text-slate-950">{heading}</h2>}
      {mediaUrl && <img alt={mediaAlt} className="mt-6 max-h-[520px] w-full rounded-2xl object-cover" src={mediaUrl} />}
      {body && <div className="prose mt-4 max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(body) }} />}
    </section>
  );
}

export const PAGE_SECTION_REGISTRY: Record<PageSectionType, PageSectionRegistration> = {
  hero: { label: "Hero", renderer: GenericSection },
  rich_text: { label: "Rich Text", renderer: GenericSection },
  image_text: { label: "Image and Text", renderer: GenericSection },
  services: { label: "Services", renderer: GenericSection },
  team: { label: "Team", renderer: GenericSection },
  gallery: { label: "Gallery", renderer: GenericSection },
  reviews: { label: "Reviews", renderer: GenericSection },
  cta: { label: "Call to Action", renderer: GenericSection },
  youtube: { label: "YouTube", renderer: GenericSection },
  faq: { label: "FAQ", renderer: GenericSection },
  contact: { label: "Contact", renderer: GenericSection },
};

export function PageSectionsRenderer({ sections, language }: { sections: PageSection[]; language: "ms" | "en" }) {
  return <>{sections.filter((section) => section.visible).map((section) => {
    const Renderer = PAGE_SECTION_REGISTRY[section.type].renderer;
    return <Renderer key={section.id} language={language} section={section} />;
  })}</>;
}
