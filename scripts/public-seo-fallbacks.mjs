import sunatKuantanPublicContent from '../src/content/sunatKuantanPublicContent.json' with { type: 'json' };

const fallbacks = Object.assign(Object.create(null), {
  'services/sunat-kuantan': sunatKuantanPublicContent,
});

const publicSchemaPages = Object.assign(Object.create(null), {
  'services/sunat-kuantan': {
    path: '/services/sunat-kuantan/',
    name: 'Sunat Bayi, Kanak-kanak & Dewasa Kuantan | Klinik Awfa',
    breadcrumbName: sunatKuantanPublicContent.heading,
    description: 'Khidmat sunat bayi, kanak-kanak dan dewasa di Kuantan dengan penilaian doktor dan penjagaan selepas prosedur di Klinik Awfa.',
    faqs: sunatKuantanPublicContent.faqs,
  },
});

const siteOrigin = 'https://klinikawfa.com';
const clinicEntityId = `${siteOrigin}/#clinic`;
const canonicalUrl = (path) => `${siteOrigin}/${String(path).replace(/^\/+|\/+$/g, '')}${path === '/' ? '' : '/'}`;

export function buildPublicSeoSchemas(route) {
  const page = publicSchemaPages[route];
  if (!page) return undefined;

  const url = canonicalUrl(page.path);
  const graph = [
    { '@context': 'https://schema.org', '@type': 'MedicalClinic', '@id': clinicEntityId, name: 'Klinik Awfa', url: canonicalUrl('/') },
    { '@context': 'https://schema.org', '@type': 'WebPage', '@id': url, url, name: page.name, description: page.description, isPartOf: { '@id': `${siteOrigin}/#website` }, about: { '@id': clinicEntityId } },
    { '@context': 'https://schema.org', '@type': 'Service', '@id': `${url}#service`, name: page.name, description: page.description, url, provider: { '@id': clinicEntityId } },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Utama', item: canonicalUrl('/') },
      { '@type': 'ListItem', position: 2, name: 'Perkhidmatan', item: canonicalUrl('/services') },
      { '@type': 'ListItem', position: 3, name: page.breadcrumbName, item: url },
    ] },
  ];
  const faqs = page.faqs.filter((faq) => faq.question.trim() && faq.answer.trim());
  if (faqs.length) {
    graph.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      '@id': `${url}#faq`,
      url,
      mainEntity: faqs.map((faq) => ({ '@type': 'Question', name: faq.question, acceptedAnswer: { '@type': 'Answer', text: faq.answer } })),
    });
  }
  return graph;
}

const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

export function buildPublicSeoFallback(route) {
  const page = fallbacks[route];
  if (!page) return undefined;

  return `<main data-public-seo-fallback="${escapeHtml(route)}">
    <h1>${escapeHtml(page.heading)}</h1>
    <p>${escapeHtml(page.introduction)}</p>
    ${page.sections.map((section) => `<section><h2>${escapeHtml(section.heading)}</h2>${section.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}</section>`).join('')}
    <section><h2>Soalan lazim</h2><dl>${page.faqs.map((faq) => `<div><dt>${escapeHtml(faq.question)}</dt><dd>${escapeHtml(faq.answer)}</dd></div>`).join('')}</dl></section>
    <p><a href="/appointment">Buat temujanji</a> · <a href="/services/">Lihat perkhidmatan Klinik Awfa</a></p>
  </main>`;
}
