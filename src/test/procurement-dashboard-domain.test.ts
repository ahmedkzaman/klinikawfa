import { describe, expect, it } from 'vitest';
import {
  budgetCategoryLabel,
  parseProcurementDashboardReport,
  sortProcurementActions,
} from '../lib/clinic/procurementDashboard';

describe('procurement dashboard domain', () => {
  it('maps the four category labels', () => {
    expect(budgetCategoryLabel('medicines')).toBe('Medicines');
    expect(budgetCategoryLabel('consumables')).toBe('Consumables');
    expect(budgetCategoryLabel('vaccines')).toBe('Vaccines');
    expect(budgetCategoryLabel('other')).toBe('Other');
  });

  it('rejects a malformed report instead of showing false zeroes', () => {
    expect(() => parseProcurementDashboardReport({ totals: null })).toThrow(
      'Invalid procurement dashboard response',
    );
  });

  it('parses a well-formed report with coerced numerics', () => {
    const report = parseProcurementDashboardReport({
      month: '2026-08-01',
      budgetRows: [
        { category: 'medicines', budget: '1000', committed: '250.5', received: 0, remaining: '749.5' },
      ],
      totals: { budget: '1000', committed: '250.5', received: 0, remaining: '749.5' },
      counts: {
        stockoutRisk: '2',
        awaitingApproval: 1,
        awaitingDelivery: 0,
        overdue: '0',
        expiringSoon: 3,
      },
      actions: [],
    });
    expect(report.month).toBe('2026-08-01');
    expect(report.budgetRows[0]).toEqual({
      category: 'medicines',
      budget: 1000,
      committed: 250.5,
      received: 0,
      remaining: 749.5,
    });
    expect(report.counts.stockoutRisk).toBe(2);
    expect(report.counts.expiringSoon).toBe(3);
  });

  it('rejects reports with non-finite values', () => {
    expect(() =>
      parseProcurementDashboardReport({
        month: '2026-08-01',
        budgetRows: [],
        totals: { budget: Number.NaN, committed: 0, received: 0, remaining: 0 },
        counts: { stockoutRisk: 0, awaitingApproval: 0, awaitingDelivery: 0, overdue: 0, expiringSoon: 0 },
        actions: [],
      }),
    ).toThrow('Invalid procurement dashboard response');
  });

  it('sorts stockout, overdue, approval, follow-up, then expiry', () => {
    const actions = [
      { id: 'expiry', kind: 'expiry' as const, title: 'Expiry', dueDate: null, poId: null, itemId: 'i' },
      { id: 'approval', kind: 'approval' as const, title: 'Approval', dueDate: null, poId: 'p', itemId: null },
      { id: 'stock', kind: 'stockout' as const, title: 'Stock', dueDate: null, poId: null, itemId: 'i' },
      { id: 'follow', kind: 'follow_up' as const, title: 'Follow', dueDate: null, poId: 'p', itemId: null },
      { id: 'overdue', kind: 'overdue' as const, title: 'Overdue', dueDate: '2026-08-01', poId: 'p', itemId: null },
    ];
    expect(sortProcurementActions(actions).map((row) => row.id)).toEqual([
      'stock',
      'overdue',
      'approval',
      'follow',
      'expiry',
    ]);
  });
});
