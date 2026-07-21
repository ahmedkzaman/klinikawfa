import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";

import type { AppRole } from "@/contexts/AuthContext";
import {
  generalPageContentSchema,
  pageSlugSchema,
  type GeneralPageContent,
} from "@/features/website-cms/schemas/page";
import {
  homeContentSchema,
  type HomeContent,
} from "@/features/website-cms/schemas/home";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { canManageWebsiteRole } from "@/lib/website-access";

type WebsitePageKind = "home" | "system_content" | "content";
type WebsitePageStatus = "draft" | "published" | "archived";

type WebsiteCmsDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Functions" | "Tables"> & {
    Functions: Database["public"]["Functions"] & {
      create_general_website_page: {
        Args: {
          p_draft_content: Json;
          p_slug: string;
        };
        Returns: Array<{
          id: string;
          kind: WebsitePageKind;
          revision: number;
          slug: string;
          status: WebsitePageStatus;
        }>;
      };
    };
    Tables: Database["public"]["Tables"] & {
      website_pages: {
        Row: {
          created_at: string;
          id: string;
          kind: WebsitePageKind;
          published_at: string | null;
          published_by: string | null;
          published_content: Json;
          revision: number;
          slug: string;
          status: WebsitePageStatus;
          updated_at: string;
        };
        Insert: {
          kind: WebsitePageKind;
          slug: string;
        };
        Update: never;
        Relationships: [];
      };
      website_page_drafts: {
        Row: {
          base_revision: number;
          draft_content: Json;
          page_id: string;
          publish_requested_at: string | null;
          updated_at: string;
          updated_by: string;
        };
        Insert: {
          base_revision: number;
          draft_content: Json;
          page_id: string;
        };
        Update: {
          base_revision?: number;
          draft_content?: Json;
          publish_requested_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "website_page_drafts_page_id_fkey";
            columns: ["page_id"];
            isOneToOne: true;
            referencedRelation: "website_pages";
            referencedColumns: ["id"];
          },
        ];
      };
      website_content_versions: {
        Row: {
          id: string;
          payload: Json;
          published_at: string;
          published_by: string;
          resource_id: string;
          resource_type: string;
          revision: number;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
  };
};

const cmsSupabase = supabase as unknown as SupabaseClient<WebsiteCmsDatabase>;

export type WebsitePageContent = HomeContent | GeneralPageContent;

export interface EditorWebsitePage<T> {
  id: string;
  kind: WebsitePageKind;
  publishedContent: T | null;
  revision: number;
  slug: string;
  status: WebsitePageStatus;
}

export interface EditorWebsitePageDraft<T> {
  baseRevision: number;
  content: T;
  pageId: string;
  persisted: boolean;
}

export interface EditorWebsitePageResult<T> {
  page: EditorWebsitePage<T>;
  draft: EditorWebsitePageDraft<T>;
}

export interface SavePageDraftInput {
  baseRevision: number;
  content: unknown;
  pageId: string;
  slug: string;
}

export interface PublishPageDraftInput {
  expectedRevision: number;
  pageId: string;
}

export interface RestorePageVersionToDraftInput {
  pageId: string;
  versionId: string;
}

export interface WebsitePageVersionSummary {
  id: string;
  publishedAt: string;
  publishedBy: string;
  revision: number;
}

export interface EditorWebsitePageSummary {
  id: string;
  kind: Extract<WebsitePageKind, "content" | "system_content">;
  revision: number;
  slug: string;
  status: WebsitePageStatus;
}

export interface CreateGeneralPageInput {
  content: unknown;
  slug: string;
}

export class StaleWebsitePageDraftError extends Error {
  constructor() {
    super("Website page draft is based on a stale revision");
    this.name = "StaleWebsitePageDraftError";
  }
}

function schemaForSlug(
  slug: string,
): z.ZodType<HomeContent> | z.ZodType<GeneralPageContent> {
  return slug === "home" ? homeContentSchema : generalPageContentSchema;
}

