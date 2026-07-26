import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';

import { RouteSeoGuard } from '@/components/seo/RouteSeoGuard';
import NotFound from '@/pages/NotFound';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.head.innerHTML = '';
});

function renderGuardedRoute(path: string) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="*" element={<><RouteSeoGuard /><NotFound /></>} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

describe('RouteSeoGuard', () => {
  it.each([
    '/clinic/queue',
    '/staff/dashboard',
    '/editor/home',
    '/auth',
    '/locum-register',
    '/reset-password',
    '/video-call',
    '/tv',
  ])('emits noindex metadata for protected route %s', async (path) => {
    renderGuardedRoute(path);

    await waitFor(() => {
      expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
        'content',
        'noindex, nofollow',
      );
    });
  });

  it('keeps an unknown wildcard route out of search', async () => {
    renderGuardedRoute('/not-a-public-route');

    await waitFor(() => {
      expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
        'content',
        'noindex, nofollow',
      );
      expect(document.head.querySelector('link[rel="canonical"]')).toHaveAttribute(
        'href',
        'https://klinikawfa.com/not-a-public-route',
      );
    });
  });

  it.each([
    '/pages',
    '/pages/tentang-klinik/pasukan',
    '/services/rawatan-umum/lebihan',
    '/health-tips/penjagaan-demam/lebihan',
  ])('emits noindex metadata for malformed public route %s', async (path) => {
    renderGuardedRoute(path);

    await waitFor(() => {
      expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
        'content',
        'noindex, nofollow',
      );
    });
  });
});
