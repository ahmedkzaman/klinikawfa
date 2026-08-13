import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const fixture = vi.hoisted(() => ({
  periodVisits: [] as Row[],
  periodPayments: [] as Row[],
  allPayments: [] as Row[],
  ranges: [] as Array<{ table: string; mode: string; from: number; to: number }>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      let mode = table === 'queue_entries' ? 'period-visits' : 'unknown';
      const builder: Record<string, unknown> & {
        then?: Promise<Row[]>['then'];
      } = {};
      const chain = () => builder;
      builder.select = chain;
      builder.is = chain;
      builder.gte = () => {
        if (table === 'payments') mode = 'period-payments';
        return builder;
      };
      builder.lte = chain;
      builder.order = chain;
      builder.in = () => {
        if (table === 'payments') mode = 'all-payments';
        return builder;
      };

      const rows = () => mode === 'period-visits'
        ? fixture.periodVisits
        : mode === 'period-payments'
          ? fixture.periodPayments
          : fixture.allPayments;
      const response = (data: Row[]) => ({ data, error: null });
      builder.range = (from: number, to: number) => {
        fixture.ranges.push({ table, mode, from, to });
        return Promise.resolve(response(rows().slice(from, to + 1)));
      };
      builder.then = (resolve, reject) => Promise.resolve(response(rows())).then(resolve, reject);
      return builder;
    },
  },
}));

import { usePaymentsLedger } from '@/hooks/clinic/usePayments';

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function payment(id: string, createdAt: string) {
  return {
    id,
    queue_entry_id: 'queue-1',
    amount: 10,
    payment_method: 'cash',
    payment_type: 'self_pay',
    created_at: createdAt,
    deleted_at: null,
    queue_entries: {
      id: 'queue-1', queue_sequence: 1, clinic_status: 'completed',
      created_at: '2026-07-01T00:00:00.000Z', patient_id: 'patient-1',
      payment_method: 'cash', panel_id: null,
      patients: { name: 'Test Patient', phone: null }, insurance_providers: null,
    },
  };
}

describe('usePaymentsLedger complete visit ledger', () => {
  beforeEach(() => {
    fixture.periodVisits = [];
    fixture.periodPayments = [];
    fixture.allPayments = [];
    fixture.ranges = [];
  });

  it('uses a payment event to select the visit but returns its earlier active tender too', async () => {
    fixture.periodPayments = [payment('later-event', '2026-08-12T09:00:00.000Z')];
    fixture.allPayments = [
      payment('earlier-tender', '2026-07-01T09:00:00.000Z'),
      payment('later-event', '2026-08-12T09:00:00.000Z'),
    ];
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () => usePaymentsLedger('2026-08-12T00:00:00.000Z', '2026-08-12T23:59:59.000Z'),
      { wrapper: wrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.paymentEvents.map((row) => row.id)).toEqual(['later-event']);
    expect(result.current.data?.payments.map((row) => row.id)).toEqual([
      'earlier-tender', 'later-event',
    ]);
  });

  it('pages the complete active payment ledger beyond the 1,000-row API cap', async () => {
    fixture.periodPayments = [payment('event', '2026-08-12T09:00:00.000Z')];
    fixture.allPayments = Array.from({ length: 1_089 }, (_, index) => (
      payment(`payment-${index}`, `2026-07-01T09:${String(index % 60).padStart(2, '0')}:00.000Z`)
    ));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () => usePaymentsLedger('2026-08-12T00:00:00.000Z', '2026-08-12T23:59:59.000Z'),
      { wrapper: wrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.payments).toHaveLength(1_089);
    expect(fixture.ranges.filter((request) => request.mode === 'all-payments')).toEqual([
      { table: 'payments', mode: 'all-payments', from: 0, to: 999 },
      { table: 'payments', mode: 'all-payments', from: 1_000, to: 1_999 },
    ]);
  });
});
