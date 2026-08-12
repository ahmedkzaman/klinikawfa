import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/contexts/LanguageContext';
import Doctors from '@/pages/Doctors';
import Services from '@/pages/Services';

const teamMembers = [
  {
    id: 'doctor-with-malay-khatan',
    name_ms: 'Dr. Aina',
    name_en: 'Dr. Aina',
    title_ms: 'Pengamal Perubatan Am',
    title_en: 'General Medical Practitioner',
    qualifications: [],
    years_experience: 8,
    expertise_ms: ['Khatan'],
    expertise_en: [],
    bio_ms: 'Menyediakan rawatan umum.',
    bio_en: 'Provides general care.',
    type: 'doctor',
  },
  {
    id: 'doctor-with-english-circumcision',
    name_ms: 'Dr. Badrul',
    name_en: 'Dr. Badrul',
    title_ms: 'Pengamal Perubatan Am',
    title_en: 'General Medical Practitioner',
    qualifications: [],
    years_experience: 8,
    expertise_ms: [],
    expertise_en: ['Circumcision'],
    bio_ms: 'Menyediakan rawatan umum.',
    bio_en: 'Provides general care.',
    type: 'doctor',
  },
  {
    id: 'doctor-without-khatan',
    name_ms: 'Dr. Farid',
    name_en: 'Dr. Farid',
    title_ms: 'Pengamal Perubatan Am',
    title_en: 'General Medical Practitioner',
    qualifications: [],
    years_experience: 8,
    expertise_ms: ['Perubatan keluarga'],
    expertise_en: ['Family medicine'],
    bio_ms: 'Menyediakan rawatan umum.',
    bio_en: 'Provides general care.',
    type: 'doctor',
  },
];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: async () => ({ data: teamMembers, error: null }),
        }),
      }),
    }),
  },
}));

vi.mock('@/components/layout', () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

afterEach(cleanup);

function renderPublicPage(page: React.ReactNode) {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <LanguageProvider>{page}</LanguageProvider>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

function doctorCard(name: string) {
  return screen.getByRole('article', { name });
}

describe('public Sunat service discovery links', () => {
  it('uses a descriptive canonical Sunat hub link on Services', () => {
    renderPublicPage(<Services />);

    expect(screen.getByRole('link', { name: /perkhidmatan sunat di kuantan/i })).toHaveAttribute(
      'href',
      '/services/sunat-kuantan',
    );
  });

  it('links only the doctor with Malay Khatan expertise to the Sunat hub', async () => {
    renderPublicPage(<Doctors />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Dr. Aina' })).toBeInTheDocument();
    });

    expect(
      within(doctorCard('Dr. Aina')).getByRole('link', {
        name: /lihat perkhidmatan sunat di kuantan/i,
      }),
    ).toHaveAttribute('href', '/services/sunat-kuantan');
  });

  it('links only the doctor with English Circumcision expertise to the Sunat hub', async () => {
    renderPublicPage(<Doctors />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Dr. Badrul' })).toBeInTheDocument();
    });

    expect(
      within(doctorCard('Dr. Badrul')).getByRole('link', {
        name: /lihat perkhidmatan sunat di kuantan/i,
      }),
    ).toHaveAttribute('href', '/services/sunat-kuantan');
  });

  it('does not link a doctor without explicit Khatan or Circumcision expertise to the Sunat hub', async () => {
    renderPublicPage(<Doctors />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Dr. Farid' })).toBeInTheDocument();
    });

    expect(within(doctorCard('Dr. Farid')).queryByRole('link', {
      name: /lihat perkhidmatan sunat di kuantan/i,
    })).not.toBeInTheDocument();
  });
});
