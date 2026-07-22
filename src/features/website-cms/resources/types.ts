export const WEBSITE_RESOURCE_TYPES = [
  "service",
  "team_member",
  "blog_post",
  "gallery_image",
  "review",
] as const;

export type WebsiteResourceType = (typeof WEBSITE_RESOURCE_TYPES)[number];

export interface WebsiteResourceDraftEnvelope<T> {
  baseRevision: number;
  payload: T;
  resourceId: string;
  resourceType: WebsiteResourceType | "page";
  updatedAt?: string;
  lifecycleStatus?: "draft" | "scheduled" | "published" | "trash";
  lifecycleScheduledAt?: string | null;
}
