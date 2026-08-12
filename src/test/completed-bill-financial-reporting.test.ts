import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { sumActiveBillingLines, billingFinancialState } from '@/lib/clinic/billingLedgerTotals';
import { isCompletedVisitUnpaid } from '@/lib/clinic/queuePaymentFocus';
import { classifyFinancialSegment } from '@/hooks/clinic/useFinancialInsights';
import { aggregatePanelClaimsSummary } from '@/hooks/clinic/usePanelClaims';

const receiptPayment = {
  id: 'payment-card-90',
  payment_method: 'card',
  payment_type: 'self_pay',
  amount: 90,
  created_at: '2026-07-28T09:00:00.000Z',
  queue_entry_id: 'queue-1',
  consultation_id: 'consultation-1',
  queue_entries: {
    queue_sequence: 1,
    created_at: '2026-07-28T09:00:00.000Z',
    patients: { name: 'Aminah', national_id: null, date_of_birth: null },
  },
};

const activeCorrectedItems = [
  { item_name: 'Medicine', quantity: 2, price: 30, item_id: 'medicine-1' },
  { item_name: 'Procedure', quantity: 1, price: 50, item_id: null },
  { item_name: 'Other charge', quantity: 1, price: 15, item_id: null },
  { item_name: 'Discount', quantity: 1, price: -10, item_id: null },
  { item_name: 'Tax', quantity: 1, price: 5, item_id: null },
];

vi.mock('@/hooks/clinic/useClinicSettings', () => ({
  useClinicSettings: () => ({ settings: { clinic_name: 'Klinik Awfa' } }),
}));

vi.mock('@/lib/clinic/printReceipt', () => ({
  downloadReceiptPdf: vi.fn(),
  printReceipt: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        is: () => table === 'payments'
          ? Promise.resolve({ data: [{
            id: receiptPayment.id,
            amount: 90,
            payment_method: 'card',
            created_at: receiptPayment.created_at,
          }], error: null })
          : chain,
        order: () => Promise.resolve({ data: activeCorrectedItems, error: null }),
        maybeSingle: () => Promise.resolve({ data: receiptPayment, error: null }),
      };
      return chain;
    },
  },
}));

import { PrintReceiptDialog } from '@/components/clinic/billing/PrintReceiptDialog';

describe('completed-bill financial reporting', () => {
  it('reconciles the active RM120 corrected bill across financial consumers', () => {
    const total = sumActiveBillingLines([
      { price: 30, quantity: 2 }, { price: 50, quantity: 1 },
      { price: 15, quantity: 1 }, { price: -10, quantity: 1 },
      { price: 5, quantity: 1 }, { price: 99, quantity: 1, deletedAt: 'voided' },
    ]);
    expect(total).toBe(120);
    expect(billingFinancialState(total, 90)).toEqual({ subtotal: 120, paid: 90, outstanding: 30, creditDue: 0 });
    expect(classifyFinancialSegment('card')).toBe('Self-Pay');
    expect(isCompletedVisitUnpaid([{ id: 'card-90', amount: 90 }])).toBe(false);
    expect(aggregatePanelClaimsSummary([{ status: 'approved', amount: 120, received_amount: 90, is_overdue: false }]))
      .toMatchObject({ outstandingSum: 30, creditDueSum: 0 });
    expect(aggregatePanelClaimsSummary([{ status: 'received', amount: 120, received_amount: 130, is_overdue: false }]))
      .toMatchObject({ outstandingSum: 0, creditDueSum: 10 });
  });

  it('renders the corrected RM 120 receipt with the replacement card payment', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(PrintReceiptDialog, {
          open: true,
          onOpenChange: vi.fn(),
          paymentId: 'payment-card-90',
        }),
      ),
    );

    expect(await screen.findByText('Invoice Total (RM)')).toBeVisible();
    expect(screen.getAllByText('120.00').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('90.00')).toBeVisible();
    expect(screen.getAllByText('30.00')).toHaveLength(2);
    expect(screen.getByText('Balance Remaining (RM)')).toBeVisible();
    expect(screen.getByText(/Card/i)).toBeVisible();
    expect(screen.queryByText(/Cash/i)).not.toBeInTheDocument();
  });
});
