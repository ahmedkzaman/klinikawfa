import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const billingProps = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn(), useParams: () => ({ queueEntryId: 'queue-1' }) };
});

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ role: 'admin' }) }));
vi.mock('@/hooks/clinic/useQueueEntries', () => ({
  useQueueEntry: () => ({
    data: {
      id: 'queue-1',
      clinic_status: 'completed',
      created_at: '2026-08-05T09:00:00.000Z',
      queue_sequence: 1,
      payment_type: 'panel',
      patients: {
        name: 'Aminah',
        date_of_birth: null,
        national_id: null,
        phone: null,
        gender: null,
      },
      doctors: null,
    },
    isLoading: false,
  }),
}));
vi.mock('@/hooks/clinic/useConsultations', () => ({
  useConsultation: () => ({
    data: { id: 'consultation-1', status: 'completed', diagnosis_text: null },
  }),
}));
vi.mock('@/hooks/clinic/useConsultationItems', () => ({
  useConsultationItems: () => ({ data: [], refetch: vi.fn() }),
}));
vi.mock('@/hooks/clinic/usePayments', () => ({
  usePayments: () => ({
    data: [
      {
        id: 'payment-1',
        amount: 10,
        payment_method: 'cash',
        payment_type: 'self_pay',
        created_at: '2026-08-05T10:00:00.000Z',
      },
      {
        id: 'payment-2',
        amount: 93,
        payment_method: 'panel',
        payment_type: 'panel',
        created_at: '2026-08-05T11:00:00.000Z',
      },
    ],
    refetch: vi.fn(),
  }),
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
vi.mock('@/components/clinic/StatusBadge', () => ({
  StatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
}));
vi.mock('@/components/clinic/visit/VisitDetailsColumn', () => ({
  VisitDetailsColumn: () => null,
}));
vi.mock('@/components/clinic/visit/AttachmentsCard', () => ({
  AttachmentsCard: () => null,
}));
vi.mock('@/components/clinic/patient/PatientVisitPaymentHistory', () => ({
  PatientVisitPaymentHistory: () => null,
}));
vi.mock('@/components/clinic/visit/BillingDetailsColumn', () => ({
  BillingDetailsColumn: (props: { focusedPaymentId?: string | null }) => {
    billingProps(props);
    return (
      <section aria-label="Billing">
        {props.focusedPaymentId ? (
          <p>Selected payment {props.focusedPaymentId}</p>
        ) : (
          <p>No selected payment</p>
        )}
      </section>
    );
  },
}));
vi.mock('@/components/clinic/visit/CompletedBillCorrectionDialog', () => ({
  CompletedBillCorrectionDialog: () => null,
}));

import VisitDetail from '@/pages/clinic/VisitDetail';

function renderVisit(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <VisitDetail />
    </MemoryRouter>,
  );
}

describe('VisitDetail payment focus', () => {
  beforeEach(() => {
    billingProps.mockClear();
  });

  it('passes the selected payment query to the billing column', () => {
    renderVisit('/clinic/visits/queue-1?payment=payment-2');

    expect(screen.getByText('Selected payment payment-2')).toBeVisible();
    expect(billingProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ focusedPaymentId: 'payment-2' }),
    );
  });

  it('passes no focused payment when the query is missing', () => {
    renderVisit('/clinic/visits/queue-1');

    expect(screen.getByText('No selected payment')).toBeVisible();
    expect(billingProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ focusedPaymentId: null }),
    );
  });
});
