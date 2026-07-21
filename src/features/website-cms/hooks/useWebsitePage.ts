import { useEffect, useRef, useState } from "react";

import { fetchPublishedPage } from "@/features/website-cms/api/pages";
import {
  homeContentSchema,
  type HomeContent,
} from "@/features/website-cms/schemas/home";
import {
  generalPageContentSchema,
  type GeneralPageContent,
} from "@/features/website-cms/schemas/page";

export function usePublishedPage(
  slug: "home",
  fallback: HomeContent,
): HomeContent;
export function usePublishedPage(
  slug: string,
  fallback: GeneralPageContent,
): GeneralPageContent;
export function usePublishedPage(
  slug: string,
  fallback: HomeContent | GeneralPageContent,
): HomeContent | GeneralPageContent {
  const schema = slug === "home" ? homeContentSchema : generalPageContentSchema;
  const fallbackRef = useRef(fallback);
  const committedSlugRef = useRef(slug);
  const [loaded, setLoaded] = useState<{
    slug: string;
    value: HomeContent | GeneralPageContent;
  }>({ slug, value: fallback });
  fallbackRef.current = fallback;

  const content =
    committedSlugRef.current === slug && loaded.slug === slug
      ? loaded.value
      : fallback;

  useEffect(() => {
    let active = true;
    const requestFallback = fallbackRef.current;
    committedSlugRef.current = slug;

    setLoaded((current) =>
      current.slug === slug && current.value === requestFallback
        ? current
        : { slug, value: requestFallback },
    );
    void fetchPublishedPage(slug, schema, requestFallback).then((value) => {
      if (active) {
        setLoaded((current) =>
          current.slug === slug && current.value === value
            ? current
            : { slug, value },
        );
      }
    });

    return () => {
      active = false;
    };
  }, [schema, slug]);

  return content;
}
