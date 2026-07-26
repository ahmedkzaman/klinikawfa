import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { HelmetProvider } from 'react-helmet-async';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SEOHead } from '@/components/seo/SEOHead';
import { LOCAL_SERVICE_PAGES } from '@/content/localServicePages';
import { getSeoRoute } from '@/lib/website/seoRoutes';

const indexHtml = readFileSync('index.html', 'utf8');
const managedSelectors = [
  'title',
  'meta[name="description"]',
  'link[rel="canonical"]',
  'meta[property="og:title"]',
  'meta[property="og:description"]',
  'meta[property="og:type"]',
  'meta[property="og:url"]',
  'meta[property="og:image"]',
  'meta[property="og:site_name"]',
  'meta[property="og:locale"]',
  'meta[property="og:locale:alternate"]',
  'meta[name="twitter:card"]',
  'meta[name="twitter:title"]',
  'meta[name="twitter:description"]',
  'meta[name="twitter:image"]',
] as const;

function installRealIndexHead() {
  const sourceDocument = new DOMParser().parseFromString(indexHtml, 'text/html');
  document.head.innerHTML = sourceDocument.head.innerHTML;
}

function expectOneManagedTagOfEachKind() {
  for (const selector of managedSelectors) {
    expect(document.head.querySelectorAll(selector), selector).toHaveLength(1);
  }
}

function TestRoutes() {
  const homepage = getSeoRoute('/');
  const sunatPage = LOCAL_SERVICE_PAGES['sunat-kuantan'];

  return (
    <Routes>
      <Route
        path="/"
        element={
          <>
            <SEOHead title={homepage.title} description={homepage.description} url="/" />
            <Link to="/services/sunat-kuantan">Open sunat page</Link>
          </>
        }
      />
      <Route
        path="/services/sunat-kuantan"
        element={
          <>
            <SEOHead
              title={sunatPage.title}
              description={sunatPage.metaDescription}
              url="/services/sunat-kuantan"
            />
            <Link to="/">Return home</Link>
          </>
        }
      />
    </Routes>
  );
}

beforeEach(installRealIndexHead);

afterEach(() => {
  document.head.innerHTML = '';
});

describe('SEO fallback head hydration', () => {
  it('deduplicates the real index fallback on hydration and route navigation', async () => {
    expectOneManagedTagOfEachKind();

    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={['/']}>
          <TestRoutes />
        </MemoryRouter>
      </HelmetProvider>,
    );

    await waitFor(() => {
      expect(document.title).toBe('Klinik Awfa KotaSAS | Klinik Keluarga di Kuantan');
      expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
        'content',
        'index, follow',
      );
      expectOneManagedTagOfEachKind();
    });

    fireEvent.click(screen.getByRole('link', { name: 'Open sunat page' }));

    await waitFor(() => {
      expect(document.title).toBe(
        'Sunat di Kuantan untuk Bayi, Kanak-kanak dan Dewasa | Klinik Awfa',
      );
      expect(document.head.querySelector('link[rel="canonical"]')).toHaveAttribute(
        'href',
        'https://klinikawfa.com/services/sunat-kuantan',
      );
      expectOneManagedTagOfEachKind();
    });
  });
});