async function requireWebsiteManagerSession(): Promise<void> {
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;

  if (sessionError || !userId) {
    throw new Error("Website editor authorization required");
  }

  const { data: roleRow, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  if (
    roleError ||
    !canManageWebsiteRole((roleRow?.role as AppRole | undefined) ?? null)
  ) {
    throw new Error("Website editor authorization required");
  }
}

export async function fetchPublishedPage<T>(
  slug: string,
  schema: z.ZodType<T>,
  fallback: T,
): Promise<T> {
  try {
    const { data, error } = await cmsSupabase
      .from("website_pages")
      .select("slug,published_content,status,revision")
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle();

    if (error || !data) return fallback;

    const parsed = schema.safeParse(data.published_content);
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}

export async function fetchPublishedGeneralPage(
  slug: string,
): Promise<GeneralPageContent | null> {
  if (!pageSlugSchema.safeParse(slug).success) return null;

  try {
    const { data, error } = await cmsSupabase
      .from("website_pages")
      .select("slug,published_content,status,revision")
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle();

    if (error || !data) return null;
    const parsed = generalPageContentSchema.safeParse(data.published_content);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function listEditorPages(): Promise<EditorWebsitePageSummary[]> {
  await requireWebsiteManagerSession();

  const { data, error } = await cmsSupabase
    .from("website_pages")
    .select("id,kind,slug,status,revision,created_at")
    .in("kind", ["content", "system_content"])
    .order("created_at", { ascending: false });

  if (error || !data) {
    throw new Error("Website pages could not be loaded");
  }

  return data.map((page) => ({
    id: page.id,
    kind: page.kind as EditorWebsitePageSummary["kind"],
    revision: page.revision,
    slug: page.slug,
    status: page.status,
  }));
}

async function buildEditorPageResult(
  pageRow: WebsiteCmsDatabase["public"]["Tables"]["website_pages"]["Row"],
): Promise<EditorWebsitePageResult<WebsitePageContent>> {
  const schema = schemaForSlug(pageRow.slug);
  const published = schema.safeParse(pageRow.published_content);
  if (pageRow.status === "published" && !published.success) {
    throw new Error("Website page contains invalid published content");
  }

  const { data: draftRow, error: draftError } = await cmsSupabase
    .from("website_page_drafts")
    .select("page_id,draft_content,base_revision")
    .eq("page_id", pageRow.id)
    .maybeSingle();

  if (draftError) {
    throw new Error("Website page draft could not be loaded");
  }

  let draft: EditorWebsitePageDraft<WebsitePageContent>;
  if (draftRow) {
    const parsedDraft = schema.safeParse(draftRow.draft_content);
    if (!parsedDraft.success) {
      throw new Error("Website page contains an invalid draft");
    }
    draft = {
      baseRevision: draftRow.base_revision,
      content: parsedDraft.data,
      pageId: draftRow.page_id,
      persisted: true,
    };
  } else if (published.success) {
    draft = {
      baseRevision: pageRow.revision,
      content: structuredClone(published.data),
      pageId: pageRow.id,
      persisted: false,
    };
  } else {
    throw new Error("Website page draft could not be loaded");
  }

  return {
    page: {
      id: pageRow.id,
      kind: pageRow.kind,
      publishedContent: published.success ? published.data : null,
      revision: pageRow.revision,
      slug: pageRow.slug,
      status: pageRow.status,
    },
    draft,
  };
}

export function fetchEditorPage(
  slug: "home",
): Promise<EditorWebsitePageResult<HomeContent>>;
export function fetchEditorPage(
  slug: string,
): Promise<EditorWebsitePageResult<GeneralPageContent>>;
export async function fetchEditorPage(
  slug: string,
): Promise<EditorWebsitePageResult<WebsitePageContent>> {
  await requireWebsiteManagerSession();

  const { data: pageRow, error: pageError } = await cmsSupabase
    .from("website_pages")
    .select("id,kind,slug,published_content,status,revision")
    .eq("slug", slug)
    .maybeSingle();

  if (pageError || !pageRow) {
    throw new Error("Website page could not be loaded");
  }

  return buildEditorPageResult(pageRow);
}

export async function fetchEditorPageById(
  pageId: string,
): Promise<EditorWebsitePageResult<GeneralPageContent>> {
  await requireWebsiteManagerSession();

  const { data: pageRow, error: pageError } = await cmsSupabase
    .from("website_pages")
    .select(
      "id,kind,slug,published_content,status,revision,published_at,published_by,created_at,updated_at",
    )
    .eq("id", pageId)
    .in("kind", ["content", "system_content"])
    .maybeSingle();

  if (pageError || !pageRow) {
    throw new Error("Website page could not be loaded");
  }

  return buildEditorPageResult(pageRow) as Promise<
    EditorWebsitePageResult<GeneralPageContent>
  >;
}

export async function createGeneralPage(
  input: CreateGeneralPageInput,
): Promise<EditorWebsitePageResult<GeneralPageContent>> {
  const slug = pageSlugSchema.safeParse(input.slug);
  const content = generalPageContentSchema.safeParse(input.content);
  if (!slug.success || !content.success) {
    throw new Error("Invalid general page draft");
  }

  await requireWebsiteManagerSession();

  const { data: createdPages, error: createError } = await cmsSupabase.rpc(
    "create_general_website_page",
    {
      p_draft_content: content.data as Json,
      p_slug: slug.data,
    },
  );
  const page = createdPages?.[0];

  if (createError || !page) {
    throw new Error("Website page could not be created");
  }

  return {
    page: {
      id: page.id,
      kind: page.kind,
      publishedContent: null,
      revision: page.revision,
      slug: page.slug,
      status: page.status,
    },
    draft: {
      baseRevision: page.revision,
      content: content.data,
      pageId: page.id,
      persisted: true,
    },
  };
}

export async function savePageDraft(
  input: SavePageDraftInput,
): Promise<EditorWebsitePageDraft<WebsitePageContent>> {
  const schema = schemaForSlug(input.slug);
  const parsed = schema.safeParse(input.content);

  if (!parsed.success) {
    throw new Error("Invalid website page draft");
  }

  await requireWebsiteManagerSession();

  const updatePayload = {
    draft_content: parsed.data as Json,
    base_revision: input.baseRevision,
  };
  const { data: updatedDraft, error: updateError } = await cmsSupabase
    .from("website_page_drafts")
    .update(updatePayload)
    .eq("page_id", input.pageId)
    .select("page_id,draft_content,base_revision")
    .maybeSingle();

  if (updateError) {
    throw new Error("Website page draft could not be saved");
  }

  let savedDraft = updatedDraft;
  if (!savedDraft) {
    const { data: insertedDraft, error: insertError } = await cmsSupabase
      .from("website_page_drafts")
      .insert({ page_id: input.pageId, ...updatePayload })
      .select("page_id,draft_content,base_revision")
      .single();

    if (insertError || !insertedDraft) {
      throw new Error("Website page draft could not be saved");
    }
    savedDraft = insertedDraft;
  }

  const savedContent = schema.safeParse(savedDraft.draft_content);
  if (!savedContent.success) {
    throw new Error("Saved website page draft is invalid");
  }

  return {
    baseRevision: savedDraft.base_revision,
    content: savedContent.data,
    pageId: savedDraft.page_id,
    persisted: true,
  };
}

export async function publishPageDraft(
  input: PublishPageDraftInput,
): Promise<void> {
  await requireWebsiteManagerSession();

  const { data, error } = await cmsSupabase
    .from("website_page_drafts")
    .update({ publish_requested_at: new Date().toISOString() })
    .eq("page_id", input.pageId)
    .eq("base_revision", input.expectedRevision)
    .select("page_id")
    .maybeSingle();

  if (error?.code === "40001" || (!error && !data)) {
    throw new StaleWebsitePageDraftError();
  }

  if (error || !data) {
    throw new Error("Website page draft could not be published");
  }
}

export async function fetchPageVersions(
  pageId: string,
): Promise<WebsitePageVersionSummary[]> {
  await requireWebsiteManagerSession();

  const { data, error } = await cmsSupabase
    .from("website_content_versions")
    .select("id,revision,published_at,published_by")
    .eq("resource_type", "page")
    .eq("resource_id", pageId)
    .order("published_at", { ascending: false })
    .limit(20);

  if (error || !data) {
    throw new Error("Website page versions could not be loaded");
  }

  return data.map((version) => ({
    id: version.id,
    publishedAt: version.published_at,
    publishedBy: version.published_by,
    revision: version.revision,
  }));
}

export async function restorePageVersionToDraft(
  input: RestorePageVersionToDraftInput,
): Promise<void> {
  await requireWebsiteManagerSession();

  const { data: version, error: versionError } = await cmsSupabase
    .from("website_content_versions")
    .select("id,resource_id,payload")
    .eq("id", input.versionId)
    .eq("resource_type", "page")
    .eq("resource_id", input.pageId)
    .maybeSingle();

  if (versionError || !version) {
    throw new Error("Website page version could not be loaded");
  }

  const { data: draft, error: draftError } = await cmsSupabase
    .from("website_page_drafts")
    .update({ draft_content: version.payload })
    .eq("page_id", input.pageId)
    .select("page_id")
    .maybeSingle();

  if (draftError || !draft) {
    throw new Error("Website page version could not be restored");
  }
}
