import { describe, expect, it } from 'vitest';

import {
  aggregateSalesInsights,
  getLocalDateRangeBounds,
  shouldFetchNextSalesPage,
  SALES_PAGE_SIZE,
  type SalesPaymentRow,
} from '@/lib/clinic/salesInsights';

const payment = (
  overrides: Partial<SalesPaymentRow> & Pick<SalesPaymentRow, 'id' | 'created_at' | 'amount'>,
): SalesPaymentRow => ({
  queue_entry_id: 'queue-1',
  consultation_id: null,
  payment_type: 'self_pay',
  payment_method: 'cash',
  ...overrides,
});

describe('aggregateSalesInsights', () => {
  it('totals all signed finite payments and groups them by local day and method', () => {
    const result = aggregateSalesInsights([
      payment({ id: 'p1', created_at: '2026-07-23T01:00:00+08:00', amount: '100.50' }),
      payment({
        id: 'p2',
        created_at: '2026-07-23T22:00:00+08:00',
        amount: 25,
        payment_method: 'card',
        queue_entry_id: 'queue-2',
      }),
      payment({
        id: 'p3',
        created_at: '2026-07-24T09:00:00+08:00',
        amount: -10,
        payment_method: 'cash',
      }),
      payment({
        id: 'p4',
        created_at: '2026-07-24T10:00:00+08:00',
        amount: 'invalid',
        payment_method: null,
      }),
    ]);

    expect(result.summary).toEqual({
      totalCollected: 115.5,
      paymentCount: 4,
      visitCount: 2,
    });
    expect(result.dailyTrends).toEqual([
      { date: '2026-07-23', collected: 125.5 },
      { date: '2026-07-24', collected: -10 },
    ]);
    expect(result.byMethod).toEqual([
      { method: 'cash', collected: 90.5, paymentCount: 2 },
      { method: 'card', collected: 25, paymentCount: 1 },
      { method: 'unknown', collected: 0, paymentCount: 1 },
    ]);
    expect(result.rows.map((row) => row.amount)).toEqual([100.5, 25, -10, 0]);
  });

  it('uses inclusive local calendar-day boundaries', () => {
    const start = new Date(2026, 6, 23, 14, 30);
    const end = new Date(2026, 6, 25, 9, 15);

    const bounds = getLocalDateRangeBounds(start, end);

    const expectedStart = new Date('2026-07-23T00:00:00+08:00').toISOString();
    const expectedEndExclusive = new Date('2026-07-26T00:00:00+08:00').toISOString();
    expect(bounds).toEqual({ startIso: expectedStart, endExclusiveIso: expectedEndExclusive });
  });
});

describe('sales pagination', () => {
  it('continues only when a full page was returned', () => {
    expect(SALES_PAGE_SIZE).toBe(1000);
    expect(shouldFetchNextSalesPage(1000)).toBe(true);
    expect(shouldFetchNextSalesPage(999)).toBe(false);
    expect(shouldFetchNextSalesPage(0)).toBe(false);
  });
});
