import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ConsultationItemRow, PaymentRow } from '@/types/clinic';

const printDialog = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ isSpecialAdmin: false }),
}));
vi.mock('@/hooks/clinic/usePayments', () => ({
  useVoidPayment: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('@/hooks/clinic/useClinicChargeTypes', () => ({
  useClinicChargeTypes: () => ({ data: [] }),
}));
vi.mock('@/components/clinic/billing/PrintReceiptDialog', () => ({
  PrintReceiptDialog: (props: { paymentId: string | null }) => {
    printDialog(props.paymentId);
    return props.paymentId ? <div>Receipt dialog {props.paymentId}</div> : null;
  },
}));
vi.mock('@/components/clinic/visit/RecordPaymentDialog', () => ({
  RecordPaymentDialog: () => null,
}));

import { BillingDetailsColumn } from '@/components/clinic/visit/BillingDetailsColumn';

const items = [
  {
    id: 'item-1',
    item_name: 'Consultation',
    quantity: 1,
    price: 100,
    item_id: null,
  } as ConsultationItemRow,
];

const payments = [
  {
    id: 'payment-1',
    amount: 10,
    payment_method: 'cash',
    payment_type: 'self_pay',
    created_at: '2026-08-05T10:00:00.000Z',
  },
  {
    id: 'payment-2',
    amount: 93,
    payment_method: 'panel',
    payment_type: 'panel',
    created_at: '2026-08-05T11:00:00.000Z',
  },
] as PaymentRow[];

function renderBilling(focusedPaymentId?: string | null) {
  render(
    <MemoryRouter>
      <BillingDetailsColumn
        queueEntryId="queue-1"
        consultationId="consultation-1"
        items={items}
        payments={payments}
        focusedPaymentId={focusedPaymentId}
      />
    </MemoryRouter>,
  );
}

describe('payment history row navigation', () => {
  it('links payment rows to the selected payment visit without hijacking print', async () => {
    renderBilling();

    expect(
      screen.getByRole('link', { name: /rm 10\.00.*5 aug/i }),
    ).toHaveAttribute('href', '/clinic/visits/queue-1?payment=payment-1');
    expect(
      screen.getByRole('link', { name: /rm 93\.00.*5 aug/i }),
    ).toHaveAttribute('href', '/clinic/visits/queue-1?payment=payment-2');

    fireEvent.click(screen.getAllByRole('button', { name: /print receipt/i })[0]);

    expect(screen.getByText('Receipt dialog payment-1')).toBeVisible();
  });

  it('marks only the selected payment row', () => {
    renderBilling('payment-2');

    const selected = screen.getByText('Selected payment').closest('[aria-current="true"]');

    expect(selected).toBeTruthy();
    expect(selected).toHaveTextContent('RM 93.00');
    expect(screen.getAllByText('Selected payment')).toHaveLength(1);
  });
});
