import { describe, expect, it } from 'vitest';
import { isCompletedVisitUnpaid } from '@/lib/clinic/queuePaymentFocus';

describe('isCompletedVisitUnpaid', () => {
  it('marks a completed visit with no active payments as unpaid', () => {
    expect(isCompletedVisitUnpaid([])).toBe(true);
  });

  it('ignores soft-deleted payments', () => {
    expect(isCompletedVisitUnpaid([{ id: 'p1', deleted_at: '2026-07-26T00:00:00Z' }])).toBe(true);
    expect(isCompletedVisitUnpaid([{ id: 'p2', deleted_at: null }])).toBe(false);
  });
});
