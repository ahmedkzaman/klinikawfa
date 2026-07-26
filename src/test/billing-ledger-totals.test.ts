import { describe, expect, it } from 'vitest';
import { reconcileBillingSubtotal } from '@/lib/clinic/billingLedgerTotals';

describe('reconcileBillingSubtotal', () => {
  it('includes a legacy additional charge when paid exceeds saved line items', () => {
    expect(reconcileBillingSubtotal(115, 130)).toEqual({
      subtotal: 130,
      unitemizedAdditionalCharges: 15,
    });
  });

  it('does not inflate subtotal for partial payments', () => {
    expect(reconcileBillingSubtotal(130, 100)).toEqual({
      subtotal: 130,
      unitemizedAdditionalCharges: 0,
    });
  });
});
