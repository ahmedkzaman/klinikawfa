import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '@/App';
import { Footer } from '@/components/layout/Footer';
import { LOCAL_SERVICE_PAGES } from '@/content/localServicePages';
import { CLINIC_INFO } from '@/lib/constants';
import { LanguageProvider } from '@/contexts/LanguageContext';
import LocalServicePage from '@/pages/LocalServicePage';
import Services from '@/pages/Services';

vi.mock('@/contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({ user: null, isStaffOrAdmin: false }),
}));

vi.mock('@/features/analytics/GoogleAnalyticsController', () => ({
  GoogleAnalyticsController: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

vi.mock('@/components/layout', () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

vi.mock('@/hooks/usePublishedNavigation', () => ({
  usePublishedNavigation: () => [],
}));

vi.stubGlobal(
  'IntersectionObserver',
  class IntersectionObserver {
    disconnect() {}
    observe() {}
    takeRecords() {
      return [];
    }
    unobserve() {}
  },
);

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
});

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

  it('links to every local service hub from the services page and footer', () => {
    const paths = Object.values(LOCAL_SERVICE_PAGES).map(
      (page) => `/services/${page.slug}`,
    );

    const services = render(
      <HelmetProvider>
        <MemoryRouter>
          <LanguageProvider>
            <Services />
          </LanguageProvider>
        </MemoryRouter>
      </HelmetProvider>,
    );
    expect(paths.every((path) => services.container.querySelector(`a[href="${path}"]`))).toBe(true);
    services.unmount();

    const footer = render(
      <MemoryRouter>
        <LanguageProvider>
          <Footer />
        </LanguageProvider>
      </MemoryRouter>,
    );
    expect(paths.every((path) => footer.container.querySelector(`a[href="${path}"]`))).toBe(true);

    const footerPaths = Array.from(footer.container.querySelectorAll('a[href^="/"]'))
      .map((link) => link.getAttribute('href'))
      .sort();
    expect(footerPaths).toEqual(
      [
        '/',
        '/services',
        '/doctors',
        '/appointment',
        '/health-tips',
        ...paths,
      ].sort(),
    );
  });

  it.each([
    ['/services/rawatan-telinga-kuantan', 'Rawatan telinga di Kuantan'],
    [
      '/services/minor-surgery-kutil-kuantan',
      'Minor surgery dan rawatan kutil di Kuantan',
    ],
    ['/services/swab-test-demam-kuantan', 'Swab test dan pemeriksaan demam di Kuantan'],
    ['/services/pengurusan-berat-badan-kuantan', 'Pengurusan berat badan di Kuantan'],
    [
      '/services/sunat-kuantan',
      'Sunat di Kuantan untuk bayi, kanak-kanak dan dewasa',
    ],
  ])('renders the production App route %s without redirecting', async (path, expectedHeading) => {
    window.history.pushState({}, '', path);

    render(
      <HelmetProvider>
        <App />
      </HelmetProvider>,
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: expectedHeading }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe(path);
    expect(screen.getByText('Disemak oleh Klinik Awfa')).toBeVisible();
    expect(screen.getByText('2026-07-27')).toMatchObject({
      tagName: 'TIME',
    });
    expect(screen.getByText('2026-07-27')).toHaveAttribute(
      'datetime',
      '2026-07-27',
    );
  });

  it('renders the complete sunat hub at its explicit local route', async () => {
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={['/services/sunat-kuantan']}>
          <Routes>
            <Route
              path="/services/sunat-kuantan"
              element={<LocalServicePage slug="sunat-kuantan" />}
            />
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
        'https://klinikawfa.com/services/sunat-kuantan/',
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
            url: 'https://klinikawfa.com/services/sunat-kuantan/',
          }),
          expect.objectContaining({
            '@type': 'Service',
            name: LOCAL_SERVICE_PAGES['sunat-kuantan'].heading,
            description: LOCAL_SERVICE_PAGES['sunat-kuantan'].metaDescription,
            url: 'https://klinikawfa.com/services/sunat-kuantan/',
          }),
          expect.objectContaining({
            '@type': 'BreadcrumbList',
            itemListElement: expect.arrayContaining([
              expect.objectContaining({
                name: LOCAL_SERVICE_PAGES['sunat-kuantan'].heading,
                item: 'https://klinikawfa.com/services/sunat-kuantan/',
              }),
            ]),
          }),
        ]),
      );
    });
  });
});
