import { Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { PAGE_SECTION_REGISTRY } from "@/features/website-cms/sections/registry";
import type { PageSection, PageSectionType } from "@/features/website-cms/sections/schema";

const defaults: Record<PageSectionType, () => PageSection> = {
  hero: () => ({ id: crypto.randomUUID(), type: "hero", visible: true, spacing: "normal", headingMs: "Tajuk utama", headingEn: "Hero heading", bodyMs: "", bodyEn: "", mediaId: null, mediaUrl: "", mediaAltMs: "", mediaAltEn: "", alignment: "left" }),
  rich_text: () => ({ id: crypto.randomUUID(), type: "rich_text", visible: true, spacing: "normal", contentMs: "<p>Kandungan</p>", contentEn: "", alignment: "left" }),
  image_text: () => ({ id: crypto.randomUUID(), type: "image_text", visible: true, spacing: "normal", headingMs: "", headingEn: "", bodyMs: "", bodyEn: "", mediaId: null, mediaUrl: "", mediaAltMs: "", mediaAltEn: "", imagePosition: "left" }),
  services: () => ({ id: crypto.randomUUID(), type: "services", visible: true, spacing: "normal", headingMs: "Perkhidmatan", headingEn: "Services", selectedIds: [] }),
  team: () => ({ id: crypto.randomUUID(), type: "team", visible: true, spacing: "normal", headingMs: "Pasukan Kami", headingEn: "Our Team", selectedIds: [] }),
  gallery: () => ({ id: crypto.randomUUID(), type: "gallery", visible: true, spacing: "normal", headingMs: "Galeri", headingEn: "Gallery", selectedIds: [] }),
  reviews: () => ({ id: crypto.randomUUID(), type: "reviews", visible: true, spacing: "normal", headingMs: "Ulasan", headingEn: "Reviews", selectedIds: [] }),
  cta: () => ({ id: crypto.randomUUID(), type: "cta", visible: true, spacing: "normal", headingMs: "", headingEn: "", bodyMs: "", bodyEn: "", buttonLabelMs: "Hubungi Kami", buttonLabelEn: "Contact Us", href: "/appointment", alignment: "center" }),
  youtube: () => ({ id: crypto.randomUUID(), type: "youtube", visible: true, spacing: "normal", titleMs: "Video", titleEn: "Video", url: "https://www.youtube.com/watch?v=" }),
  faq: () => ({ id: crypto.randomUUID(), type: "faq", visible: true, spacing: "normal", headingMs: "Soalan Lazim", headingEn: "Frequently Asked Questions", items: [] }),
  contact: () => ({ id: crypto.randomUUID(), type: "contact", visible: true, spacing: "normal", headingMs: "Hubungi Kami", headingEn: "Contact Us", bodyMs: "", bodyEn: "", showAddress: true, showHours: true, showPhone: true, showMap: true }),
};

export function AddSectionDialog({ onAdd }: { onAdd(section: PageSection): void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <Button onClick={() => setOpen(true)} type="button" variant="outline"><Plus aria-hidden="true" /> Add section</Button>
      {open && (
        <div aria-label="Add page section" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog">
          <div className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Add section</h2><Button onClick={() => setOpen(false)} type="button" variant="ghost">Close</Button></div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {(Object.keys(PAGE_SECTION_REGISTRY) as PageSectionType[]).map((type) => (
                <Button className="h-auto justify-start px-4 py-4" key={type} onClick={() => { onAdd(defaults[type]()); setOpen(false); }} type="button" variant="outline">
                  {PAGE_SECTION_REGISTRY[type].label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
