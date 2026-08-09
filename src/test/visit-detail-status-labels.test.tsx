import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ role: 'admin' }),
}));

vi.mock('@/hooks/clinic/useQueueEntries', () => ({
  useQueueEntry: () => ({
    data: {
      id: 'queue-1',
      created_at: '2026-08-03T12:00:00.000Z',
      queue_sequence: 1,
      clinic_status: 'completed',
      patients: { name: 'Test Patient', national_id: '900101010101' },
      doctors: { name: 'Dr Test' },
    },
    isLoading: false,
  }),
}));

vi.mock('@/hooks/clinic/useConsultations', () => ({
  useConsultation: () => ({
    data: {
      id: 'consultation-1',
      status: 'in_progress',
      diagnosis_text: 'Fever',
      doctors: { name: 'Dr Test' },
    },
  }),
}));

vi.mock('@/hooks/clinic/useConsultationItems', () => ({
  useConsultationItems: () => ({ data: [], refetch: vi.fn() }),
}));

vi.mock('@/hooks/clinic/usePayments', () => ({
  usePayments: () => ({ data: [], refetch: vi.fn() }),
}));

vi.mock('@/hooks/clinic/useVisitPanelClaim', () => ({
  useVisitPanelClaim: () => ({ data: null, refetch: vi.fn() }),
}));

vi.mock('@/hooks/clinic/useCompletedBillCorrection', () => ({
  useCompletedBillCorrectionHistory: () => ({
    data: [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/components/clinic/visit/VisitDetailsColumn', () => ({
  VisitDetailsColumn: () => <div>Visit details</div>,
}));

vi.mock('@/components/clinic/visit/AttachmentsCard', () => ({
  AttachmentsCard: () => <div>Attachments</div>,
}));

vi.mock('@/components/clinic/visit/BillingDetailsColumn', () => ({
  BillingDetailsColumn: () => <div>Billing details</div>,
}));

vi.mock('@/components/clinic/visit/CompletedBillCorrectionDialog', () => ({
  CompletedBillCorrectionDialog: () => null,
}));

import VisitDetail from '@/pages/clinic/VisitDetail';

function renderVisitDetail() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/clinic/visits/queue-1']}>
          <Routes>
            <Route path="/clinic/visits/:queueEntryId" element={children} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  }
  return render(<VisitDetail />, { wrapper: Wrapper });
}

describe('VisitDetail status labels', () => {
  it('identifies queue and consultation statuses separately', () => {
    renderVisitDetail();

    expect(screen.getByText('Queue:')).toBeVisible();
    expect(screen.getByText('Consultation:')).toBeVisible();
    expect(screen.getByText('Completed')).toBeVisible();
    expect(screen.getByText('In progress')).toBeVisible();
  });
});
