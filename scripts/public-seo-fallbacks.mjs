import sunatKuantanPublicContent from '../src/content/sunatKuantanPublicContent.json' with { type: 'json' };

const fallbacks = Object.assign(Object.create(null), {
  'services/sunat-kuantan': sunatKuantanPublicContent,
});

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
