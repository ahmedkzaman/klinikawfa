import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/contexts/LanguageContext';
import ServiceDetail from '@/pages/ServiceDetail';

const queryState = vi.hoisted(() => ({
  data: {
    id: 'service-1',
    slug: 'rawatan-am',
    title: 'Rawatan Am',
    description: '<p>Rawatan untuk keluarga.</p>',
    services_list: ['Pemeriksaan'],
    call_to_action: 'Buat Temujanji',
    title_ms: 'Rawatan Am',
    title_en: 'General Treatment',
    description_ms: '<p>Rawatan untuk keluarga.</p>',
    description_en: '<p>Family care.</p>',
    call_to_action_ms: 'Buat Temujanji',
    call_to_action_en: 'Book Appointment',
    services_list_ms: ['Pemeriksaan'],
    services_list_en: ['Consultation'],
  },
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: queryState.data, isLoading: false, isError: false }),
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

vi.mock('@/components/layout/MainLayout', () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

vi.mock('@/components/seo/SEOHead', () => ({ SEOHead: () => null }));

afterEach(() => cleanup());

describe('ServiceDetail structured data', () => {
  it.each([
    ['/services/rawatan-umum', 'https://klinikawfa.com/services/rawatan-umum'],
    ['/services/rawatan-am', 'https://klinikawfa.com/services/rawatan-am'],
  ])('publishes schemas for the current public route %s', async (route, expectedUrl) => {
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={[route]}>
          <LanguageProvider>
            <Routes>
              <Route path="/services/:slug" element={<ServiceDetail />} />
            </Routes>
          </LanguageProvider>
        </MemoryRouter>
      </HelmetProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'Rawatan Am' })).toBeInTheDocument();

    await waitFor(() => {
      const schemas = Array.from(document.head.querySelectorAll('script[type="application/ld+json"]'))
        .map((script) => JSON.parse(script.textContent || '{}'));

      expect(schemas).toEqual(expect.arrayContaining([
        expect.objectContaining({ '@type': 'WebPage', url: expectedUrl }),
        expect.objectContaining({
          '@type': 'Service',
          name: 'Rawatan Am',
          url: expectedUrl,
          provider: { '@id': 'https://klinikawfa.com/#clinic' },
        }),
        expect.objectContaining({
          '@type': 'BreadcrumbList',
          itemListElement: expect.arrayContaining([
            expect.objectContaining({ name: 'Utama', item: 'https://klinikawfa.com/' }),
            expect.objectContaining({ name: 'Perkhidmatan', item: 'https://klinikawfa.com/services' }),
            expect.objectContaining({ name: 'Rawatan Am', item: expectedUrl }),
          ]),
        }),
      ]));
    });
  });
});
