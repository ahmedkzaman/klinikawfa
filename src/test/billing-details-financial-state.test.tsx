import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ConsultationItemRow, PaymentRow } from '@/types/clinic';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ isSpecialAdmin: false }) }));
vi.mock('@/hooks/clinic/usePayments', () => ({ useVoidPayment: () => ({ mutateAsync: vi.fn() }) }));
vi.mock('@/hooks/clinic/useClinicChargeTypes', () => ({ useClinicChargeTypes: () => ({ data: [] }) }));
vi.mock('@/components/clinic/billing/PrintReceiptDialog', () => ({ PrintReceiptDialog: () => null }));
vi.mock('@/components/clinic/visit/RecordPaymentDialog', () => ({ RecordPaymentDialog: () => null }));

import { BillingDetailsColumn } from '@/components/clinic/visit/BillingDetailsColumn';

const item = { id: 'item-1', item_name: 'Consultation', quantity: 1, price: 100, item_id: null } as ConsultationItemRow;

function renderBilling(amount: number, billingItem = item) {
  render(
    <MemoryRouter>
      <BillingDetailsColumn
        queueEntryId="queue-1"
        consultationId="consultation-1"
        items={[billingItem]}
        payments={[{ id: 'payment-1', amount, payment_method: 'cash', payment_type: 'self_pay', created_at: '2026-07-28T09:00:00.000Z' } as PaymentRow]}
      />
    </MemoryRouter>,
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

  it('uses a medicine line’s corrected billed quantity rather than its dispensed quantity', () => {
    const correctedMedicine = {
      id: 'medicine-1', item_name: 'Medicine', quantity: 3, price: 10, item_id: 'catalog-1', dispensed_qty: 2,
    } as ConsultationItemRow;
    renderBilling(30, correctedMedicine);
    expect(screen.getAllByText('Paid').length).toBeGreaterThan(0);
    expect(screen.getAllByText('RM 30.00').length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText('Refund/Credit Due')).not.toBeInTheDocument();
  });
});
