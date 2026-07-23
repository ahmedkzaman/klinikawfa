import type { Language } from "@/contexts/LanguageContext";
import { useLanguage } from "@/contexts/LanguageContext";
import type { GeneralPageContent } from "@/features/website-cms/schemas/page";
import {
  safeHrefSchema,
  safeMediaSchema,
  websiteCtaHrefSchema,
  type BilingualText,
} from "@/features/website-cms/schemas/common";
import { sanitizeGeneralPageHtml } from "@/lib/sanitize-general-page-html";
import { PageSectionsRenderer } from "@/features/website-cms/sections/registry";

interface GeneralPageRendererProps {
  content: GeneralPageContent;
  preview?: boolean;
}

function localizedPageText(
  value: BilingualText | undefined,
  language: Language,
): string {
  if (!value) return "";
  return language === "en" && value.en.trim() ? value.en : value.ms;
}

function PreviewMediaPlaceholder() {
  return (
    <div
      className="flex min-h-40 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-100 px-6 text-center text-sm font-medium text-slate-600"
    >
      Media preview disabled
    </div>
  );
}

export function GeneralPageRenderer({
  content,
  preview = false,
}: GeneralPageRendererProps) {
  const { language } = useLanguage();
  const title = localizedPageText(content.title, language);
  const body = sanitizeGeneralPageHtml(
    localizedPageText(content.body, language),
  );
  const heroImage = safeHrefSchema.safeParse(content.heroImage);
  const media = Array.isArray(content.media)
    ? content.media.flatMap((item) => {
        const parsed = safeMediaSchema.safeParse(item);
        return parsed.success ? [parsed.data] : [];
      })
    : [];
  const cta = content.cta
    ? websiteCtaHrefSchema.safeParse(content.cta.href)
    : null;

  return (
    <article className="bg-white text-slate-900">
      <header className="mx-auto max-w-5xl px-4 pb-8 pt-12 sm:px-6 lg:px-8 lg:pt-16">
        <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl">
          {title}
        </h1>
      </header>

      {heroImage?.success && content.heroImage ? (
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          {preview ? (
            <PreviewMediaPlaceholder />
          ) : (
            <img
              alt={localizedPageText(content.heroAlt, language)}
              className="max-h-[32rem] w-full rounded-2xl object-cover"
              decoding="async"
              src={content.heroImage}
            />
          )}
        </div>
      ) : null}

      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <div
          className="prose prose-slate max-w-none"
          dangerouslySetInnerHTML={{ __html: body }}
        />

        {media.length > 0 && (
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {media.map((item, index) => {
              const alt = localizedPageText(item.alt, language);
              if (preview) {
                return <PreviewMediaPlaceholder key={`${item.type}-${index}`} />;
              }
              if (item.type === "image") {
                return (
                  <img
                    alt={alt}
                    className="h-full max-h-96 w-full rounded-xl object-cover"
                    decoding="async"
                    key={`${item.type}-${index}`}
                    loading="lazy"
                    src={item.url}
                  />
                );
              }
              if (item.type === "video") {
                return (
                  <video
                    aria-label={alt}
                    className="max-h-96 w-full rounded-xl bg-black"
                    controls
                    key={`${item.type}-${index}`}
                    preload="metadata"
                    src={item.url}
                  />
                );
              }
              return null;
            })}
          </div>
        )}

        {content.cta && cta?.success && (
          <a
            className="mt-10 inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white transition-colors hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
            href={cta.data}
            rel={cta.data.startsWith("http") ? "noopener noreferrer" : undefined}
          >
            {localizedPageText(content.cta.label, language)}
          </a>
        )}
      </div>
      {content.sections?.length ? (
        <PageSectionsRenderer language={language} sections={content.sections} />
      ) : null}
    </article>
  );
}
