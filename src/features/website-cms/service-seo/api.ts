import { z } from "zod";

import { LOCAL_SERVICE_PAGES } from "@/content/localServicePages";
import { fetchResourceDraft, saveResourceDraft } from "@/features/website-cms/api/resources";
import { emptySeoFields, seoFieldsSchema, type SeoFields } from "@/features/website-cms/domain/seo";
import {
  createEmptyServiceSeoPayload,
  serviceAeoLanguageSchema,
  serviceSeoPayloadSchema,
  type CanonicalServiceSeoPath,
  type ServiceSeoPayload,
} from "@/features/website-cms/service-seo/domain";
import { supabase } from "@/integrations/supabase/client";

const publishedRowSchema = z.object({
  id: z.string().uuid(),
  path: z.string(),
  seo_ms: seoFieldsSchema,
  seo_en: seoFieldsSchema,
  seo_ms_social_image_path: z.string().nullable(),
  seo_en_social_image_path: z.string().nullable(),
  website_revision: z.number().int().nonnegative(),
  published_at: z.string().nullable(),
  aeo_ms: serviceAeoLanguageSchema.default({ answerSummary: "", faqs: [] }),
  aeo_en: serviceAeoLanguageSchema.default({ answerSummary: "", faqs: [] }),
});

const editorRowSchema = publishedRowSchema.extend({
  focus_phrase_ms: z.string(),
  focus_phrase_en: z.string(),
  label_ms: z.string(),
  label_en: z.string(),
  source_kind: z.enum(["category", "local_landing"]),
  service_id: z.string().uuid().nullable().optional(),
});

export interface PublishedServiceSeo {
  id: string;
  path: CanonicalServiceSeoPath;
  seoMs: SeoFields;
  seoEn: SeoFields;
  imageMs?: string;
  imageEn?: string;
  revision: number;
  publishedAt: string | null;
  aeoMs: ServiceSeoPayload["aeoMs"];
  aeoEn: ServiceSeoPayload["aeoEn"];
}

export interface ServiceSeoEditorRecord {
  payload: ServiceSeoPayload;
  revision: number;
  publishedAt: string | null;
  contextMs?: string;
  contextEn?: string;
  target: { id: string; path: CanonicalServiceSeoPath; labelMs: string; labelEn: string };
}

const categorySlugByPath: Partial<Record<CanonicalServiceSeoPath, string>> = {
  "/services/rawatan-umum/": "rawatan-am",
  "/services/prosedur-kecil/": "prosedur-minor",
  "/services/pemeriksaan-kesihatan/": "pemeriksaan-kesihatan",
};

function localServiceContext(path: CanonicalServiceSeoPath): string | undefined {
  const slug = path.split("/").filter(Boolean).at(-1);
  const page = slug ? LOCAL_SERVICE_PAGES[slug] : undefined;
  if (!page) return undefined;
  return JSON.stringify({
    title: page.title,
    heading: page.heading,
    introduction: page.introduction,
    sections: page.sections.map(({ heading, paragraphs, bullets }) => ({ heading, paragraphs, bullets })),
    faqs: page.faqs,
  }).slice(0, 20_000);
}

async function categoryServiceContext(path: CanonicalServiceSeoPath): Promise<{ contextMs?: string; contextEn?: string }> {
  const slug = categorySlugByPath[path];
  if (!slug) return {};
  const { data, error } = await supabase
    .from("clinic_services")
    .select("title,title_ms,title_en,description,description_ms,description_en,services_list,services_list_ms,services_list_en")
    .eq("slug", slug)
    .maybeSingle();
  if (error || !data) throw new Error("Service page content could not be loaded");
  const row = data as typeof data & Record<string, unknown>;
  return {
    contextMs: JSON.stringify({
      title: row.title_ms ?? row.title,
      description: row.description_ms ?? row.description,
      services: row.services_list_ms ?? row.services_list,
    }).slice(0, 20_000),
    contextEn: JSON.stringify({
      title: row.title_en ?? "",
      description: row.description_en ?? "",
      services: row.services_list_en ?? [],
    }).slice(0, 20_000),
  };
}

async function databaseServiceContext(serviceId: string): Promise<{ contextMs?: string; contextEn?: string }> {
  const { data, error } = await supabase.from("clinic_services")
    .select("title,title_ms,title_en,description,description_ms,description_en,services_list,services_list_ms,services_list_en")
    .eq("id", serviceId).single();
  if (error || !data) throw new Error("Service page content could not be loaded");
  const row = data as typeof data & Record<string, unknown>;
  return {
    contextMs: JSON.stringify({ title: row.title_ms ?? row.title, description: row.description_ms ?? row.description, services: row.services_list_ms ?? row.services_list }).slice(0, 20_000),
    contextEn: JSON.stringify({ title: row.title_en ?? row.title, description: row.description_en ?? "", services: row.services_list_en ?? [] }).slice(0, 20_000),
  };
}

