import type { z } from "zod";

import {
  blogPostDraftSchema,
  galleryImageDraftSchema,
  reviewDraftSchema,
  serviceDraftSchema,
  teamMemberDraftSchema,
} from "@/features/website-cms/resources/schemas";
import type { WebsiteResourceType } from "@/features/website-cms/resources/types";

export const websiteResourceRegistry: Readonly<Record<WebsiteResourceType, z.ZodTypeAny>> = {
  service: serviceDraftSchema,
  team_member: teamMemberDraftSchema,
  blog_post: blogPostDraftSchema,
  gallery_image: galleryImageDraftSchema,
  review: reviewDraftSchema,
};

export function parseWebsiteResourceDraft(type: WebsiteResourceType, payload: unknown): unknown {
  return websiteResourceRegistry[type].parse(payload);
}
