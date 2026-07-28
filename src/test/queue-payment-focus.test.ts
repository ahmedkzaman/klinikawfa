import { describe, expect, it } from 'vitest';
import { isCashVisit, isCompletedVisitUnpaid } from '@/lib/clinic/queuePaymentFocus';

describe('isCompletedVisitUnpaid', () => {
  it('marks a completed visit with no active payments as unpaid', () => {
    expect(isCompletedVisitUnpaid([])).toBe(true);
  });

  it('ignores soft-deleted payments', () => {
    expect(isCompletedVisitUnpaid([{ id: 'p1', deleted_at: '2026-07-26T00:00:00Z' }])).toBe(true);
    expect(isCompletedVisitUnpaid([{ id: 'p2', deleted_at: null, amount: 1 }])).toBe(false);
    expect(isCompletedVisitUnpaid([{ id: 'p3', deleted_at: null, amount: 0 }])).toBe(true);
  });

  it('recognizes only cash visits without a panel', () => {
    expect(isCashVisit('cash', null)).toBe(true);
    expect(isCashVisit(' CASH ', null)).toBe(true);
    expect(isCashVisit('panel', 'panel-1')).toBe(false);
    expect(isCashVisit('cash', 'panel-1')).toBe(false);
  });
});
