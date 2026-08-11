import type { ContentStatus } from "@/features/website-cms/domain/content";

export type WebsiteDestinationType = "fixed" | "page" | "service" | "post";

export interface WebsiteDestination {
  id: string;
  type: WebsiteDestinationType;
  typeLabel?: string;
  titleMs: string;
  titleEn: string;
  href: string;
  editHref: string | null;
  status: ContentStatus;
  updatedAt: string | null;
}

export interface WebsiteDestinationCatalogueResult {
  items: WebsiteDestination[];
  errors: WebsiteDestinationType[];
}

export const FIXED_WEBSITE_DESTINATIONS: WebsiteDestination[] = [
  { id: "fixed-home", type: "fixed", titleMs: "Laman Utama", titleEn: "Home", href: "/", editHref: "/editor/home", status: "published", updatedAt: null },
  { id: "fixed-services", type: "fixed", titleMs: "Perkhidmatan", titleEn: "Services", href: "/services", editHref: "/editor/services", status: "published", updatedAt: null },
  { id: "fixed-doctors", type: "fixed", titleMs: "Doktor", titleEn: "Doctors", href: "/doctors", editHref: "/editor/team", status: "published", updatedAt: null },
  { id: "fixed-doctor-on-duty", type: "fixed", titleMs: "Doktor Bertugas", titleEn: "Doctor On Duty", href: "/doctor-on-duty", editHref: null, status: "published", updatedAt: null },
  { id: "fixed-appointment", type: "fixed", titleMs: "Temujanji", titleEn: "Appointment", href: "/appointment", editHref: null, status: "published", updatedAt: null },
  { id: "fixed-gallery", type: "fixed", titleMs: "Galeri", titleEn: "Gallery", href: "/gallery", editHref: "/editor/gallery", status: "published", updatedAt: null },
  { id: "fixed-health-tips", type: "fixed", titleMs: "Tips Kesihatan", titleEn: "Health Tips", href: "/health-tips", editHref: "/editor/posts", status: "published", updatedAt: null },
  { id: "fixed-privacy", type: "fixed", titleMs: "Privasi", titleEn: "Privacy", href: "/privacy", editHref: null, status: "published", updatedAt: null },
  { id: "fixed-terms", type: "fixed", titleMs: "Terma", titleEn: "Terms", href: "/terms", editHref: null, status: "published", updatedAt: null },
];
