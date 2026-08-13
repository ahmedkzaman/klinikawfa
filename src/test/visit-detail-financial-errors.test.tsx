import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ failure: '' as '' | 'items' | 'payments' | 'claims' }));
const refetch = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ role: 'ops_staff' }) }));
vi.mock('@/hooks/clinic/useQueueEntries', () => ({
  useQueueEntry: () => ({
    data: {
      id: 'queue-1', patient_id: 'patient-1', clinic_status: 'completed',
      payment_method: 'panel', panel_id: 'panel-1', created_at: '2026-08-12T08:00:00Z',
      queue_sequence: 1, patients: { name: 'Test Patient' },
      insurance_providers: { id: 'panel-1', name: 'Care Panel' },
    },
    isLoading: false,
  }),
}));
vi.mock('@/hooks/clinic/useConsultations', () => ({
  useConsultation: () => ({ data: { id: 'consultation-1', status: 'completed' } }),
}));
vi.mock('@/hooks/clinic/useConsultationItems', () => ({
  useConsultationItems: () => state.failure === 'items'
    ? { data: undefined, isError: true, error: new Error('items failed'), refetch }
    : { data: [{ id: 'item-1', price: 100, quantity: 1 }], isError: false, refetch },
}));
vi.mock('@/hooks/clinic/usePayments', () => ({
  usePayments: () => state.failure === 'payments'
    ? { data: undefined, isError: true, error: new Error('payments failed'), refetch }
    : { data: [{ id: 'payment-1', amount: 50, payment_method: 'cash', payment_type: 'panel' }], isError: false, refetch },
}));
vi.mock('@/hooks/clinic/useVisitPanelClaim', () => ({
  useVisitPanelClaim: () => state.failure === 'claims'
    ? { data: undefined, isError: true, error: new Error('claims failed'), isLoading: false, isFetching: false, refetch }
    : { data: { id: 'claim-1', amount: 50, receivedAmount: 0, status: 'pending' }, isError: false, isLoading: false, isFetching: false, refetch },
}));
vi.mock('@/hooks/clinic/useCompletedBillCorrection', () => ({
  useCompletedBillCorrectionHistory: () => ({ data: [], isLoading: false, isError: false, refetch }),
}));
vi.mock('@/components/clinic/visit/VisitDetailsColumn', () => ({ VisitDetailsColumn: () => null }));
vi.mock('@/components/clinic/visit/AttachmentsCard', () => ({ AttachmentsCard: () => null }));
vi.mock('@/components/clinic/visit/BillingDetailsColumn', () => ({
  BillingDetailsColumn: () => <div>Rendered financial controls</div>,
}));
vi.mock('@/components/clinic/visit/CompletedBillCorrectionDialog', () => ({ CompletedBillCorrectionDialog: () => null }));
vi.mock('@/components/clinic/patient/PatientVisitPaymentHistory', () => ({ PatientVisitPaymentHistory: () => null }));

import VisitDetail from '@/pages/clinic/VisitDetail';

function renderVisit() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/clinic/visits/queue-1']}>
        <Routes>
          <Route path="/clinic/visits/:queueEntryId" element={<VisitDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('VisitDetail financial query failures', () => {
  beforeEach(() => { state.failure = ''; });

  it.each(['items', 'payments', 'claims'] as const)('does not render false financials when %s fail', (failure) => {
    state.failure = failure;
    renderVisit();
    expect(screen.getByRole('alert')).toHaveTextContent(/financial details.*unavailable/i);
    expect(screen.queryByText('Patient outstanding')).not.toBeInTheDocument();
    expect(screen.queryByText('Rendered financial controls')).not.toBeInTheDocument();
  });
});
