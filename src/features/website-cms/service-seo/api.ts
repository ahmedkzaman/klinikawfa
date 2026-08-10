import { z } from "zod";

import { fetchResourceDraft, saveResourceDraft } from "@/features/website-cms/api/resources";
import { seoFieldsSchema, type SeoFields } from "@/features/website-cms/domain/seo";
import {
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
});

const editorRowSchema = publishedRowSchema.extend({
  focus_phrase_ms: z.string(),
  focus_phrase_en: z.string(),
  label_ms: z.string(),
  label_en: z.string(),
  source_kind: z.enum(["category", "local_landing"]),
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
}

export interface ServiceSeoEditorRecord {
  payload: ServiceSeoPayload;
  revision: number;
  publishedAt: string | null;
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
  };
}

export async function fetchPublishedServiceSeo(path: CanonicalServiceSeoPath): Promise<PublishedServiceSeo | null> {
  const { data, error } = await supabase
    .from("website_service_seo" as never)
    .select("id,path,seo_ms,seo_en,seo_ms_social_image_path,seo_en_social_image_path,website_revision,published_at")
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
      .select("id,path,label_ms,label_en,source_kind,focus_phrase_ms,focus_phrase_en,seo_ms,seo_en,seo_ms_social_image_path,seo_en_social_image_path,website_revision,published_at")
      .eq("id", id)
      .single(),
  ]);
  if (rowResult.error || !rowResult.data) throw new Error("Service SEO target could not be loaded");
  const row = editorRowSchema.parse(rowResult.data);
  if (draft) {
    return { payload: serviceSeoPayloadSchema.parse(draft.payload), revision: draft.baseRevision, publishedAt: row.published_at };
  }
  return {
    payload: serviceSeoPayloadSchema.parse({
      path: row.path,
      focusPhraseMs: row.focus_phrase_ms,
      focusPhraseEn: row.focus_phrase_en,
      seoMs: row.seo_ms,
      seoEn: row.seo_en,
    }),
    revision: row.website_revision,
    publishedAt: row.published_at,
  };
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
