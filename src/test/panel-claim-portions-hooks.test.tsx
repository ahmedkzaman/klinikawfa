import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useCancelPanelClaimPortions,
  useBulkMarkClaimsSubmitted,
  usePanelClaimPortionCounts,
  usePanelClaimPortions,
  useRecordPanelClaimPortionPayment,
  useReplacePanelClaimPortions,
  useUpdatePanelClaim,
} from '@/hooks/clinic/usePanelClaims';

const { rpc, from, select, eq, inIds, order } = vi.hoisted(() => {
  const order = vi.fn();
  const eq = vi.fn(() => ({ order }));
  const inIds = vi.fn();
  const select = vi.fn(() => ({ eq, in: inIds }));
  const from = vi.fn(() => ({ select }));
  return { rpc: vi.fn(), from, select, eq, inIds, order };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc, from } }));

const portion = {
  id: 'portion-1',
  panel_claim_id: 'claim-1',
  portion_no: 1,
  amount: '120.50',
  received_amount: '20.50',
  status: 'partially_paid',
  payment_reference: 'REF-001',
  received_date: '2026-08-04',
  remark: 'First payment',
  created_at: '2026-08-04T10:00:00.000Z',
  updated_at: '2026-08-04T10:00:00.000Z',
};

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

function expectPanelFinanceInvalidations(invalidateQueries: ReturnType<typeof vi.spyOn>) {
  expect(invalidateQueries.mock.calls.slice(-6).map(([filters]) => filters.queryKey)).toEqual([
    ['panel_claims'],
    ['panel_claims_summary'],
    ['panel_claim_portions', 'claim-1'],
    ['panel_claim_portion_counts'],
    ['financial-control'],
    ['clinic-health'],
  ]);
}

