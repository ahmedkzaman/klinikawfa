import type { WebsiteResourceType } from "./types";

export function prepareResourcePayloadForPublish<T extends Record<string, unknown>>(
  type: WebsiteResourceType,
  payload: T,
): T {
  if (type === "blog_post") {
    return { ...payload, status: "published", scheduledAt: null };
  }
  if (type === "review") {
    return { ...payload, status: "published" };
  }
  return payload;
}
