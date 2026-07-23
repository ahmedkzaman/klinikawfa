import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { MainLayout } from "@/components/layout";
import { SEOHead } from "@/components/seo";
import { GeneralPageRenderer } from "@/components/website/GeneralPageRenderer";
import { useLanguage, type Language } from "@/contexts/LanguageContext";
import { fetchPublishedGeneralPage } from "@/features/website-cms/api/pages";
import {
  pageSlugSchema,
  type GeneralPageContent,
} from "@/features/website-cms/schemas/page";
import type { BilingualText } from "@/features/website-cms/schemas/common";
import { PublicEmptyState, PublicLoadingState } from "@/components/public";

function localizedPageText(value: BilingualText, language: Language) {
  return language === "en" && value.en.trim() ? value.en : value.ms;
}

function GeneralPageNotFound() {
  return (
    <MainLayout>
      <SEOHead
        description="The requested page is not available."
        noIndex
        title="Page not found"
      />
      <section className="flex min-h-[50vh] items-center justify-center px-4 text-center">
        <div className="w-full max-w-2xl">
          <h1 className="text-4xl font-bold">404</h1>
          <PublicEmptyState
            title="Page not found"
            description="Oops! Page not found"
          />
          <a className="mt-4 inline-flex min-h-11 items-center text-primary underline hover:text-primary/90" href="/">
            Return to Home
          </a>
        </div>
      </section>
    </MainLayout>
  );
}

export default function GeneralPage() {
  const { language } = useLanguage();
  const { slug = "" } = useParams();
  const validSlug = pageSlugSchema.safeParse(slug).success;
  const [result, setResult] = useState<{
    content: GeneralPageContent | null;
    loadedSlug: string;
  } | null>(null);

  useEffect(() => {
    let active = true;
    if (!validSlug) {
      setResult({ content: null, loadedSlug: slug });
      return () => {
        active = false;
      };
    }

    setResult(null);
    void fetchPublishedGeneralPage(slug).then((content) => {
      if (active) setResult({ content, loadedSlug: slug });
    });

    return () => {
      active = false;
    };
  }, [slug, validSlug]);

  if (!result || result.loadedSlug !== slug) {
    return (
      <MainLayout>
        <SEOHead
          description="Loading page content."
          noIndex
          title="Loading"
        />
        <PublicLoadingState label="Loading page" />
      </MainLayout>
    );
  }

  if (!result.content) return <GeneralPageNotFound />;

  const seoTitle = localizedPageText(result.content.seo.title, language);
  const seoDescription = localizedPageText(
    result.content.seo.description,
    language,
  );

  return (
    <MainLayout>
      <SEOHead
        description={seoDescription}
        image={result.content.heroImage ?? undefined}
        title={seoTitle}
        url={`/pages/${slug}`}
      />
      <GeneralPageRenderer content={result.content} />
    </MainLayout>
  );
}
