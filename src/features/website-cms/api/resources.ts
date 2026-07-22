import type { SupabaseClient } from "@supabase/supabase-js";

import { parseWebsiteResourceDraft } from "@/features/website-cms/resources/registry";
import type { WebsiteResourceType } from "@/features/website-cms/resources/types";
import type { BlogPostDraft, GalleryImageDraft, ReviewDraft, ServiceDraft, TeamMemberDraft } from "@/features/website-cms/resources/schemas";
import { supabase } from "@/integrations/supabase/client";

type CmsClient = SupabaseClient & {
  rpc(
    fn: "publish_website_resource" | "restore_website_resource_version",
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
};

const cms = supabase as unknown as CmsClient;

export interface ResourceDraftRecord<T = unknown> {
  baseRevision: number;
  payload: T;
  resourceId: string;
  resourceType: WebsiteResourceType;
  updatedAt: string | null;
}

export interface ResourceVersion {
  id: string;
  payload: unknown;
  publishedAt: string;
  revision: number;
}

export class StaleWebsiteResourceError extends Error {
  constructor() {
    super("This content changed after you opened it. Reload before publishing.");
    this.name = "StaleWebsiteResourceError";
  }
}

export async function fetchResourceDraft<T>(type: WebsiteResourceType, resourceId: string): Promise<ResourceDraftRecord<T> | null> {
  const { data, error } = await supabase
    .from("website_content_drafts")
    .select("resource_type,resource_id,draft_payload,base_revision,updated_at")
    .eq("resource_type", type)
    .eq("resource_id", resourceId)
    .maybeSingle();
  if (error) throw new Error("Draft could not be loaded");
  if (!data) return null;
  return {
    baseRevision: data.base_revision,
    payload: parseWebsiteResourceDraft(type, data.draft_payload) as T,
    resourceId: data.resource_id,
    resourceType: data.resource_type as WebsiteResourceType,
    updatedAt: data.updated_at,
  };
}

export async function saveResourceDraft<T>(input: ResourceDraftRecord<T>): Promise<ResourceDraftRecord<T>> {
  const payload = parseWebsiteResourceDraft(input.resourceType, input.payload);
  const { data, error } = await supabase
    .from("website_content_drafts")
    .upsert({
      resource_type: input.resourceType,
      resource_id: input.resourceId,
      draft_payload: payload,
      base_revision: input.baseRevision,
    }, { onConflict: "resource_type,resource_id" })
    .select("resource_type,resource_id,draft_payload,base_revision,updated_at")
    .single();
  if (error || !data) throw new Error("Draft could not be saved");
  return {
    baseRevision: data.base_revision,
    payload: parseWebsiteResourceDraft(input.resourceType, data.draft_payload) as T,
    resourceId: data.resource_id,
    resourceType: data.resource_type as WebsiteResourceType,
    updatedAt: data.updated_at,
  };
}

export async function publishResourceDraft(type: WebsiteResourceType, resourceId: string, expectedRevision: number): Promise<number> {
  const { data, error } = await cms.rpc("publish_website_resource", {
    p_expected_revision: expectedRevision,
    p_resource_id: resourceId,
    p_resource_type: type,
  });
  if (error?.code === "40001") throw new StaleWebsiteResourceError();
  if (error) throw new Error("Content could not be published");
  const revision = Number((data as { revision?: unknown } | null)?.revision);
  if (!Number.isInteger(revision) || revision < 1) throw new Error("Publish response was invalid");
  return revision;
}

export async function fetchResourceVersions(type: WebsiteResourceType, resourceId: string): Promise<ResourceVersion[]> {
  const { data, error } = await supabase
    .from("website_content_versions")
    .select("id,payload,published_at,revision")
    .eq("resource_type", type)
    .eq("resource_id", resourceId)
    .order("revision", { ascending: false })
    .limit(20);
  if (error || !data) throw new Error("Version history could not be loaded");
  return data.map((row) => ({ id: row.id, payload: row.payload, publishedAt: row.published_at, revision: row.revision }));
}

export async function restoreResourceVersion(type: WebsiteResourceType, resourceId: string, versionId: string): Promise<void> {
  const { error } = await cms.rpc("restore_website_resource_version", {
    p_resource_id: resourceId,
    p_resource_type: type,
    p_version_id: versionId,
  });
  if (error) throw new Error("Version could not be restored to draft");
}

export function newResourceId(): string {
  return crypto.randomUUID();
}

export interface WebsiteResourceSummary {
  id: string;
  revision: number;
  scheduledAt: string | null;
  slug: string;
  status: string;
  subtitle: string;
  title: string;
  updatedAt: string;
}

export async function listResourceSummaries(type: Exclude<WebsiteResourceType, "service">): Promise<WebsiteResourceSummary[]> {
  if (type === "team_member") {
    const { data, error } = await supabase.from("team_members").select("id,name_ms,title_ms,type,is_active,display_order,updated_at").order("display_order");
    if (error || !data) throw new Error("Team profiles could not be loaded");
    return data.map((row) => ({ id: row.id, title: row.name_ms, slug: row.id, subtitle: row.title_ms ?? row.type, status: row.is_active ? "published" : "draft", revision: Number((row as { website_revision?: number }).website_revision ?? 0), scheduledAt: null, updatedAt: row.updated_at }));
  }
  if (type === "blog_post") {
    const { data, error } = await supabase.from("blog_posts").select("id,title_ms,title,slug,published,scheduled_at,updated_at").order("created_at", { ascending: false });
    if (error || !data) throw new Error("Blog posts could not be loaded");
    return data.map((row) => ({ id: row.id, title: row.title_ms ?? row.title, slug: row.slug, subtitle: row.slug, status: row.published ? "published" : row.scheduled_at ? "scheduled" : "draft", revision: Number((row as { website_revision?: number }).website_revision ?? 0), scheduledAt: row.scheduled_at, updatedAt: row.updated_at }));
  }
  if (type === "gallery_image") {
    const { data, error } = await supabase.from("gallery_images").select("id,alt_text,url,display_order,created_at").order("display_order");
    if (error || !data) throw new Error("Gallery could not be loaded");
    return data.map((row) => ({ id: row.id, title: row.alt_text ?? "Gallery item", slug: row.id, subtitle: row.url, status: (row as { is_visible?: boolean }).is_visible === false ? "draft" : "published", revision: Number((row as { website_revision?: number }).website_revision ?? 0), scheduledAt: null, updatedAt: row.created_at }));
  }
  const { data, error } = await supabase.from("website_review_presentations").select("id,name_ms,review_text_ms,status,display_order").order("display_order");
  if (error || !data) throw new Error("Reviews could not be loaded");
  return data.map((row) => ({ id: row.id, title: row.name_ms, slug: row.id, subtitle: row.review_text_ms, status: row.status === "published" ? "published" : "draft", revision: row.website_revision, scheduledAt: null, updatedAt: row.updated_at }));
}

export async function fetchResourceForEditor(type: Exclude<WebsiteResourceType, "service">, resourceId: string): Promise<{ payload: TeamMemberDraft | BlogPostDraft | GalleryImageDraft | ReviewDraft; revision: number } | null> {
  const storedDraft = await fetchResourceDraft<TeamMemberDraft | BlogPostDraft | GalleryImageDraft | ReviewDraft>(type, resourceId);
  if (storedDraft) return { payload: storedDraft.payload, revision: storedDraft.baseRevision };
  if (type === "team_member") {
    const { data, error } = await supabase.from("team_members").select("*").eq("id",resourceId).maybeSingle(); if (error) throw error; if (!data) return null;
    const row = data as typeof data & Record<string, unknown>;
    return { revision: Number(row.website_revision ?? 0), payload: parseWebsiteResourceDraft(type,{ type: row.type === "doctor" ? "doctor" : "team", nameMs: row.name_ms, nameEn: row.name_en ?? "", titleMs: row.title_ms ?? row.type, titleEn: row.title_en ?? "", bioMs: row.bio_ms ?? "Profil ahli pasukan Klinik Awfa.", bioEn: row.bio_en ?? "", expertiseMs: row.expertise_ms ?? [], expertiseEn: row.expertise_en ?? [], qualifications: row.qualifications ?? [], yearsExperience: row.years_experience ?? 0, photoUrl: row.photo_url ?? "", isActive: row.is_active ?? true, displayOrder: row.display_order ?? 0 }) as TeamMemberDraft };
  }
  if (type === "blog_post") {
    const { data, error } = await supabase.from("blog_posts").select("*").eq("id",resourceId).maybeSingle(); if (error) throw error; if (!data) return null;
    const row = data as typeof data & Record<string, unknown>;
    const metadata = (row.website_editor_metadata ?? {}) as Record<string, unknown>;
    return { revision: Number(row.website_revision ?? 0), payload: parseWebsiteResourceDraft(type,{ slug: row.slug, titleMs: row.title_ms ?? row.title, titleEn: row.title_en ?? "", excerptMs: row.excerpt_ms ?? "Ringkasan artikel.", excerptEn: row.excerpt_en ?? "", contentMs: row.content_ms ?? row.content, contentEn: row.content_en ?? "", categoryId: row.category_id, tagIds: metadata.tagIds ?? [], authorId: metadata.authorId ?? null, featuredImage: row.featured_image ?? "", featuredImageMediaId: metadata.featuredImageMediaId ?? null, readingTime: row.reading_time ?? 1, status: row.published ? "published" : row.scheduled_at ? "scheduled" : "draft", scheduledAt: row.scheduled_at, seoMs: metadata.seoMs, seoEn: metadata.seoEn }) as BlogPostDraft };
  }
  if (type === "gallery_image") {
    const { data, error } = await supabase.from("gallery_images").select("*").eq("id",resourceId).maybeSingle(); if (error) throw error; if (!data) return null;
    const row = data as typeof data & Record<string, unknown>;
    return { revision: Number(row.website_revision ?? 0), payload: parseWebsiteResourceDraft(type,{ url: row.url, altMs: row.alt_text_ms ?? row.alt_text ?? "Imej Klinik Awfa", altEn: row.alt_text_en ?? "", tags: row.tags ?? [], displayOrder: row.display_order, visible: row.is_visible ?? true }) as GalleryImageDraft };
  }
  const { data, error } = await supabase.from("website_review_presentations").select("*").eq("id",resourceId).maybeSingle(); if (error) throw error; if (!data) return null;
  return { revision: data.website_revision, payload: parseWebsiteResourceDraft(type,{ nameMs: data.name_ms, nameEn: data.name_en ?? "", reviewTextMs: data.review_text_ms, reviewTextEn: data.review_text_en ?? "", rating: data.rating, sourceLabel: data.source_label, status: data.status, displayOrder: data.display_order }) as ReviewDraft };
}

export interface ServiceResourceSummary {
  id: string;
  revision: number;
  slug: ServiceDraft["slug"];
  title: string;
}

export async function listServiceResources(): Promise<ServiceResourceSummary[]> {
  const { data, error } = await supabase
    .from("clinic_services")
    .select("id,slug,title")
    .in("slug", ["rawatan-am", "prosedur-minor", "pemeriksaan-kesihatan"])
    .order("slug");
  if (error || !data) throw new Error("Services could not be loaded");
  return data.map((row) => ({ id: row.id, revision: Number((row as { website_revision?: number }).website_revision ?? 0), slug: row.slug as ServiceDraft["slug"], title: row.title }));
}

export async function fetchServiceResource(resourceId: string): Promise<{ draft: ServiceDraft; revision: number }> {
  const draft = await fetchResourceDraft<ServiceDraft>("service", resourceId);
  if (draft) return { draft: draft.payload, revision: draft.baseRevision };
  const { data, error } = await supabase.from("clinic_services").select("*").eq("id", resourceId).single();
  if (error || !data) throw new Error("Service could not be loaded");
  const row = data as typeof data & Record<string, unknown>;
  return {
    revision: Number(row.website_revision ?? 0),
    draft: parseWebsiteResourceDraft("service", {
      slug: row.slug,
      titleMs: row.title_ms ?? row.title,
      titleEn: row.title_en ?? "",
      descriptionMs: row.description_ms ?? row.description,
      descriptionEn: row.description_en ?? "",
      ctaMs: row.call_to_action_ms ?? row.call_to_action,
      ctaEn: row.call_to_action_en ?? "",
      servicesMs: row.services_list_ms ?? row.services_list,
      servicesEn: row.services_list_en ?? [],
      heroImageUrl: row.hero_image_url ?? "",
      promoVideoUrl: row.promo_video_url ?? "",
    }) as ServiceDraft,
  };
}