function publicMediaUrl(storedPath: string | null): string | undefined {
  if (!storedPath) return undefined;
  const slash = storedPath.indexOf("/");
  if (slash <= 0 || slash === storedPath.length - 1) return undefined;
  const bucket = storedPath.slice(0, slash);
  const path = storedPath.slice(slash + 1);
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

function mapPublishedRow(value: unknown): PublishedServiceSeo {
  const row = publishedRowSchema.parse(value);
  return {
    id: row.id,
    path: row.path as CanonicalServiceSeoPath,
    seoMs: row.seo_ms,
    seoEn: row.seo_en,
    imageMs: publicMediaUrl(row.seo_ms_social_image_path),
    imageEn: publicMediaUrl(row.seo_en_social_image_path),
    revision: row.website_revision,
    publishedAt: row.published_at,
    aeoMs: row.aeo_ms,
    aeoEn: row.aeo_en,
  };
}

export async function fetchPublishedServiceSeo(path: CanonicalServiceSeoPath): Promise<PublishedServiceSeo | null> {
  const { data, error } = await supabase
    .from("website_service_seo" as never)
    .select("id,path,seo_ms,seo_en,aeo_ms,aeo_en,seo_ms_social_image_path,seo_en_social_image_path,website_revision,published_at")
    .eq("path", path)
    .maybeSingle();
  if (error) throw new Error("Service SEO could not be loaded");
  return data ? mapPublishedRow(data) : null;
}

export async function fetchServiceSeoForEditor(id: string): Promise<ServiceSeoEditorRecord> {
  const [draft, rowResult] = await Promise.all([
    fetchResourceDraft<ServiceSeoPayload>("service_seo", id),
    supabase
      .from("website_service_seo" as never)
      .select("id,service_id,path,label_ms,label_en,source_kind,focus_phrase_ms,focus_phrase_en,seo_ms,seo_en,aeo_ms,aeo_en,seo_ms_social_image_path,seo_en_social_image_path,website_revision,published_at")
      .eq("id", id)
      .single(),
  ]);
  if (rowResult.error || !rowResult.data) throw new Error("Service SEO target could not be loaded");
  const storedRow = rowResult.data as Record<string, unknown>;
  const row = editorRowSchema.parse({
    ...storedRow,
    seo_ms: { ...emptySeoFields, ...(storedRow.seo_ms as Record<string, unknown> ?? {}) },
    seo_en: { ...emptySeoFields, ...(storedRow.seo_en as Record<string, unknown> ?? {}) },
    aeo_ms: storedRow.aeo_ms ?? { answerSummary: "", faqs: [] },
    aeo_en: storedRow.aeo_en ?? { answerSummary: "", faqs: [] },
  });
  const sourceContext = row.service_id
    ? await databaseServiceContext(row.service_id)
    : row.source_kind === "category"
      ? await categoryServiceContext(row.path as CanonicalServiceSeoPath)
      : { contextMs: localServiceContext(row.path as CanonicalServiceSeoPath) };
  if (draft) {
    return { payload: serviceSeoPayloadSchema.parse(draft.payload), revision: draft.baseRevision, publishedAt: row.published_at, target: { id: row.id, path: row.path, labelMs: row.label_ms, labelEn: row.label_en }, ...sourceContext };
  }
  const empty = createEmptyServiceSeoPayload(row.path);
  return {
    payload: serviceSeoPayloadSchema.parse({
      schemaVersion: 2,
      path: row.path,
      focusPhraseMs: row.focus_phrase_ms,
      focusPhraseEn: row.focus_phrase_en,
      seoMs: row.seo_ms,
      seoEn: row.seo_en,
      aeoMs: row.aeo_ms ?? empty.aeoMs,
      aeoEn: row.aeo_en ?? empty.aeoEn,
    }),
    revision: row.website_revision,
    publishedAt: row.published_at,
    ...sourceContext,
    target: { id: row.id, path: row.path, labelMs: row.label_ms, labelEn: row.label_en },
  };
}

const generatedSchema = z.object({
  ms: z.object({ title: z.string(), description: z.string(), socialTitle: z.string(), socialDescription: z.string() }).strict(),
  en: z.object({ title: z.string(), description: z.string(), socialTitle: z.string(), socialDescription: z.string() }).strict(),
  aeoMs: serviceAeoLanguageSchema,
  aeoEn: serviceAeoLanguageSchema,
}).strict();

export async function generateAndSaveServiceSeoDraft(input: {
  resourceId: string;
  record: ServiceSeoEditorRecord;
}) {
  const { record } = input;
  const { data, error } = await supabase.functions.invoke("generate-service-seo", {
    body: {
      path: record.target.path,
      titleMs: record.target.labelMs,
      titleEn: record.target.labelEn,
      focusPhraseMs: record.payload.focusPhraseMs,
      focusPhraseEn: record.payload.focusPhraseEn,
      contentMs: record.contextMs,
      contentEn: record.contextEn,
    },
  });
  if (error) throw error;
  const generated = generatedSchema.parse(data);
  const payload = serviceSeoPayloadSchema.parse({
    ...record.payload,
    seoMs: { ...record.payload.seoMs, ...generated.ms },
    seoEn: { ...record.payload.seoEn, ...generated.en },
    aeoMs: generated.aeoMs,
    aeoEn: generated.aeoEn,
  });
  return saveServiceSeoDraft(input.resourceId, record.revision, payload);
}

export async function saveServiceSeoDraft(
  resourceId: string,
  baseRevision: number,
  payload: ServiceSeoPayload,
) {
  return saveResourceDraft<ServiceSeoPayload>({
    resourceType: "service_seo",
    resourceId,
    baseRevision,
    payload: serviceSeoPayloadSchema.parse(payload),
    updatedAt: null,
  });
}

export async function publishServiceSeo(resourceId: string, expectedRevision: number): Promise<number> {
  const { data, error } = await supabase.rpc("publish_service_seo" as never, {
    p_resource_id: resourceId,
    p_expected_revision: expectedRevision,
  } as never);
  if (error?.code === "40001") throw new Error("This SEO changed after you opened it. Reload before publishing.");
  if (error) throw new Error(error.message || "Service SEO could not be published");
  const revision = Number((data as { revision?: unknown } | null)?.revision);
  if (!Number.isInteger(revision) || revision < 1) throw new Error("Publish response was invalid");
  return revision;
}
