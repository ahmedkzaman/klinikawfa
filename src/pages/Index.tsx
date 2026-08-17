import { MainLayout } from '@/components/layout';
import { SchemaMarkup, SEOHead } from '@/components/seo';
import { HomeRenderer } from '@/components/home';
import { Link } from 'react-router-dom';
import { LOCAL_SERVICE_PAGES } from '@/content/localServicePages';
import { DEFAULT_HOME_CONTENT } from '@/features/website-cms/home/homeDefaults';
import { usePublishedPage } from '@/features/website-cms/hooks/useWebsitePage';
import { CLINIC_INFO } from '@/lib/constants';
import { buildClinicSchema, buildWebPageSchema, PUBLIC_CLINIC_FACTS } from '@/lib/website/clinicSchema';
import { getSeoRoute, SITE_ORIGIN } from '@/lib/website/seoRoutes';

const localServiceHubs = Object.values(LOCAL_SERVICE_PAGES);

export default function Index() {
  const content = usePublishedPage('home', DEFAULT_HOME_CONTENT);
  const homepageRoute = getSeoRoute('/');
  const schemas = [
    buildClinicSchema(PUBLIC_CLINIC_FACTS),
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': `${SITE_ORIGIN}/#website`,
      name: 'Klinik Awfa',
      url: `${SITE_ORIGIN}/`,
    },
    buildWebPageSchema({
      path: '/',
      name: homepageRoute.title,
      description: homepageRoute.description,
    }),
  ];

  return (
    <MainLayout>
      <SEOHead
        title={homepageRoute.title}
        description={homepageRoute.description}
        url="/"
      />
      <SchemaMarkup schemas={schemas} />

      <HomeRenderer content={content} />

      <section className="border-y border-border/60 bg-muted/30 py-14 md:py-16">
        <div className="container">
          <div className="mx-auto max-w-4xl">
            <h2 className="mb-3 text-2xl md:text-3xl font-bold">
              Rawatan di {CLINIC_INFO.name}
            </h2>
            <p className="mb-2 text-sm font-medium text-muted-foreground tracking-wide">
              {CLINIC_INFO.legalName}
            </p>
            <p className="mb-7 text-muted-foreground">
              Klinik Awfa KotaSAS, Kuantan terletak di {CLINIC_INFO.address.full}. Hubungi{' '}
              <a className="font-medium text-primary hover:underline" href={CLINIC_INFO.phoneLink}>
                {CLINIC_INFO.phone}
              </a>{' '}
              untuk pertanyaan atau temujanji. Kami dibuka {CLINIC_INFO.hours.days},{' '}
              {CLINIC_INFO.hours.timeMalay}.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {localServiceHubs.map((service) => (
                <Link
                  key={service.slug}
                  to={`/services/${service.slug}`}
                  className="rounded-lg border border-border bg-background px-4 py-3 font-medium text-primary transition-colors hover:border-primary hover:bg-primary/5"
                >
                  {service.heading}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>
    </MainLayout>
  );
}
