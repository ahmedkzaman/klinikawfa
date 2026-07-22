import { z } from "zod";

import type { WebsiteResourceType } from "@/features/website-cms/resources/types";

export { seoFieldsSchema } from "@/features/website-cms/domain/seo";
export type { SeoFields } from "@/features/website-cms/domain/seo";

export const contentStatusSchema = z.enum([
  "draft",
  "scheduled",
  "published",
  "trash",
]);

export type ContentStatus = z.infer<typeof contentStatusSchema>;

export const contentListQuerySchema = z
  .object({
    status: z.union([contentStatusSchema, z.literal("all")]).default("all"),
    search: z.string().trim().max(200).default(""),
    sort: z
      .enum(["updated_desc", "updated_asc", "title_asc", "title_desc"])
      .default("updated_desc"),
    page: z.number().int().positive().default(1),
    pageSize: z.union([z.literal(20), z.literal(50), z.literal(100)]).default(20),
  })
  .strict();

export interface ContentListItem {
  id: string;
  type: WebsiteResourceType | "page";
  title: string;
  typeLabel?: string;
  slug: string;
  status: ContentStatus;
  authorName: string | null;
  updatedAt: string;
  scheduledAt: string | null;
  revision: number;
}

export type ContentListQuery = z.infer<typeof contentListQuerySchema>;

export interface ContentListResult {
  items: ContentListItem[];
  total: number;
  totalsByStatus: Record<ContentStatus, number>;
}
