import { CalendarDays, CheckCircle2, MapPin, MessageCircle, ShieldCheck } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout';
import { SchemaMarkup, SEOHead } from '@/components/seo';
import { Button } from '@/components/ui/button';
import { LOCAL_SERVICE_PAGES, LOCAL_SERVICE_REVIEW } from '@/content/localServicePages';
import { CLINIC_INFO } from '@/lib/constants';
import { useLanguage } from '@/contexts/LanguageContext';
import { useServiceSeoMetadata } from '@/features/website-cms/service-seo/useServiceSeoMetadata';
import {
  buildBreadcrumbSchema,
  buildServiceSchema,
  buildWebPageSchema,
} from '@/lib/website/clinicSchema';
import { canonicalUrl } from '@/lib/website/seoRoutes';
import { ServiceAeoSections } from '@/components/seo/ServiceAeoSections';
import { buildLocalServiceAeo } from '@/features/website-cms/service-seo/aeoContent';
import { buildServiceStructuredData } from '@/lib/seo/serviceStructuredData';

interface LocalServicePageProps {
  slug: string;
}

export default function LocalServicePage({ slug }: LocalServicePageProps) {
  const content = LOCAL_SERVICE_PAGES[slug];
  const { language } = useLanguage();
  const servicePath = `/services/${content?.slug ?? slug}`;
  const seo = useServiceSeoMetadata(servicePath, language, {
    title: content?.title ?? "Klinik Awfa service",
    description: content?.metaDescription ?? "Klinik Awfa healthcare service in KotaSAS, Kuantan.",
    socialTitle: content?.title ?? "Klinik Awfa service",
    socialDescription: content?.metaDescription ?? "Klinik Awfa healthcare service in KotaSAS, Kuantan.",
    canonicalUrl: canonicalUrl(servicePath),
    noIndex: false,
    noFollow: false,
  });

  if (!content) {
    return <Navigate to="/services" replace />;
  }
  const breadcrumbItems = [
    { name: 'Utama', path: '/' },
    { name: 'Perkhidmatan', path: '/services' },
    { name: content.heading, path: servicePath },
  ];
  const resolvedFaqs = seo.faqs?.length ? seo.faqs : content.faqs;
  const schemaFaqs = resolvedFaqs.map((faq) => ({
    question: { ms: faq.question, en: faq.question },
    answer: { ms: faq.answer, en: faq.answer },
  }));
  const schemas = buildServiceStructuredData({
    path: servicePath,
    name: seo.title,
    breadcrumbName: content.heading,
    description: seo.answerSummary || seo.description,
    faqs: schemaFaqs,
  });

  return (
    <MainLayout>
      <SEOHead
        title={seo.title}
        description={seo.description}
        canonicalUrl={seo.canonicalUrl}
        image={seo.image}
        noFollow={seo.noFollow}
        noIndex={seo.noIndex}
        socialDescription={seo.socialDescription}
        socialTitle={seo.socialTitle}
      />
      <SchemaMarkup schemas={schemas} />

      <section className="border-b border-border/60 bg-gradient-to-br from-primary/10 via-background to-accent/10 py-12 md:py-20">
        <div className="container max-w-5xl">
          <nav aria-label="Breadcrumb" className="mb-8 text-sm text-muted-foreground">
            <ol className="flex flex-wrap items-center gap-2">
              {breadcrumbItems.map((item, index) => (
                <li key={item.path} className="flex items-center gap-2">
                  {index > 0 && <span aria-hidden="true">/</span>}
                  {index === breadcrumbItems.length - 1 ? (
                    <span aria-current="page">{item.name}</span>
                  ) : (
                    <Link className="transition-colors hover:text-primary" to={item.path}>
                      {item.name}
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          </nav>

          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-primary">
            {content.eyebrow}
          </p>
          <h1 className="max-w-4xl text-balance">{content.heading}</h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground">
            {content.introduction}
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button asChild size="lg">
              <Link to="/appointment">
                <CalendarDays className="mr-2 h-5 w-5" aria-hidden="true" />
                Buat temujanji
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/doctors">Lihat doktor Klinik Awfa</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/services">Lihat semua perkhidmatan</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href={CLINIC_INFO.whatsapp} rel="noopener noreferrer" target="_blank">
                <MessageCircle className="mr-2 h-5 w-5" aria-hidden="true" />
                Tanya melalui WhatsApp
              </a>
            </Button>
          </div>
        </div>
      </section>

      <div className="container grid max-w-5xl gap-12 py-12 md:grid-cols-[minmax(0,1fr)_18rem] md:py-16">
        <article className="space-y-12">
          {content.sections.map((section) => (
            <section key={section.id} aria-labelledby={section.id}>
              <h2 id={section.id} className="mb-4 text-2xl md:text-3xl">
                {section.heading}
              </h2>
              <div className="space-y-4 text-base leading-7 text-muted-foreground">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
              {section.bullets && (
                <ul className="mt-5 space-y-3">
                  {section.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-3">
                      <CheckCircle2
                        className="mt-1 h-5 w-5 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      <span className="leading-7">{bullet}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          <section aria-labelledby="soalan-lazim">
            <h2 id="soalan-lazim" className="mb-6 text-2xl md:text-3xl">
              Soalan lazim
            </h2>
            <div className="divide-y divide-border rounded-2xl border bg-card px-5 md:px-7">
              {resolvedFaqs.map((faq) => (
                <div key={faq.question} className="py-6">
                  <h3 className="text-lg font-semibold">{faq.question}</h3>
                  <p className="mt-2 leading-7 text-muted-foreground">{faq.answer}</p>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="perkhidmatan-berkaitan">
            <h2 id="perkhidmatan-berkaitan" className="mb-5 text-2xl md:text-3xl">
              Perkhidmatan berkaitan
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {content.relatedSlugs.map((relatedSlug) => {
                const relatedPage = LOCAL_SERVICE_PAGES[relatedSlug];
                return (
                  <Link
                    key={relatedSlug}
                    className="rounded-xl border bg-card p-5 font-semibold transition-colors hover:border-primary hover:text-primary"
                    to={`/services/${relatedSlug}`}
                  >
                    {relatedPage.title}
                  </Link>
                );
              })}
            </div>
          </section>
        </article>

        <aside className="space-y-5 md:sticky md:top-24 md:self-start">
          <section className="rounded-2xl border bg-card p-6 shadow-sm">
            <MapPin className="h-6 w-6 text-primary" aria-hidden="true" />
            <h2 className="mt-4 text-xl">Klinik Awfa di KotaSAS, Kuantan</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {CLINIC_INFO.address.full}
            </p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {CLINIC_INFO.hours.days}, {CLINIC_INFO.hours.timeMalay}
            </p>
            <a
              className="mt-4 inline-flex font-semibold text-primary hover:underline"
              href={CLINIC_INFO.googleMapsUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              Lihat lokasi klinik
            </a>
          </section>

          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6">
            <ShieldCheck className="h-6 w-6 text-primary" aria-hidden="true" />
            <p className="mt-3 text-sm font-semibold leading-6">
              Disemak oleh {LOCAL_SERVICE_REVIEW.organization}
            </p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Tarikh semakan:{' '}
              <time dateTime={LOCAL_SERVICE_REVIEW.date}>{LOCAL_SERVICE_REVIEW.date}</time>
            </p>
            <p className="mt-3 text-sm font-medium leading-6">{content.reviewedByLabel}</p>
          </div>
        </aside>
      </div>
      <ServiceAeoSections content={buildLocalServiceAeo(content)} includeFaqs={false} includeCta={false} />
    </MainLayout>
  );
}
