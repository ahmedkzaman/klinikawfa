import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";

import type { AppRole } from "@/contexts/AuthContext";
import {
  generalPageContentSchema,
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
  public: Omit<Database["public"], "Tables"> & {
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
    };
  };
};

const cmsSupabase = supabase as unknown as SupabaseClient<WebsiteCmsDatabase>;

export type WebsitePageContent = HomeContent | GeneralPageContent;

export interface EditorWebsitePage<T> {
  id: string;
  kind: WebsitePageKind;
  publishedContent: T;
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

  const schema = schemaForSlug(slug);
  const published = schema.safeParse(pageRow.published_content);
  if (!published.success) {
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
  } else {
    draft = {
      baseRevision: pageRow.revision,
      content: published.data,
      pageId: pageRow.id,
      persisted: false,
    };
  }

  return {
    page: {
      id: pageRow.id,
      kind: pageRow.kind,
      publishedContent: published.data,
      revision: pageRow.revision,
      slug: pageRow.slug,
      status: pageRow.status,
    },
    draft,
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

  const payload = {
    page_id: input.pageId,
    draft_content: parsed.data as Json,
    base_revision: input.baseRevision,
  };
  const { data, error } = await cmsSupabase
    .from("website_page_drafts")
    .upsert(payload, { onConflict: "page_id" })
    .select("page_id,draft_content,base_revision")
    .single();

  if (error || !data) {
    throw new Error("Website page draft could not be saved");
  }

  const savedContent = schema.safeParse(data.draft_content);
  if (!savedContent.success) {
    throw new Error("Saved website page draft is invalid");
  }

  return {
    baseRevision: data.base_revision,
    content: savedContent.data,
    pageId: data.page_id,
    persisted: true,
  };
}
