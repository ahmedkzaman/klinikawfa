import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import {
  mapPatientVisitPaymentHistoryRows,
  type PatientVisitPaymentHistoryItem,
} from '@/hooks/clinic/usePatientVisitPaymentHistory';
import { PatientVisitPaymentHistory } from '@/components/clinic/patient/PatientVisitPaymentHistory';

vi.mock('@/hooks/clinic/usePatientVisitPaymentHistory', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/clinic/usePatientVisitPaymentHistory')>(
    '@/hooks/clinic/usePatientVisitPaymentHistory',
  );
  return {
    ...actual,
    usePatientVisitPaymentHistory: () => ({
      data: historyItems,
      isLoading: false,
      isError: false,
    }),
  };
});

const historyItems: PatientVisitPaymentHistoryItem[] = [];

const fixture = [
  {
    id: 'queue-1',
    queue_sequence: 1,
    created_at: '2026-08-05T09:00:00.000Z',
    payment_type: 'panel',
    consultation_items: undefined,
    consultations: [
      {
        consultation_items: [
          { id: 'item-1', item_name: 'Consultation', quantity: 1, price: 100, deleted_at: null },
        ],
      },
    ],
    payments: [
      {
        id: 'payment-1',
        amount: 10,
        payment_method: 'qr_pay',
        payment_type: 'panel',
        created_at: '2026-08-05T10:00:00.000Z',
        deleted_at: null,
      },
      {
        id: 'payment-2',
        amount: 90,
        payment_method: 'panel',
        payment_type: 'panel',
        created_at: '2026-08-05T11:00:00.000Z',
        deleted_at: null,
      },
    ],
    panel_claims: [
      { amount: 90, received_amount: 0, status: 'submitted' },
    ],
  },
  {
    id: 'queue-2',
    queue_sequence: 2,
    created_at: '2026-08-01T09:00:00.000Z',
    payment_type: 'self_pay',
    consultations: [
      {
        consultation_items: [
          { id: 'item-2', item_name: 'Consultation', quantity: 1, price: 50, deleted_at: null },
        ],
      },
    ],
    payments: [
      {
        id: 'payment-3',
        amount: 20,
        payment_method: 'cash',
        payment_type: 'self_pay',
        created_at: '2026-08-01T10:00:00.000Z',
        deleted_at: null,
      },
    ],
    panel_claims: [],
  },
];

describe('patient visit payment history', () => {
  it('groups visits separately and calculates each visit with the dual ledger', () => {
    const result = mapPatientVisitPaymentHistoryRows(fixture);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      queueEntryId: 'queue-1',
      queueLabel: '260805-01',
      total: 100,
      patientPaid: 10,
      panelReceived: 90,
      patientOutstanding: 0,
    });
    expect(result[1]).toMatchObject({
      queueEntryId: 'queue-2',
      queueLabel: '260801-02',
      total: 50,
      patientPaid: 20,
      patientOutstanding: 30,
    });
  });

  it('renders previous visit links with selected payment targets', () => {
    historyItems.splice(0, historyItems.length, ...mapPatientVisitPaymentHistoryRows(fixture));

    render(
      <MemoryRouter>
        <PatientVisitPaymentHistory patientId="patient-1" currentQueueEntryId="queue-2" />
      </MemoryRouter>,
    );

    expect(screen.getByText('Previous bill history')).toBeVisible();
    expect(screen.getByRole('link', { name: /view visit 260805-01/i })).toHaveAttribute(
      'href',
      '/clinic/visits/queue-1?payment=payment-1',
    );
    expect(screen.queryByText('260801-02')).not.toBeInTheDocument();
  });
});
