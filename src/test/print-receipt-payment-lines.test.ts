import { describe, expect, it } from 'vitest';
import { receiptPaymentLines } from '@/lib/clinic/printReceipt';
import type { ReceiptData } from '@/components/clinic/billing/ReceiptTemplate';

describe('receiptPaymentLines', () => {
  it('renders each physical portion and excludes panel allocation markers', () => {
    const data = {
      paymentMethod: 'qr_pay', amountPaid: 100,
      paymentPortions: [
        { id: 'cash', method: 'cash', amount: 40 },
        { id: 'qr', method: 'qr_pay', amount: 60 },
        { id: 'panel', method: 'panel', amount: 0 },
      ],
    } as ReceiptData;
    expect(receiptPaymentLines(data)).toEqual([
      { label: 'Cash', amount: 40 },
      { label: 'QR Pay', amount: 60 },
    ]);
  });
});
