import type { z } from "zod";

import type {
  ContentListItem,
  ContentListQuery,
  ContentListResult,
  ContentStatus,
} from "@/features/website-cms/domain/content";
import {
  fetchResourceForEditor,
  listResourceSummaries,
  newResourceId,
  publishResourceDraft,
  saveResourceDraft,
} from "@/features/website-cms/api/resources";
import { websiteResourceRegistry } from "@/features/website-cms/resources/registry";
import type {
  WebsiteResourceDraftEnvelope,
  WebsiteResourceType,
} from "@/features/website-cms/resources/types";
import { supabase } from "@/integrations/supabase/client";

export interface WebsiteResourceAdapter<TDraft> {
  list(query: ContentListQuery): Promise<ContentListResult>;
  load(id: string): Promise<WebsiteResourceDraftEnvelope<TDraft>>;
  validate(value: unknown): TDraft;
  saveDraft(draft: WebsiteResourceDraftEnvelope<TDraft>): Promise<void>;
  publish(id: string, expectedRevision: number): Promise<void>;
  schedule(id: string, expectedRevision: number, scheduledAt: string): Promise<void>;
  trash(id: string, expectedRevision: number): Promise<void>;
  restore(id: string, expectedRevision: number): Promise<void>;
  duplicate(id: string): Promise<WebsiteResourceDraftEnvelope<TDraft>>;
}

export function validateWebsiteResourceDraft<T extends WebsiteResourceType>(
  type: T,
  value: unknown,
): z.infer<(typeof websiteResourceRegistry)[T]> {
  return websiteResourceRegistry[type].parse(value);
}

type EditableResourceType = Exclude<WebsiteResourceType, "service">;

export function createWebsiteResourceAdapter<TDraft>(
  type: EditableResourceType,
): WebsiteResourceAdapter<TDraft> {
  return {
    list: (query) => listResourceContent(type, query),
    async load(id) {
      const [result, lifecycle] = await Promise.all([
        fetchResourceForEditor(type, id),
        loadLifecycleState(type, id),
      ]);
      if (!result) throw new Error("Website content could not be loaded");
      const payload = type === "blog_post" && lifecycle && typeof result.payload === "object" && result.payload !== null
        ? { ...result.payload, status: lifecycle.status, scheduledAt: lifecycle.scheduledAt }
        : result.payload;
      return {
        baseRevision: lifecycle?.revision ?? result.revision,
        payload: payload as TDraft,
        resourceId: id,
        resourceType: type,
        updatedAt: lifecycle?.updatedAt,
        lifecycleStatus: lifecycle?.status,
        lifecycleScheduledAt: lifecycle?.scheduledAt,
      };
    },
    validate(value) {
      return validateWebsiteResourceDraft(type, value) as TDraft;
    },
    async saveDraft(draft) {
      await saveResourceDraft(draft);
    },
    async publish(id, expectedRevision) {
      await publishResourceDraft(type, id, expectedRevision);
    },
    async schedule(id, expectedRevision, scheduledAt) {
      await callLifecycle("schedule_website_content", type, id, expectedRevision, scheduledAt);
    },
    async trash(id, expectedRevision) {
      await callLifecycle("trash_website_content", type, id, expectedRevision);
    },
    async restore(id, expectedRevision) {
      await callLifecycle("restore_website_content", type, id, expectedRevision);
    },
    async duplicate(id) {
      const source = await this.load(id);
      const resourceId = newResourceId();
      const payload = cloneWithCopySlug(source.payload);
      const draft = {
        baseRevision: 0,
        payload,
        resourceId,
        resourceType: type,
      } as WebsiteResourceDraftEnvelope<TDraft>;
      await this.saveDraft(draft);
      return draft;
    },
  };
}

