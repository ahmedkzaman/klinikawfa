import { describe, expect, it } from 'vitest';
import { buildServiceStructuredData } from '@/lib/seo/serviceStructuredData';

describe('service structured data', () => {
  it('builds absolute service, clinic, breadcrumb, and matching FAQ entities', () => {
    const result = buildServiceStructuredData({
      path: '/services/test/',
      name: 'Test Service',
      description: 'A test service.',
      faqs: [{ question: { ms: 'Soalan?', en: 'Question?' }, answer: { ms: 'Jawapan.', en: 'Answer.' } }],
    });
    const graph = result as Array<Record<string, any>>;
    expect(graph.find((item) => item['@type'] === 'MedicalClinic')).toBeTruthy();
    expect(graph.find((item) => item['@type'] === 'Service')?.url).toBe('https://klinikawfa.com/services/test/');
    const faq = graph.find((item) => item['@type'] === 'FAQPage');
    expect(faq?.mainEntity[0].name).toBe('Soalan?');
    expect(faq?.mainEntity[0].acceptedAnswer.text).toBe('Jawapan.');
  });

  it('omits FAQ schema when no visible FAQs exist', () => {
    const result = buildServiceStructuredData({ path: '/services/test/', name: 'Test', description: 'Test' });
    expect((result as Array<Record<string, unknown>>).some((item) => item['@type'] === 'FAQPage')).toBe(false);
  });
});
