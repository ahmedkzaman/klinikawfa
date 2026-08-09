import { describe, expect, it } from 'vitest';
import {
  parsePaymentVisitLocation,
  paymentVisitPath,
} from '@/lib/clinic/paymentHistoryNavigation';

describe('payment history navigation', () => {
  it('builds visit paths with selected payment query state', () => {
    expect(paymentVisitPath('queue-1', 'payment-1')).toBe(
      '/clinic/visits/queue-1?payment=payment-1',
    );
  });

  it('parses the focused payment from the location search string', () => {
    expect(parsePaymentVisitLocation('?payment=payment-1')).toEqual({
      paymentId: 'payment-1',
    });
    expect(parsePaymentVisitLocation('?payment=')).toEqual({
      paymentId: null,
    });
  });
});
