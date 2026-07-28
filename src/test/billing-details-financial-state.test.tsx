import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ConsultationItemRow, PaymentRow } from '@/types/clinic';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ isSpecialAdmin: false }) }));
vi.mock('@/hooks/clinic/usePayments', () => ({ useVoidPayment: () => ({ mutateAsync: vi.fn() }) }));
vi.mock('@/hooks/clinic/useClinicChargeTypes', () => ({ useClinicChargeTypes: () => ({ data: [] }) }));
vi.mock('@/components/clinic/billing/PrintReceiptDialog', () => ({ PrintReceiptDialog: () => null }));
vi.mock('@/components/clinic/visit/RecordPaymentDialog', () => ({ RecordPaymentDialog: () => null }));

import { BillingDetailsColumn } from '@/components/clinic/visit/BillingDetailsColumn';

const item = { id: 'item-1', item_name: 'Consultation', quantity: 1, price: 100, item_id: null } as ConsultationItemRow;

function renderBilling(amount: number) {
  render(
    <BillingDetailsColumn
      queueEntryId="queue-1"
      consultationId="consultation-1"
      items={[item]}
      payments={[{ id: 'payment-1', amount, payment_method: 'cash', payment_type: 'self_pay', created_at: '2026-07-28T09:00:00.000Z' } as PaymentRow]}
    />,
  );
}

describe('BillingDetailsColumn financial state', () => {
  it.each([
    [75, 'Outstanding', 'RM 25.00'],
    [100, 'Paid', 'RM 0.00'],
    [125, 'Refund/Credit Due', 'RM 25.00'],
  ])('shows %s when total is RM 100.00 and paid is RM %s', (amount, label, value) => {
    renderBilling(amount);
    expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    expect(screen.getByText(value)).toBeVisible();
  });
});
