import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LOCAL_SERVICE_PAGES } from '@/content/localServicePages';
import { CLINIC_INFO } from '@/lib/constants';
import LocalServicePage from '@/pages/LocalServicePage';

vi.mock('@/components/layout', () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

afterEach(() => cleanup());

describe('local SEO service pages', () => {
  it('publishes exactly five substantial service hubs', () => {
    expect(Object.keys(LOCAL_SERVICE_PAGES)).toEqual([
      'rawatan-telinga-kuantan',
      'minor-surgery-kutil-kuantan',
      'swab-test-demam-kuantan',
      'pengurusan-berat-badan-kuantan',
      'sunat-kuantan',
    ]);
  });

  it('separates baby, child and adult circumcision intents on one hub', () => {
    const page = LOCAL_SERVICE_PAGES['sunat-kuantan'];
    expect(page.sections.map((section) => section.heading)).toEqual(
      expect.arrayContaining(['Sunat bayi', 'Sunat kanak-kanak', 'Sunat dewasa']),
    );
  });

  it('uses medical safeguards rather than guaranteed outcomes', () => {
    const allCopy = JSON.stringify(LOCAL_SERVICE_PAGES).toLowerCase();
    expect(allCopy).not.toMatch(/dijamin|guaranteed|100% berkesan/);
    expect(allCopy).toContain('penilaian doktor');
  });

  it('renders the complete sunat hub at its explicit local route', async () => {
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={['/services/sunat-kuantan']}>
          <Routes>
            <Route path="/services/:slug" element={<LocalServicePage />} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>,
    );

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole('heading', { level: 1, name: /sunat di kuantan/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sunat bayi' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sunat kanak-kanak' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sunat dewasa' })).toBeInTheDocument();

    const breadcrumbs = screen.getByRole('navigation', { name: /breadcrumb/i });
    expect(breadcrumbs).toHaveTextContent('Utama');
    expect(breadcrumbs).toHaveTextContent('Perkhidmatan');
    expect(breadcrumbs).toHaveTextContent('Sunat di Kuantan');

    expect(screen.getByRole('heading', { name: 'Soalan lazim' })).toBeInTheDocument();
    expect(
      screen.getByText('Adakah konsultasi diperlukan sebelum tarikh sunat?'),
    ).toBeVisible();
    expect(screen.getByText(CLINIC_INFO.address.full)).toBeVisible();
    expect(screen.getByText(/maklumat kesihatan umum/i)).toBeVisible();
    expect(screen.getByRole('link', { name: /buat temujanji/i })).toHaveAttribute(
      'href',
      '/appointment',
    );
    expect(screen.getByRole('link', { name: /whatsapp/i })).toHaveAttribute(
      'href',
      CLINIC_INFO.whatsapp,
    );
    expect(
      screen.getByRole('link', { name: /minor surgery dan rawatan kutil/i }),
    ).toHaveAttribute('href', '/services/minor-surgery-kutil-kuantan');

    await waitFor(() => {
      expect(document.title).toBe(`${LOCAL_SERVICE_PAGES['sunat-kuantan'].title} | Klinik Awfa`);
      expect(document.head.querySelector('meta[name="description"]')).toHaveAttribute(
        'content',
        LOCAL_SERVICE_PAGES['sunat-kuantan'].metaDescription,
      );
      expect(document.head.querySelector('link[rel="canonical"]')).toHaveAttribute(
        'href',
        'https://klinikawfa.com/services/sunat-kuantan',
      );

      const schemas = Array.from(
        document.head.querySelectorAll('script[type="application/ld+json"]'),
      ).map((script) => JSON.parse(script.textContent || '{}'));
      expect(schemas).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            '@type': 'WebPage',
            name: LOCAL_SERVICE_PAGES['sunat-kuantan'].heading,
            description: LOCAL_SERVICE_PAGES['sunat-kuantan'].metaDescription,
            url: 'https://klinikawfa.com/services/sunat-kuantan',
          }),
          expect.objectContaining({
            '@type': 'Service',
            name: LOCAL_SERVICE_PAGES['sunat-kuantan'].heading,
            description: LOCAL_SERVICE_PAGES['sunat-kuantan'].metaDescription,
            url: 'https://klinikawfa.com/services/sunat-kuantan',
          }),
          expect.objectContaining({
            '@type': 'BreadcrumbList',
            itemListElement: expect.arrayContaining([
              expect.objectContaining({
                name: LOCAL_SERVICE_PAGES['sunat-kuantan'].heading,
                item: 'https://klinikawfa.com/services/sunat-kuantan',
              }),
            ]),
          }),
        ]),
      );
    });
  });
});
