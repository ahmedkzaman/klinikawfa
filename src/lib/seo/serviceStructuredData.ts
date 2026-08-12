import { canonicalUrl } from '@/lib/website/seoRoutes';
import {
  buildBreadcrumbSchema,
  buildClinicSchema,
  buildServiceSchema,
  buildWebPageSchema,
  PUBLIC_CLINIC_FACTS,
} from '@/lib/website/clinicSchema';
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
    buildClinicSchema(PUBLIC_CLINIC_FACTS),
    buildWebPageSchema({ path: input.path, name: input.name, description: input.description }),
    buildServiceSchema({ path: input.path, name: input.name, description: input.description }),
    buildBreadcrumbSchema([
      { name: 'Utama', path: '/' },
      { name: 'Perkhidmatan', path: '/services' },
      { name: input.breadcrumbName || input.name, path: input.path },
    ]),
  ];
  const faqs = input.faqs?.filter((faq) => faq.question.ms.trim() && faq.answer.ms.trim());
  if (faqs?.length) graph.push({ '@type': 'FAQPage', '@id': `${url}#faq`, url, mainEntity: faqs.map((faq) => ({ '@type': 'Question', name: faq.question.ms, acceptedAnswer: { '@type': 'Answer', text: faq.answer.ms } })) });
  return graph.map((entity) => ({ '@context': 'https://schema.org', ...entity }));
}