describe('panel claim portion hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    order.mockResolvedValue({ data: [portion], error: null });
    inIds.mockResolvedValue({ data: [{ panel_claim_id: 'claim-1' }, { panel_claim_id: 'claim-1' }], error: null });
    rpc.mockResolvedValue({ data: portion, error: null });
  });

  it('reads a claim\'s portions in portion order', async () => {
    const queryClient = createQueryClient();
    const { result } = renderHook(() => usePanelClaimPortions('claim-1'), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.data).toHaveLength(1));

    expect(queryClient.getQueryCache().find({ queryKey: ['panel_claim_portions', 'claim-1'] })).toBeDefined();
    expect(result.current.data).toEqual([{ ...portion, amount: 120.5, received_amount: 20.5 }]);
    expect(from).toHaveBeenCalledWith('panel_claim_portions');
    expect(select).toHaveBeenCalledWith('*');
    expect(eq).toHaveBeenCalledWith('panel_claim_id', 'claim-1');
    expect(order).toHaveBeenCalledWith('portion_no');
  });

  it('counts portions for the current claims page with one scoped query', async () => {
    const queryClient = createQueryClient();
    const { result } = renderHook(() => usePanelClaimPortionCounts(['claim-1', 'claim-2']), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.data).toEqual({ 'claim-1': 2, 'claim-2': 0 }));

    expect(from).toHaveBeenCalledWith('panel_claim_portions');
    expect(select).toHaveBeenCalledWith('panel_claim_id');
    expect(inIds).toHaveBeenCalledWith('panel_claim_id', ['claim-1', 'claim-2']);
  });

  it('replaces portions only through the secured RPC and refreshes panel finance data', async () => {
    rpc.mockResolvedValueOnce({ data: [portion], error: null });
    const queryClient = createQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useReplacePanelClaimPortions(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({
        claimId: 'claim-1',
        portions: [
          { amount: '120.50', remark: 'First' },
          { amount: '79.50', remark: '' },
        ],
        reason: 'Corrected allocation',
        expectedVersion: 3,
      });
    });

    expect(rpc).toHaveBeenCalledWith('replace_panel_claim_portions', {
      p_panel_claim_id: 'claim-1',
      p_portions: [
        { amount: 120.5, remark: 'First' },
        { amount: 79.5, remark: '' },
      ],
      p_reason: 'Corrected allocation',
      p_expected_version: 3,
    });
    expectPanelFinanceInvalidations(invalidateQueries);
  });

  it('updates lifecycle fields through the secured workflow RPC', async () => {
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useUpdatePanelClaim(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({
        id: 'claim-1',
        status: 'approved',
        submitted_date: '2026-08-04',
        approved_amount: 200,
        payment_reference: null,
        received_date: null,
        received_amount: null,
        remarks: 'Approved by panel',
        gl_document_url: 'claim-1/evidence.pdf',
      });
    });

    expect(rpc).toHaveBeenCalledWith('update_panel_claim_workflow', {
      p_panel_claim_id: 'claim-1',
      p_status: 'approved',
      p_submitted_date: '2026-08-04',
      p_approved_amount: 200,
      p_payment_reference: null,
      p_received_date: null,
      p_received_amount: null,
      p_remarks: 'Approved by panel',
      p_gl_document_url: 'claim-1/evidence.pdf',
      p_due_date: null,
    });
  });

  it('bulk-submits claims through the terminal-safe workflow RPC', async () => {
    rpc.mockResolvedValueOnce({ data: 1, error: null });
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useBulkMarkClaimsSubmitted(), {
      wrapper: createWrapper(queryClient),
    });

    let updated = 0;
    await act(async () => {
      updated = await result.current.mutateAsync(['claim-pending', 'claim-received']);
    });

    expect(updated).toBe(1);
    expect(rpc).toHaveBeenCalledWith('bulk_submit_panel_claims', {
      p_panel_claim_ids: ['claim-pending', 'claim-received'],
      p_submitted_date: expect.any(String),
    });
    expect(from).not.toHaveBeenCalledWith('panel_claims');
  });

  it('cancels portions only through the secured RPC and refreshes panel finance data', async () => {
    const queryClient = createQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCancelPanelClaimPortions(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({
        claimId: 'claim-1',
        reason: 'No longer needed',
        expectedVersion: 4,
      });
    });

    expect(rpc).toHaveBeenCalledWith('cancel_panel_claim_portions', {
      p_panel_claim_id: 'claim-1',
      p_reason: 'No longer needed',
      p_expected_version: 4,
    });
    expectPanelFinanceInvalidations(invalidateQueries);
  });

  it('forwards caller-owned idempotency keys through the secured payment RPC and refreshes panel finance data', async () => {
    const queryClient = createQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useRecordPanelClaimPortionPayment(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({
        claimId: 'claim-1',
        portionId: 'portion-1',
        amount: 20.5,
        receivedDate: '2026-08-04',
        paymentReference: 'REF-002',
        remark: 'Second payment',
        idempotencyKey: '00000000-0000-4000-8000-000000000001',
      });
      await result.current.mutateAsync({
        claimId: 'claim-1',
        portionId: 'portion-1',
        amount: 10,
        receivedDate: '2026-08-05',
        paymentReference: 'REF-003',
        remark: '',
        idempotencyKey: '00000000-0000-4000-8000-000000000002',
      });
    });

    expect(rpc).toHaveBeenNthCalledWith(1, 'record_panel_claim_portion_payment', {
      p_portion_id: 'portion-1',
      p_amount: 20.5,
      p_received_date: '2026-08-04',
      p_payment_reference: 'REF-002',
      p_remark: 'Second payment',
      p_idempotency_key: '00000000-0000-4000-8000-000000000001',
    });
    expect(rpc).toHaveBeenNthCalledWith(2, 'record_panel_claim_portion_payment', {
      p_portion_id: 'portion-1',
      p_amount: 10,
      p_received_date: '2026-08-05',
      p_payment_reference: 'REF-003',
      p_remark: '',
      p_idempotency_key: '00000000-0000-4000-8000-000000000002',
    });
    expectPanelFinanceInvalidations(invalidateQueries);
    expect(invalidateQueries).toHaveBeenCalledTimes(12);
  });
});
