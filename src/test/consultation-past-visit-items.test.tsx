import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/clinic/useSuppliers', () => ({ useSuppliers: vi.fn(() => ({ suppliers: [], isLoading: false })) }));

// The component under test is embedded in ConsultationDetail (not exported), so
// mount the page shell lightly is heavy; instead we re-implement nothing and
// import the page lazily with generous mocks.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() }, auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } } })) } },
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    role: 'special_admin',
    user: { id: 'u1' },
    isLocum: false,
    isDoctorAdmin: true,
  })),
}));

const pastVisit = {
  id: 'v1',
  created_at: '2025-04-01T10:00:00Z',
  doctors: { name: 'Ahmed' },
  diagnoses: { id: 'd1', name: 'URI' },
  diagnosis_text: null,
  case_note: 'COUGH AND RUNNY NOSE 3 DAYS',
  dispense_note: null,
  consultation_items: [
    { id: 'li1', item_name: 'COMBO INFLUENZA TEST', quantity: 1, price: 75, dosage: null },
    { id: 'li2', item_name: 'CONSULTATION DR', quantity: 1, price: 50, dosage: null },
  ],
};

vi.mock('@/hooks/clinic/useCurrentDoctor', () => ({
  useCurrentDoctor: vi.fn(() => ({ data: { id: 'doc-1', name: 'Dr Ahmed', avatar_url: null }, isLoading: false })),
}));
vi.mock('@/hooks/clinic/useQueueEntries', () => ({
  useConsultationQueueEntries: vi.fn(() => ({ data: [], isLoading: false })),
  useQueueEntry: vi.fn(() => ({ data: {
    id: 'q1',
    status: 'completed',
    clinic_status: 'completed',
    assigned_doctor_id: 'doc-1',
    created_at: '2026-08-31T02:00:00Z',
    patients: { id: 'p1', name: 'Test Patient', national_id: null },
  }, isLoading: false, error: null, refetch: vi.fn() })),
  useUpdateQueueEntry: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));
vi.mock('@/hooks/clinic/useConsultations', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useConsultation: vi.fn(() => ({ data: { id: 'c1', status: 'completed', doctor_id: 'doc-1' }, isLoading: false })),
  useCreateConsultation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useUpdateConsultation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  usePatientConsultationHistory: vi.fn(() => ({ data: [pastVisit], isLoading: false })),
}));

import ConsultationDetail from '@/pages/clinic/ConsultationDetail';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/clinic/consultation/q1']}>
        <ConsultationDetail />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Past visit items disclosure', () => {
  it('hides items until the Items row is clicked, and hides prices until an item is clicked', async () => {
    renderPage();
    await screen.findByText('PAST VISITS', {}, { timeout: 5000 });
    // items hidden until click
    expect(screen.queryByText(/COMBO INFLUENZA TEST/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Items \(/i }));
    expect(screen.getByText(/COMBO INFLUENZA TEST/)).toBeInTheDocument();
    // price hidden until item click
    expect(screen.queryByText('RM 75.00')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(/COMBO INFLUENZA TEST/));
    expect(screen.getByText('RM 75.00')).toBeInTheDocument();
  });
});
