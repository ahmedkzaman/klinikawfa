import type {
  ContentListItem,
  ContentListQuery,
  ContentListResult,
  ContentStatus,
} from "@/features/website-cms/domain/content";
import {
  createGeneralPage,
  fetchEditorPageById,
  listEditorPages,
  publishPageDraft,
  savePageDraft,
} from "@/features/website-cms/api/pages";
import { generalPageContentSchema } from "@/features/website-cms/schemas/page";
import type { WebsiteResourceAdapter } from "@/features/website-cms/resources/adapters";

export const pageAdapter: WebsiteResourceAdapter<unknown> = {
  async list(query) {
    const pages = await listEditorPages();
    const items: ContentListItem[] = pages.map((page) => ({
      id: page.id,
      type: "page",
      title: page.slug,
      typeLabel: page.kind === "system_content" ? "System content" : "Content",
      slug: page.slug,
      status: normalizeStatus(page.status),
      authorName: null,
      updatedAt: page.updatedAt ?? "1970-01-01T00:00:00.000Z",
      scheduledAt: page.scheduledAt,
      revision: page.revision,
    }));
    return filterAndPage(items, query);
  },
  async load(id) {
    const result = await fetchEditorPageById(id);
    return {
      baseRevision: result.draft.baseRevision,
      payload: result.draft.content,
      resourceId: id,
      resourceType: "page",
    };
  },
  validate: (value) => generalPageContentSchema.parse(value),
  async saveDraft(draft) {
    const page = await fetchEditorPageById(draft.resourceId);
    await savePageDraft({
      baseRevision: draft.baseRevision,
      content: draft.payload,
      pageId: draft.resourceId,
      slug: page.page.slug,
    });
  },
  async publish(id, expectedRevision) {
    await publishPageDraft({ pageId: id, expectedRevision });
  },
  async schedule(id, expectedRevision, scheduledAt) {
    await callPageLifecycle("schedule_website_content", id, expectedRevision, scheduledAt);
  },
  async trash(id, expectedRevision) {
    await callPageLifecycle("trash_website_content", id, expectedRevision);
  },
  async restore(id, expectedRevision) {
    await callPageLifecycle("restore_website_content", id, expectedRevision);
  },
  async duplicate(id) {
    const source = await fetchEditorPageById(id);
    const created = await createGeneralPage({
      content: structuredClone(source.draft.content),
      slug: `${source.page.slug}-copy`,
    });
    return {
      baseRevision: created.draft.baseRevision,
      payload: created.draft.content,
      resourceId: created.page.id,
      resourceType: "page",
    };
  },
};

async function callPageLifecycle(
  fn: "schedule_website_content" | "trash_website_content" | "restore_website_content",
  id: string,
  expectedRevision: number,
  scheduledAt?: string,
) {
  const { supabase } = await import("@/integrations/supabase/client");
  const { error } = await supabase.rpc(fn, {
    p_resource_type: "page",
    p_resource_id: id,
    p_expected_revision: expectedRevision,
    ...(fn === "schedule_website_content" ? { p_scheduled_at: scheduledAt } : {}),
  } as never);
  if (error) throw new Error(error.message);
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
