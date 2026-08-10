import { useQuery } from "@tanstack/react-query";

import { fetchPublishedServiceSeo, type PublishedServiceSeo } from "@/features/website-cms/service-seo/api";
import {
  resolveServiceSeoPath,
  serviceSeoCanonicalUrl,
} from "@/features/website-cms/service-seo/domain";

export interface ResolvedServiceSeo {
  title: string;
  description: string;
  socialTitle: string;
  socialDescription: string;
  image?: string;
  canonicalUrl: string;
  noIndex: boolean;
  noFollow: boolean;
}

export function resolveServiceSeoMetadata(
  record: PublishedServiceSeo | null | undefined,
  language: "ms" | "en",
  fallback: ResolvedServiceSeo,
): ResolvedServiceSeo {
  if (!record) return fallback;
  const selected = language === "en" ? record.seoEn : record.seoMs;
  const malay = record.seoMs;
  const pick = (selectedValue: string, malayValue: string, fallbackValue: string) =>
    selectedValue.trim() || (language === "en" ? malayValue.trim() : "") || fallbackValue;
  return {
    title: pick(selected.title, malay.title, fallback.title),
    description: pick(selected.description, malay.description, fallback.description),
    socialTitle: pick(selected.socialTitle, malay.socialTitle, fallback.socialTitle),
    socialDescription: pick(selected.socialDescription, malay.socialDescription, fallback.socialDescription),
    image: (language === "en" ? record.imageEn : record.imageMs) || record.imageMs || fallback.image,
    canonicalUrl: serviceSeoCanonicalUrl(record.path),
    noIndex: !selected.index,
    noFollow: !selected.follow,
  };
}

export function useServiceSeoMetadata(
  pathname: string,
  language: "ms" | "en",
  fallback: ResolvedServiceSeo,
): ResolvedServiceSeo {
  const canonicalPath = resolveServiceSeoPath(pathname);
  const query = useQuery({
    queryKey: ["service-seo", canonicalPath],
    queryFn: () => fetchPublishedServiceSeo(canonicalPath!),
    enabled: Boolean(canonicalPath),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  return resolveServiceSeoMetadata(query.data, language, fallback);
}
