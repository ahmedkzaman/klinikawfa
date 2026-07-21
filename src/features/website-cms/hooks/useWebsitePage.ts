import { useEffect, useState } from "react";

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
  const [loaded, setLoaded] = useState<{
    fallback: HomeContent | GeneralPageContent;
    slug: string;
    value: HomeContent | GeneralPageContent;
  }>({ fallback, slug, value: fallback });
  const content =
    loaded.slug === slug && loaded.fallback === fallback
      ? loaded.value
      : fallback;

  useEffect(() => {
    let active = true;
    const schema = slug === "home" ? homeContentSchema : generalPageContentSchema;

    setLoaded((current) =>
      current.slug === slug &&
      current.fallback === fallback &&
      current.value === fallback
        ? current
        : { fallback, slug, value: fallback },
    );
    void fetchPublishedPage(slug, schema, fallback).then((value) => {
      if (active) {
        setLoaded((current) =>
          current.slug === slug &&
          current.fallback === fallback &&
          current.value === value
            ? current
            : { fallback, slug, value },
        );
      }
    });

    return () => {
      active = false;
    };
  }, [fallback, slug]);

  return content;
}
