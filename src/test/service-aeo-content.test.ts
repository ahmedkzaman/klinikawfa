import { describe, expect, it } from 'vitest';
import { LOCAL_SERVICE_PAGES } from '@/content/localServicePages';
import { buildLocalServiceAeo, buildCategoryServiceAeo } from '@/features/website-cms/service-seo/aeoContent';

describe('service AEO content', () => {
  it('creates complete bilingual content for every local service page', () => {
    for (const page of Object.values(LOCAL_SERVICE_PAGES)) {
      const content = buildLocalServiceAeo(page);
      expect(content.intro.ms).toBeTruthy();
      expect(content.intro.en).toBeTruthy();
      expect(content.suitableFor.en).toBeTruthy();
      expect(content.whatToExpect.ms).toBeTruthy();
      expect(content.faqs.length).toBeGreaterThan(0);
      expect(JSON.stringify(content)).not.toMatch(/lorem|placeholder/i);
    }
  });

  it('provides bilingual content for category services', () => {
    const content = buildCategoryServiceAeo({ titleMs: 'Rawatan Am', titleEn: 'General Treatment', descriptionMs: 'Pemeriksaan umum.', descriptionEn: 'General assessment.' });
    expect(content.intro).toEqual({ ms: 'Pemeriksaan umum.', en: 'General assessment.' });
    expect(content.faqs[0].question.en).toContain('General Treatment');
  });
});
