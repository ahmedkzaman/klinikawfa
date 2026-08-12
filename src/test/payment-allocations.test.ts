import { describe, expect, it } from 'vitest';
import {
  remainingAllocationAmount,
  summarizePaymentMethods,
  validatePaymentAllocations,
} from '@/lib/clinic/paymentAllocations';

describe('payment allocations', () => {
  it('calculates the exact remainder in sen', () => {
    expect(remainingAllocationAmount(100, [{ method: 'cash', amount: 40 }])).toBe(60);
  });

  it('accepts Cash RM40 plus QR Pay RM60 for RM100', () => {
    expect(validatePaymentAllocations({
      allocations: [
        { method: 'cash', amount: 40 },
        { method: 'qr_pay', amount: 60 },
      ],
      expectedAmount: 100,
      requireExact: true,
    })).toEqual({ valid: true, total: 100, remaining: 0, errors: [] });
  });

  it('rejects duplicate methods and under-allocation', () => {
    const result = validatePaymentAllocations({
      allocations: [
        { method: 'cash', amount: 40 },
        { method: 'cash', amount: 20 },
      ],
      expectedAmount: 100,
      requireExact: true,
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Each payment method can only be used once.');
    expect(result.errors).toContain('Allocate the remaining RM40.00.');
  });

  it('uses canonical display order', () => {
    expect(summarizePaymentMethods(['qr_pay', 'cash', 'qr_pay'])).toBe('Cash + QR Pay');
  });
});
