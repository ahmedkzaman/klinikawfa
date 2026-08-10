import { SchemaMarkup } from './SchemaMarkup';
import { buildClinicSchema, buildWebPageSchema, PUBLIC_CLINIC_FACTS } from '@/lib/website/clinicSchema';
import { canonicalUrl } from '@/lib/website/seoRoutes';

export function PublicPageSchema({ path, name, description, type = 'WebPage' }: { path: string; name: string; description: string; type?: 'WebPage' | 'CollectionPage' | 'ContactPage' | 'AboutPage' | 'MedicalWebPage' }) {
  const page = { ...buildWebPageSchema({ path, name, description }), '@type': type };
  return <SchemaMarkup schemas={[buildClinicSchema(PUBLIC_CLINIC_FACTS), page, { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Utama', item: canonicalUrl('/') }, { '@type': 'ListItem', position: 2, name, item: canonicalUrl(path) }] }]} />;
}
