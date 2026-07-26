import { describe, expect, it } from 'vitest';
import { scoreClinicHealth, type ClinicHealthMetrics } from '@/lib/clinic/insight/healthScore';

const metrics: ClinicHealthMetrics = {
  financial: { revenue: 1000, profit: 250, marginPct: 25 },
  visits: { registered: 100, completed: 80, cancelled: 10, noShow: 5 },
  claims: { outstandingAmount: 100, unsubmittedCount: 2, overdueCount: 1 },
  panelFees: { activePanels: 4, missingDefaultCount: 1, mismatchedVisitCount: 2 },
  inventory: { outOfStockCount: 1, belowReorderCount: 2, expiring60DaysCount: 3 },
  dataQuality: { completedWithoutPayment: 1, panelVisitWithoutPanel: 0, consultationWithoutFee: 2 },
};

describe('scoreClinicHealth', () => {
  it('returns all six dimension scores and their weighted total', () => {
    const result = scoreClinicHealth(metrics);
    expect(Object.keys(result.dimensions)).toEqual([
      'financial', 'operations', 'claims', 'inventory', 'patients', 'dataQuality',
    ]);
    expect(result.status).toBe('scored');
    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(result.total).toBeLessThanOrEqual(100);
    expect(result.dimensions.financial.explanation).toContain('25');
  });

  it('reports insufficient data instead of presenting a healthy zero record as 100', () => {
    const result = scoreClinicHealth(null);
    expect(result.status).toBe('insufficient-data');
    expect(result.total).toBeNull();
  });
});
