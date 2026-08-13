import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  ledgerError: false,
  queryErrorTable: '' as '' | 'consultations' | 'panel_claims',
}));

const ledgerRows = [{
  id: 'payment-1', queue_entry_id: 'queue-1', consultation_id: 'consultation-1',
  amount: 50, payment_method: 'cash', payment_type: 'self_pay', deleted_at: null,
  created_at: '2026-08-12T09:00:00.000Z',
  queue_entries: {
    id: 'queue-1', queue_sequence: 1, clinic_status: 'completed',
    created_at: '2026-08-12T08:00:00.000Z', patient_id: 'patient-1',
    payment_method: 'cash', panel_id: null,
    patients: { name: 'Test Patient', phone: null }, insurance_providers: null,
  },
}];

vi.mock('@/hooks/clinic/usePayments', () => ({
  usePaymentsLedger: () => state.ledgerError
    ? { data: undefined, isLoading: false, isError: true, error: new Error('ledger failed') }
    : {
      data: {
        payments: ledgerRows,
        paymentEvents: ledgerRows,
        visits: [],
        queueEntryIds: ['queue-1'],
      },
      isLoading: false,
      isError: false,
      error: null,
    },
}));

vi.mock('@/components/clinic/billing/PrintReceiptDialog', () => ({ PrintReceiptDialog: () => null }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const builder: Record<string, unknown> & { then?: Promise<unknown>['then'] } = {};
      for (const method of ['select', 'in', 'is', 'order']) builder[method] = () => builder;
      const response = () => (
        state.queryErrorTable === table
          ? { data: null, error: { message: `${table} failed` } }
          : table === 'consultations'
            ? { data: [{ id: 'consultation-1', queue_entry_id: 'queue-1' }], error: null }
            : { data: [], error: null }
      );
      builder.range = () => Promise.resolve(response());
      builder.then = (resolve, reject) => Promise.resolve(
        response(),
      ).then(resolve, reject);
      return builder;
    },
  },
}));

import Billings from '@/pages/clinic/Billings';

function renderBillings() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Billings />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Billings financial query failures', () => {
  beforeEach(() => {
    state.ledgerError = false;
    state.queryErrorTable = '';
  });

  it('shows an explicit ledger error instead of an empty financial state', async () => {
    state.ledgerError = true;
    renderBillings();
    expect(await screen.findByRole('alert')).toHaveTextContent(/billing data.*unavailable/i);
    expect(screen.queryByText('No entries in this view')).not.toBeInTheDocument();
  });

  it.each([
    ['consultations', 'billing items'],
    ['panel_claims', 'panel claims'],
  ] as const)('fails closed when %s cannot load', async (table, label) => {
    state.queryErrorTable = table;
    renderBillings();
    expect(await screen.findByRole('alert')).toHaveTextContent(new RegExp(`${label}.*unavailable`, 'i'));
    expect(screen.queryByText('No entries in this view')).not.toBeInTheDocument();
    expect(screen.queryByText('Test Patient')).not.toBeInTheDocument();
  });
});