async function listResourceContent(
  type: EditableResourceType,
  query: ContentListQuery,
): Promise<ContentListResult> {
  const [summaries, drafts, lifecycle] = await Promise.all([
    listResourceSummaries(type),
    loadDraftSummaries(type),
    loadLifecycle(type),
  ]);
  const byId = new Map<string, ContentListItem>();
  for (const summary of summaries) {
    const state = lifecycle.get(summary.id);
    byId.set(summary.id, {
      id: summary.id,
      type,
      title: summary.title,
      slug: summary.slug,
      status: state?.status ?? normalizeStatus(summary.status),
      authorName: null,
      updatedAt: state?.updatedAt ?? summary.updatedAt,
      scheduledAt: state?.scheduledAt ?? summary.scheduledAt,
      revision: state?.revision ?? summary.revision,
    });
  }
  for (const draft of drafts) {
    const existing = byId.get(draft.id);
    const state = lifecycle.get(draft.id);
    byId.set(draft.id, {
      id: draft.id,
      type,
      title: draft.title || existing?.title || "Untitled",
      slug: draft.slug || existing?.slug || draft.id,
      status: state?.status ?? existing?.status ?? "draft",
      authorName: null,
      updatedAt: state?.updatedAt ?? draft.updatedAt,
      scheduledAt: state?.scheduledAt ?? existing?.scheduledAt ?? null,
      revision: state?.revision ?? draft.revision,
    });
  }
  return filterAndPage([...byId.values()], query);
}

async function loadDraftSummaries(type: EditableResourceType) {
  const { data, error } = await supabase
    .from("website_content_drafts")
    .select("resource_id,draft_payload,base_revision,updated_at")
    .eq("resource_type", type);
  if (error || !data) return [];
  return data.map((row) => {
    const payload = row.draft_payload as Record<string, unknown>;
    return {
      id: row.resource_id,
      title: String(payload.titleMs ?? payload.nameMs ?? payload.altMs ?? ""),
      slug: String(payload.slug ?? ""),
      revision: row.base_revision,
      updatedAt: row.updated_at,
    };
  });
}

async function loadLifecycle(resourceType: WebsiteResourceType | "page") {
  const { data, error } = await supabase
    .from("website_content_lifecycle")
    .select("resource_id,status,revision,scheduled_at,updated_at")
    .eq("resource_type", resourceType);
  const result = new Map<string, { status: ContentStatus; revision: number; scheduledAt: string | null; updatedAt: string }>();
  if (error || !data) return result;
  for (const row of data) {
    result.set(row.resource_id, {
      status: row.status,
      revision: row.revision,
      scheduledAt: row.scheduled_at,
      updatedAt: row.updated_at,
    });
  }
  return result;
}

async function loadLifecycleState(resourceType: WebsiteResourceType | "page", resourceId: string) {
  const { data, error } = await supabase
    .from("website_content_lifecycle")
    .select("status,revision,scheduled_at,updated_at")
    .eq("resource_type", resourceType)
    .eq("resource_id", resourceId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    status: data.status as ContentStatus,
    revision: data.revision,
    scheduledAt: data.scheduled_at,
    updatedAt: data.updated_at,
  };
}

function filterAndPage(items: ContentListItem[], query: ContentListQuery): ContentListResult {
  const totalsByStatus: Record<ContentStatus, number> = { draft: 0, scheduled: 0, published: 0, trash: 0 };
  for (const item of items) totalsByStatus[item.status] += 1;
  const needle = query.search.toLocaleLowerCase();
  const filtered = items.filter((item) =>
    (query.status === "all" || item.status === query.status) &&
    (!needle || `${item.title} ${item.slug}`.toLocaleLowerCase().includes(needle)),
  );
  filtered.sort((left, right) => {
    if (query.sort === "title_asc") return left.title.localeCompare(right.title);
    if (query.sort === "title_desc") return right.title.localeCompare(left.title);
    const delta = new Date(left.updatedAt).getTime() - new Date(right.updatedAt).getTime();
    return query.sort === "updated_asc" ? delta : -delta;
  });
  const start = (query.page - 1) * query.pageSize;
  return { items: filtered.slice(start, start + query.pageSize), total: filtered.length, totalsByStatus };
}

function normalizeStatus(status: string): ContentStatus {
  return status === "published" || status === "scheduled" || status === "trash" ? status : "draft";
}

function cloneWithCopySlug<TDraft>(payload: TDraft): TDraft {
  const clone = structuredClone(payload) as TDraft & { slug?: string };
  if (clone.slug) clone.slug = `${clone.slug}-copy`;
  return clone;
}

async function callLifecycle(
  fn: "schedule_website_content" | "trash_website_content" | "restore_website_content",
  type: WebsiteResourceType | "page",
  id: string,
  expectedRevision: number,
  scheduledAt?: string,
) {
  const args = {
    p_resource_type: type,
    p_resource_id: id,
    p_expected_revision: expectedRevision,
    ...(fn === "schedule_website_content" ? { p_scheduled_at: scheduledAt } : {}),
  };
  const { error } = await supabase.rpc(fn, args as never);
  if (error) throw new Error(error.message);
}
