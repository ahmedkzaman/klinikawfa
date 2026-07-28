import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

import {
  useCompletedBillCorrectionContext,
  useCorrectCompletedBill,
} from '@/hooks/clinic/useCompletedBillCorrection';

const contextResponse = {
  queue_entry_id: 'queue-1',
  consultation_id: 'consultation-1',
  fingerprint: 'fingerprint-1',
  items: [{
    id: 'item-1',
    item_name: 'Consultation',
    quantity: 1,
    price: 50,
    item_id: null,
    service_id: 'service-1',
    package_id: null,
    dispensed_qty: null,
    adjustment_kind: null,
    charge_type_id: null,
  }],
  payments: [{
    id: 'payment-1',
    amount: 50,
    payment_method: 'cash',
    payment_type: 'self_pay',
  }],
  panel_claim: null,
};

const payload = {
  p_queue_entry_id: 'queue-1',
  p_expected_fingerprint: 'fingerprint-1',
  p_reason: 'Correct consultation charge',
  p_items: [{
    id: 'item-1',
    quantity: 1,
    price: 50,
    remove: false,
    adjustment_kind: null,
    charge_type_id: null,
    item_name: 'Consultation',
  }],
  p_payments: [{ id: 'payment-1', amount: 50, payment_method: 'cash' }],
  p_discount_rm: 0,
  p_tax_pct: 0,
};

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function createWrapper(queryClient: QueryClient) {
  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('completed bill correction hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads and maps correction context with the server fingerprint', async () => {
    rpc.mockResolvedValue({ data: contextResponse, error: null });
    const queryClient = createQueryClient();
    const { result } = renderHook(
      () => useCompletedBillCorrectionContext('queue-1', true),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(rpc).toHaveBeenCalledWith(
      'get_completed_bill_correction_context',
      { p_queue_entry_id: 'queue-1' },
    );
    expect(result.current.data?.fingerprint).toBe('fingerprint-1');
    expect(result.current.data).toMatchObject({
      queueEntryId: 'queue-1',
      consultationId: 'consultation-1',
      items: [expect.objectContaining({ itemName: 'Consultation', remove: false })],
      payments: [expect.objectContaining({ paymentMethod: 'cash', paymentType: 'self_pay' })],
    });
  });

  it('does not fetch correction context while the dialog is closed', async () => {
    const queryClient = createQueryClient();
    const { result } = renderHook(
      () => useCompletedBillCorrectionContext('queue-1', false),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
    expect(rpc).not.toHaveBeenCalled();
  });

  it('does not fetch correction context for a whitespace-only queue-entry ID', async () => {
    const queryClient = createQueryClient();
    const { result } = renderHook(
      () => useCompletedBillCorrectionContext('   ', true),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
    expect(rpc).not.toHaveBeenCalled();
  });

  it('keeps a pending panel claim reimbursement as null', async () => {
    rpc.mockResolvedValue({
      data: {
        ...contextResponse,
        panel_claim: {
          id: 'claim-1',
          status: 'pending',
          amount: 50,
          received_amount: null,
        },
      },
      error: null,
    });
    const queryClient = createQueryClient();
    const { result } = renderHook(
      () => useCompletedBillCorrectionContext('queue-1', true),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.panelClaim).toEqual({
      id: 'claim-1',
      status: 'pending',
      amount: 50,
      receivedAmount: null,
    });
  });

  it('submits the exact guarded payload and invalidates affected billing views', async () => {
    rpc.mockResolvedValue({
      data: { audit_id: 'audit-1', fingerprint: 'fingerprint-2' },
      error: null,
    });
    const queryClient = createQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCorrectCompletedBill(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync(payload);
    });

    expect(rpc).toHaveBeenCalledWith('correct_completed_bill', payload);
    expect(invalidateQueries.mock.calls.map(([filters]) => filters.queryKey)).toEqual([
      ['consultation', 'queue-1'],
      ['consultation_items'],
      ['payments', 'queue-1'],
      ['payments_ledger'],
      ['clinic', 'queue-entry', 'queue-1'],
      ['clinic', 'completed-visit-detail', 'queue-1'],
      ['patient_outstanding'],
      ['financial-insights'],
      ['sales-insights'],
      ['doctor-clinical-activity'],
      ['patient-ltv'],
      ['panel_claims'],
      ['panel_claims_summary'],
      ['panel_claim_items', 'queue-1'],
      ['ledger_item_totals'],
      ['receipt_payload'],
      ['consultation_history'],
      ['clinic', 'patient-visit-history'],
      ['debt', 'unpaid-visits'],
      ['completed-bill-correction-context', 'queue-1'],
    ]);
  });

  it.each([
    ['NOT_AUTHORIZED', 'You are not allowed to correct completed bills.'],
    ['VISIT_NOT_COMPLETED', 'Only completed visits can be corrected.'],
    ['STALE_BILL', 'This bill changed after you opened it. Reload and try again.'],
    ['CORRECTION_REASON_REQUIRED', 'Enter a correction reason.'],
    ['DISPENSED_MEDICINE_REMOVE', 'A dispensed medicine cannot be removed.'],
    ['QUANTITY_BELOW_DISPENSED', 'Quantity cannot be below the amount already dispensed.'],
  ])('maps the %s server error without exposing its raw details', async (code, message) => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: code, details: 'patient data or SQL must not reach the user' },
    });
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useCorrectCompletedBill(), {
      wrapper: createWrapper(queryClient),
    });

    await expect(result.current.mutateAsync(payload)).rejects.toThrow(message);
  });

  it('preserves unexpected RPC failures for the caller to handle', async () => {
    const unexpectedError = {
      message: 'Network unavailable',
      code: 'PGRST999',
      details: 'A non-correction RPC error',
    };
    rpc.mockResolvedValue({ data: null, error: unexpectedError });
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useCorrectCompletedBill(), {
      wrapper: createWrapper(queryClient),
    });

    await expect(result.current.mutateAsync(payload)).rejects.toMatchObject({
      message: 'Network unavailable',
      code: 'PGRST999',
      details: 'A non-correction RPC error',
    });
  });

  it('rejects malformed correction context instead of inventing values', async () => {
    rpc.mockResolvedValue({
      data: { ...contextResponse, fingerprint: null },
      error: null,
    });
    const queryClient = createQueryClient();
    const { result } = renderHook(
      () => useCompletedBillCorrectionContext('queue-1', true),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(
      expect.objectContaining({ message: 'Completed bill correction context is invalid.' }),
    );
  });
});
