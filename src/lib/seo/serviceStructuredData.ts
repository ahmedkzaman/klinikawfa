import { canonicalUrl, SITE_ORIGIN } from '@/lib/website/seoRoutes';
import { CLINIC_ENTITY_ID } from '@/lib/website/clinicSchema';
import type { ServiceAeoContent } from '@/features/website-cms/service-seo/aeoContent';

export function buildServiceStructuredData(input: {
  path: string;
  name: string;
  description: string;
  breadcrumbName?: string;
  faqs?: ServiceAeoContent['faqs'];
}) {
  const url = canonicalUrl(input.path);
  const graph: Record<string, unknown>[] = [
    { '@type': 'MedicalClinic', '@id': CLINIC_ENTITY_ID, name: 'Klinik Awfa', url: canonicalUrl('/') },
    { '@type': 'WebPage', additionalType: 'https://schema.org/MedicalWebPage', '@id': url, url, name: input.name, description: input.description, about: { '@id': CLINIC_ENTITY_ID } },
    { '@type': 'Service', '@id': `${url}#service`, name: input.name, description: input.description, url, provider: { '@id': CLINIC_ENTITY_ID } },
    { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Utama', item: canonicalUrl('/') }, { '@type': 'ListItem', position: 2, name: 'Perkhidmatan', item: canonicalUrl('/services') }, { '@type': 'ListItem', position: 3, name: input.breadcrumbName || input.name, item: url }] },
  ];
  const faqs = input.faqs?.filter((faq) => faq.question.ms.trim() && faq.answer.ms.trim());
  if (faqs?.length) graph.push({ '@type': 'FAQPage', '@id': `${url}#faq`, url, mainEntity: faqs.map((faq) => ({ '@type': 'Question', name: faq.question.ms, acceptedAnswer: { '@type': 'Answer', text: faq.answer.ms } })) });
  return graph.map((entity) => ({ '@context': 'https://schema.org', ...entity, ...(entity['@type'] === 'WebPage' ? { isPartOf: { '@id': `${SITE_ORIGIN}/#website` } } : {}) }));
}
