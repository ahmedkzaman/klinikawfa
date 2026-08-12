import sunatKuantanPublicContent from '../src/content/sunatKuantanPublicContent.json' with { type: 'json' };
import publicSeoRoutes from '../src/content/publicSeoRoutes.json' with { type: 'json' };

const sunatSeoRoute = publicSeoRoutes.find(({ path }) => path === '/services/sunat-kuantan/');
if (!sunatSeoRoute) throw new Error('The public SEO manifest is missing the canonical Sunat route.');

const fallbacks = Object.assign(Object.create(null), {
  'services/sunat-kuantan': sunatKuantanPublicContent,
});

const publicSchemaPages = Object.assign(Object.create(null), {
  'services/sunat-kuantan': {
    path: '/services/sunat-kuantan/',
    name: sunatSeoRoute.title,
    breadcrumbName: sunatKuantanPublicContent.heading,
    description: sunatSeoRoute.description,
    faqs: sunatKuantanPublicContent.faqs,
  },
});

const clinic = {
  name: 'Klinik Awfa',
  address: 'B2 & B4, Jalan KS 1/12, KotaSAS Avenue, 25200 Kuantan, Pahang',
  hours: 'Setiap Hari / Every Day, 8.00 pagi - 12.00 tengah malam',
  phone: '+60 18-252 3531',
  phoneLink: 'tel:+60182523531',
  whatsapp: 'https://wa.me/60182523531',
  map: 'https://maps.google.com/?q=3.871944656053272,103.27734116870465',
  reviewDate: '2026-07-27',
};

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
    <section><h2>Maklumat Klinik Awfa</h2><address>${escapeHtml(clinic.address)}</address><p>${escapeHtml(clinic.hours)}</p><p><a href="${escapeHtml(clinic.phoneLink)}">Telefon ${escapeHtml(clinic.phone)}</a> · <a href="${escapeHtml(clinic.whatsapp)}">WhatsApp Klinik Awfa</a> · <a href="${escapeHtml(clinic.map)}">Lihat lokasi klinik</a></p></section>
    <section><h2>Semakan kandungan</h2><p>Disemak oleh ${escapeHtml(clinic.name)} · Tarikh semakan: <time datetime="${escapeHtml(clinic.reviewDate)}">${escapeHtml(clinic.reviewDate)}</time></p></section>
    <nav aria-label="Pautan perkhidmatan"><a href="/appointment">Buat temujanji</a> · <a href="/doctors">Lihat doktor Klinik Awfa</a> · <a href="/services/minor-surgery-kutil-kuantan">Minor surgery dan rawatan kutil di Kuantan</a> · <a href="/services/">Lihat perkhidmatan Klinik Awfa</a></nav>
  </main>`;
}
