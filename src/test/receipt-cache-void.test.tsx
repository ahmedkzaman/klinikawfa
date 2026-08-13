import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReceiptData } from '@/components/clinic/billing/ReceiptTemplate';

const state = vi.hoisted(() => ({
  rpc: vi.fn(),
  printReceipt: vi.fn(),
  downloadReceiptPdf: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: state.rpc } }));
vi.mock('@/hooks/clinic/useClinicSettings', () => ({
  useClinicSettings: () => ({ settings: { clinic_name: 'Klinik Awfa' } }),
}));
vi.mock('@/lib/clinic/printReceipt', () => ({
  printReceipt: state.printReceipt,
  downloadReceiptPdf: state.downloadReceiptPdf,
}));

import { PrintReceiptDialog } from '@/components/clinic/billing/PrintReceiptDialog';

const staleReceipt = {
  paymentId: 'sibling-payment', paymentMethod: 'cash', paymentType: 'self_pay',
  amountPaid: 100, createdAt: '2026-08-12T09:00:00.000Z', queueLabel: 'Q001',
  patientName: 'Test Patient', patientIc: null, items: [], invoiceGroups: [],
  subtotal: 100, invoiceTotal: 100, balanceRemaining: 0,
  paymentPortions: [
    { id: 'voided-tender', method: 'cash', amount: 40 },
    { id: 'sibling-payment', method: 'qr_pay', amount: 60 },
  ],
} as ReceiptData;

describe('receipt cache safety after a sibling tender is voided', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.rpc.mockResolvedValue({
      data: null,
      error: { code: '22023', message: 'PAYMENT_VOIDED', details: null, hint: null },
    });
  });

  it('refetches on open and never prints a fresh-cache payload containing the voided tender', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 5 * 60_000 } },
    });
    queryClient.setQueryData(['receipt_payload', 'sibling-payment'], staleReceipt);

    render(
      <QueryClientProvider client={queryClient}>
        <PrintReceiptDialog
          open
          onOpenChange={vi.fn()}
          paymentId="sibling-payment"
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(/payment voided/i);
    expect(state.rpc).toHaveBeenCalledWith('get_payment_batch_receipt', {
      p_payment_id: 'sibling-payment',
    });
    expect(screen.getByRole('button', { name: /print receipt/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /print receipt/i }));
    expect(state.printReceipt).not.toHaveBeenCalled();
  });
});
