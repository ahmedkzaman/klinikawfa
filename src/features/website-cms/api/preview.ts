import { fetchEditorPageById } from "@/features/website-cms/api/pages";
import { fetchResourceForEditor } from "@/features/website-cms/api/resources";
import { generalPageContentSchema } from "@/features/website-cms/schemas/page";
import { parseWebsiteResourceDraft } from "@/features/website-cms/resources/registry";
import type { WebsiteResourceType } from "@/features/website-cms/resources/types";

export type DraftPreviewResourceType = "page" | Exclude<WebsiteResourceType, "service">;

export async function loadDraftPreview(resourceType: string, id: string) {
  if (!id || id.length > 100) throw new Error("Invalid preview identifier");
  if (resourceType === "page") {
    const result = await fetchEditorPageById(id);
    return { resourceType: "page" as const, payload: generalPageContentSchema.parse(result.draft.content) };
  }
  if (!["team_member", "blog_post", "gallery_image", "review"].includes(resourceType)) {
    throw new Error("Unsupported preview type");
  }
  const type = resourceType as Exclude<WebsiteResourceType, "service">;
  const result = await fetchResourceForEditor(type, id);
  if (!result) throw new Error("Draft preview not found");
  return { resourceType: type, payload: parseWebsiteResourceDraft(type, result.payload) };
}
