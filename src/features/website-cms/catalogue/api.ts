import type { ContentStatus } from "@/features/website-cms/domain/content";
import {
  FIXED_WEBSITE_DESTINATIONS,
  type WebsiteDestination,
  type WebsiteDestinationCatalogueResult,
  type WebsiteDestinationType,
} from "@/features/website-cms/catalogue/domain";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function listWebsiteDestinations(): Promise<WebsiteDestinationCatalogueResult> {
  const resourcesApi = import("@/features/website-cms/api/resources");
  const results = await Promise.allSettled([
    loadPages(),
    resourcesApi.then(({ listServiceResources }) => listServiceResources()),
    resourcesApi.then(({ listResourceSummaries }) => listResourceSummaries("blog_post")),
  ]);
  const items = FIXED_WEBSITE_DESTINATIONS.map((item) => ({ ...item }));
  const errors: WebsiteDestinationType[] = [];

  const [pages, services, posts] = results;
  if (pages.status === "fulfilled") {
    for (const page of pages.value) {
      if (!slugPattern.test(page.slug)) continue;
      items.push({
        id: `page-${page.id}`, type: "page", typeLabel: page.kind === "system_content" ? "System content" : "Page", titleMs: page.slug, titleEn: titleFromSlug(page.slug),
        href: `/pages/${page.slug}`, editHref: `/editor/pages/${page.id}`,
        status: normalizeStatus(page.status), updatedAt: page.updatedAt,
      });
    }
  } else errors.push("page");

  if (services.status === "fulfilled") {
    for (const service of services.value) {
      if (!slugPattern.test(service.slug)) continue;
      items.push({
        id: `service-${service.id}`, type: "service", titleMs: service.title, titleEn: service.title,
        href: `/services/${service.slug}`, editHref: `/editor/services/${service.id}`,
        status: "published", updatedAt: null,
      });
    }
  } else errors.push("service");

  if (posts.status === "fulfilled") {
    for (const post of posts.value) {
      if (!slugPattern.test(post.slug)) continue;
      items.push({
        id: `post-${post.id}`, type: "post", titleMs: post.title, titleEn: post.title,
        href: `/health-tips/${post.slug}`, editHref: `/editor/posts/${post.id}`,
        status: normalizeStatus(post.status), updatedAt: post.updatedAt,
      });
    }
  } else errors.push("post");

  const deduplicated = new Map<string, WebsiteDestination>();
  for (const item of items) {
    const key = normalizeHref(item.href);
    const existing = deduplicated.get(key);
    if (!existing || (!existing.editHref && item.editHref)) deduplicated.set(key, { ...item, href: key });
  }
  return { items: [...deduplicated.values()], errors };
}

async function loadPages() {
  const { listEditorPages } = await import("@/features/website-cms/api/pages");
  return listEditorPages();
}

function normalizeHref(href: string): string {
  return href === "/" ? href : href.replace(/\/+$/, "");
}

function normalizeStatus(status: string): ContentStatus {
  return status === "published" || status === "scheduled" || status === "trash" ? status : "draft";
}

function titleFromSlug(slug: string): string {
  return slug.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
