import type { SeoFields } from "@/features/website-cms/domain/seo";

export function derivePageMetadata(seo: Partial<SeoFields> | null | undefined, fallback: { title: string; description: string; path: string }) {
  const canonical = seo?.canonicalUrl || `https://klinikawfa.com${fallback.path.startsWith("/") ? fallback.path : `/${fallback.path}`}`;
  return {
    title: seo?.title || fallback.title,
    description: seo?.description || fallback.description,
    canonical,
    robots: `${seo?.index === false ? "noindex" : "index"},${seo?.follow === false ? "nofollow" : "follow"}`,
    socialTitle: seo?.socialTitle || seo?.title || fallback.title,
    socialDescription: seo?.socialDescription || seo?.description || fallback.description,
  };
}
