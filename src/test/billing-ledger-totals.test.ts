import { describe, expect, it } from 'vitest';
import {
  reconcileBillingSubtotal,
  sumActiveBillingLines,
  billingFinancialState,
} from '@/lib/clinic/billingLedgerTotals';

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

  it('keeps a corrected credit as credit rather than inventing a charge', () => {
    expect(billingFinancialState(80, 90)).toEqual({ subtotal: 80, paid: 90, outstanding: 0, creditDue: 10 });
  });

  it('uses every active corrected billing line, including adjustments, at billed quantity', () => {
    expect(sumActiveBillingLines([
      { price: 30, quantity: 2, deletedAt: null }, // medicine RM 60
      { price: 50, quantity: 1, deletedAt: null }, // procedure RM 50
      { price: 15, quantity: 1, deletedAt: null }, // other charge RM 15
      { price: -10, quantity: 1, deletedAt: null }, // discount RM -10
      { price: 5, quantity: 1, deletedAt: null }, // tax RM 5
      { price: 99, quantity: 1, deletedAt: '2026-07-28T00:00:00Z' },
    ])).toBe(120);
  });
});
