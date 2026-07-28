import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

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
          ? Promise.resolve({ data: [{ amount: 40 }, { amount: 80 }], error: null })
          : chain,
        order: () => Promise.resolve({ data: activeCorrectedItems, error: null }),
        maybeSingle: () => Promise.resolve({ data: receiptPayment, error: null }),
      };
      return chain;
    },
  },
}));

import { PrintReceiptDialog } from '@/components/clinic/billing/PrintReceiptDialog';

const reportingMigration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260728153000_reconcile_completed_bill_financial_reporting.sql',
  ),
  'utf8',
);
const receipt = readFileSync(
  join(process.cwd(), 'src/components/clinic/billing/PrintReceiptDialog.tsx'),
  'utf8',
);
const queueBoard = readFileSync(
  join(process.cwd(), 'src/pages/clinic/QueueBoard.tsx'),
  'utf8',
);

describe('completed-bill financial reporting', () => {
  it('reconciles the RM 120 corrected bill in every reporting view', () => {
    // Medicine 60 + procedure 50 + other charge 15 - discount 10 + tax 5.
    // The historical adjustment row is soft-deleted and must not contribute.
    expect(reportingMigration).toMatch(/create or replace view public\.insight_financials_view/i);
    expect(reportingMigration).toMatch(/ci\.price\s*\*\s*ci\.quantity/i);
    expect(reportingMigration).toMatch(/ci\.unit_cost\s*\*\s*ci\.quantity/i);
    expect(reportingMigration).toMatch(/ci\.deleted_at is null/i);
    expect(reportingMigration).not.toMatch(/dispensed_qty/i);
    expect(reportingMigration).toMatch(/create or replace function public\.get_clinic_health_metrics/i);
    expect(reportingMigration).toMatch(
      /sum\(greatest\(amount - coalesce\(received_amount, 0\), 0\)\) filter \(where status = any \(array\['pending', 'submitted', 'approved'\]/i,
    );
  });

  it('prints the corrected billed quantity and current payment balance', () => {
    expect(receipt).toMatch(/select\('item_name, quantity, price, item_id'\)/i);
    expect(receipt).toMatch(/const qty\s*=\s*Number\(r\.quantity \?\? 0\)/i);
    expect(receipt).not.toMatch(/dispensed_qty/i);
  });

  it('uses billed quantities in the Queue Board completed-visit panel', () => {
    expect(queueBoard).toMatch(/sumActiveBillingLines\(completedVisitItems\)/);
    expect(queueBoard).toMatch(/const qty = Number\(item\.quantity \?\? 0\)/);
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
    expect(screen.getAllByText('30.00')).toHaveLength(1);
    expect(screen.queryByText('Balance Remaining (RM)')).not.toBeInTheDocument();
    expect(screen.getByText(/Card/i)).toBeVisible();
    expect(screen.queryByText(/Cash/i)).not.toBeInTheDocument();
  });
});
