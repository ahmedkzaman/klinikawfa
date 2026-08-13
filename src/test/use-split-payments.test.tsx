import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useRecordSplitPayments,
  useRecordSplitPaymentsAndCompleteVisit,
  useRecordPayment,
  useVoidPayment,
} from '@/hooks/clinic/usePayments';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  it('voids one payment portion through the audited RPC', async () => {
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useVoidPayment(), { wrapper: createWrapper(queryClient) });
    await act(async () => {
      await result.current.mutateAsync({ id: 'payment-1', queue_entry_id: 'queue-1', reason: 'Wrong tender' });
    });
    expect(rpc).toHaveBeenCalledWith('void_payment_portion', {
      p_payment_id: 'payment-1', p_reason: 'Wrong tender',
    });
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
    ['visit-panel-claim', 'queue-1'],
    ['panel_claims'],
    ['panel_claims_summary'],
    ['panel_claim_items', 'queue-1'],
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

  it('normalizes a plain PostgREST stale error and refreshes billing queries', async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '22023', message: 'STALE_PATIENT_OUTSTANDING: expected 42.50', details: null, hint: null },
    });
    const queryClient = createQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useRecordSplitPaymentsAndCompleteVisit(), {
      wrapper: createWrapper(queryClient),
    });
    await expect(result.current.mutateAsync({
      queue_entry_id: 'queue-1', consultation_id: 'consultation-1', payment_type: 'self_pay',
      expected_patient_amount: 50, payments: [{ method: 'cash', amount: 50 }],
      idempotency_key: '00000000-0000-4000-8000-000000000003',
    })).rejects.toThrow('STALE_PATIENT_OUTSTANDING: expected 42.50');
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

  it('routes the legacy hook through the durable idempotent RPC', async () => {
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useRecordPayment(), { wrapper: createWrapper(queryClient) });
    await act(async () => result.current.mutateAsync({
      queue_entry_id: 'queue-1', consultation_id: 'consultation-1', payment_type: 'self_pay',
      payment_method: 'cash', amount: 20,
      idempotency_key: '00000000-0000-4000-8000-000000000099',
    }));
    expect(rpc).toHaveBeenCalledWith('record_split_payments', {
      p_queue_entry_id: 'queue-1', p_consultation_id: 'consultation-1', p_payment_type: 'self_pay',
      p_payments: [{ payment_method: 'cash', amount: 20 }], p_notes: null,
      p_idempotency_key: '00000000-0000-4000-8000-000000000099',
    });
  });

  it('refreshes cached panel claim state after a portion void', async () => {
    const queryClient = createQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useVoidPayment(), { wrapper: createWrapper(queryClient) });
    await act(async () => {
      await result.current.mutateAsync({ id: 'payment-1', queue_entry_id: 'queue-1', reason: 'Correction' });
    });
    expect(invalidateQueries.mock.calls.map(([filters]) => filters.queryKey)).toContainEqual([
      'visit-panel-claim', 'queue-1',
    ]);
    expect(invalidateQueries.mock.calls.map(([filters]) => filters.queryKey)).toContainEqual(['panel_claims_summary']);
  });
});
