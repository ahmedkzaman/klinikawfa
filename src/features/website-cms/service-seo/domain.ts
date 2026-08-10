import { z } from "zod";

import { emptySeoFields, seoFieldsSchema } from "@/features/website-cms/domain/seo";
import { resolveCanonicalServiceSlug } from "@/lib/serviceSlugMap";
import { SITE_ORIGIN } from "@/lib/website/seoRoutes";

export const CANONICAL_SERVICE_SEO_PATHS = [
  "/services/rawatan-umum/",
  "/services/prosedur-kecil/",
  "/services/pemeriksaan-kesihatan/",
  "/services/rawatan-telinga-kuantan/",
  "/services/minor-surgery-kutil-kuantan/",
  "/services/swab-test-demam-kuantan/",
  "/services/pengurusan-berat-badan-kuantan/",
  "/services/sunat-kuantan/",
] as const;

export type CanonicalServiceSeoPath = (typeof CANONICAL_SERVICE_SEO_PATHS)[number];

export const CANONICAL_SERVICE_SEO_TARGETS = [
  { id: "b9838947-9b48-4f1d-a378-21224c4b5c01", path: CANONICAL_SERVICE_SEO_PATHS[0], labelMs: "Rawatan Umum & Penyakit Akut", labelEn: "General Treatment & Acute Illness", sourceKind: "category" },
  { id: "b9838947-9b48-4f1d-a378-21224c4b5c02", path: CANONICAL_SERVICE_SEO_PATHS[1], labelMs: "Prosedur Minor & Pembedahan", labelEn: "Minor Procedures & Surgery", sourceKind: "category" },
  { id: "b9838947-9b48-4f1d-a378-21224c4b5c03", path: CANONICAL_SERVICE_SEO_PATHS[2], labelMs: "Pemeriksaan Kesihatan & Pekerjaan", labelEn: "Health & Employment Checkups", sourceKind: "category" },
  { id: "b9838947-9b48-4f1d-a378-21224c4b5c04", path: CANONICAL_SERVICE_SEO_PATHS[3], labelMs: "Rawatan Telinga Kuantan", labelEn: "Ear Treatment in Kuantan", sourceKind: "local_landing" },
  { id: "b9838947-9b48-4f1d-a378-21224c4b5c05", path: CANONICAL_SERVICE_SEO_PATHS[4], labelMs: "Pembedahan Minor & Kutil Kuantan", labelEn: "Minor Surgery & Wart Treatment in Kuantan", sourceKind: "local_landing" },
  { id: "b9838947-9b48-4f1d-a378-21224c4b5c06", path: CANONICAL_SERVICE_SEO_PATHS[5], labelMs: "Swab Test & Demam Kuantan", labelEn: "Swab Tests & Fever Assessment in Kuantan", sourceKind: "local_landing" },
  { id: "b9838947-9b48-4f1d-a378-21224c4b5c07", path: CANONICAL_SERVICE_SEO_PATHS[6], labelMs: "Pengurusan Berat Badan Kuantan", labelEn: "Weight Management in Kuantan", sourceKind: "local_landing" },
  { id: "b9838947-9b48-4f1d-a378-21224c4b5c08", path: CANONICAL_SERVICE_SEO_PATHS[7], labelMs: "Sunat Kuantan", labelEn: "Circumcision in Kuantan", sourceKind: "local_landing" },
] as const satisfies ReadonlyArray<{
  id: string;
  path: CanonicalServiceSeoPath;
  labelMs: string;
  labelEn: string;
  sourceKind: "category" | "local_landing";
}>;

const ids = new Set(CANONICAL_SERVICE_SEO_TARGETS.map((target) => target.id));
const paths = new Set(CANONICAL_SERVICE_SEO_TARGETS.map((target) => target.path));
if (ids.size !== CANONICAL_SERVICE_SEO_TARGETS.length || paths.size !== CANONICAL_SERVICE_SEO_TARGETS.length) {
  throw new Error("Service SEO targets must have unique ids and paths");
}

const editableSeoFieldsSchema = seoFieldsSchema.extend({ canonicalUrl: z.literal("") });

export const serviceSeoPayloadSchema = z.object({
  path: z.enum(CANONICAL_SERVICE_SEO_PATHS),
  focusPhraseMs: z.string().trim().max(160),
  focusPhraseEn: z.string().trim().max(160),
  seoMs: editableSeoFieldsSchema,
  seoEn: editableSeoFieldsSchema,
}).strict();

export type ServiceSeoPayload = z.infer<typeof serviceSeoPayloadSchema>;
export type ServiceSeoTarget = (typeof CANONICAL_SERVICE_SEO_TARGETS)[number];

export function createEmptyServiceSeoPayload(path: CanonicalServiceSeoPath): ServiceSeoPayload {
  return {
    path,
    focusPhraseMs: "",
    focusPhraseEn: "",
    seoMs: { ...emptySeoFields },
    seoEn: { ...emptySeoFields },
  };
}

export function resolveServiceSeoPath(pathname: string): CanonicalServiceSeoPath | undefined {
  const cleanPath = pathname.split(/[?#]/, 1)[0].replace(/\/+$/, "");
  const match = cleanPath.match(/^\/services\/([^/]+)$/);
  if (!match) return undefined;
  const canonicalSlug = resolveCanonicalServiceSlug(match[1]);
  if (!canonicalSlug) return undefined;
  const canonicalPath = `/services/${canonicalSlug}/`;
  return paths.has(canonicalPath as CanonicalServiceSeoPath)
    ? canonicalPath as CanonicalServiceSeoPath
    : undefined;
}

export function getServiceSeoTargetById(id: string): ServiceSeoTarget | undefined {
  return CANONICAL_SERVICE_SEO_TARGETS.find((target) => target.id === id);
}

export function getServiceSeoTargetByPath(path: string): ServiceSeoTarget | undefined {
  const canonicalPath = resolveServiceSeoPath(path);
  return CANONICAL_SERVICE_SEO_TARGETS.find((target) => target.path === canonicalPath);
}

export function serviceSeoCanonicalUrl(path: CanonicalServiceSeoPath): string {
  return `${SITE_ORIGIN}${path}`;
}
