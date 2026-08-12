import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useRecordSplitPayments,
  useRecordSplitPaymentsAndCompleteVisit,
} from '@/hooks/clinic/usePayments';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function createWrapper(queryClient: QueryClient) {
  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function expectCheckoutInvalidations(invalidateQueries: ReturnType<typeof vi.spyOn>) {
  expect(invalidateQueries.mock.calls.map(([filters]) => filters.queryKey)).toEqual([
    ['payments', 'queue-1'],
    ['payments_ledger'],
    ['consultation'],
    ['clinic'],
  ]);
}

describe('split payment mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: { payment_count: 2 }, error: null });
  });

  it('records split tenders and completes the visit through the checkout RPC', async () => {
    const queryClient = createQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useRecordSplitPaymentsAndCompleteVisit(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({
        queue_entry_id: 'queue-1',
        consultation_id: 'consultation-1',
        payment_type: 'self_pay',
        expected_patient_amount: 100,
        payments: [
          { method: 'cash', amount: 40 },
          { method: 'qr_pay', amount: 60 },
        ],
        idempotency_key: '00000000-0000-4000-8000-000000000001',
      });
    });

    expect(rpc).toHaveBeenCalledWith('record_split_payments_and_complete_visit', {
      p_queue_entry_id: 'queue-1',
      p_consultation_id: 'consultation-1',
      p_payment_type: 'self_pay',
      p_expected_patient_amount: 100,
      p_payments: [
        { payment_method: 'cash', amount: 40 },
        { payment_method: 'qr_pay', amount: 60 },
      ],
      p_provider_id: null,
      p_notes: null,
      p_idempotency_key: '00000000-0000-4000-8000-000000000001',
    });
    expectCheckoutInvalidations(invalidateQueries);
  });

  it('records an additional split tender through the post-completion RPC', async () => {
    const queryClient = createQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useRecordSplitPayments(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({
        queue_entry_id: 'queue-1',
        consultation_id: 'consultation-1',
        payment_type: 'panel',
        expected_patient_amount: 0,
        payments: [{ method: 'card', amount: 25, notes: 'Deposit' }],
        provider_id: 'provider-1',
        notes: 'Follow-up',
        idempotency_key: '00000000-0000-4000-8000-000000000002',
      });
    });

    expect(rpc).toHaveBeenCalledWith('record_split_payments', {
      p_queue_entry_id: 'queue-1',
      p_consultation_id: 'consultation-1',
      p_payment_type: 'panel',
      p_payments: [{ payment_method: 'card', amount: 25 }],
      p_notes: 'Follow-up',
      p_idempotency_key: '00000000-0000-4000-8000-000000000002',
    });
    expectCheckoutInvalidations(invalidateQueries);
  });
});
