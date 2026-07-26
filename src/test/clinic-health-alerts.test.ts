import { describe, expect, it } from 'vitest';
import { buildClinicAlerts, type ClinicHealthMetrics } from '@/lib/clinic/insight/alerts';

describe('buildClinicAlerts', () => {
  it('prioritizes critical claims and links panel fee issues to settings', () => {
    const metrics: ClinicHealthMetrics = {
      financial: { revenue: 0, profit: 0, marginPct: 0 },
      visits: { registered: 0, completed: 0, cancelled: 0, noShow: 0 },
      claims: { outstandingAmount: 10, unsubmittedCount: 0, overdueCount: 2 },
      panelFees: { activePanels: 2, missingDefaultCount: 1, mismatchedVisitCount: 0 },
      inventory: { outOfStockCount: 0, belowReorderCount: 0, expiring60DaysCount: 0 },
      dataQuality: { completedWithoutPayment: 0, panelVisitWithoutPanel: 0, consultationWithoutFee: 0 },
    };
    const alerts = buildClinicAlerts(metrics);
    expect(alerts[0].severity).toBe('critical');
    expect(alerts.find((alert) => alert.id === 'missing-panel-fees')?.href).toBe('/clinic/settings/panels');
    expect(alerts.find((alert) => alert.id === 'overdue-claims')?.href).toBe('/clinic/panel-claims');
  });

  it('does not create alerts for zero issue counts', () => {
    const metrics: ClinicHealthMetrics = {
      financial: { revenue: 100, profit: 50, marginPct: 50 },
      visits: { registered: 1, completed: 1, cancelled: 0, noShow: 0 },
      claims: { outstandingAmount: 0, unsubmittedCount: 0, overdueCount: 0 },
      panelFees: { activePanels: 0, missingDefaultCount: 0, mismatchedVisitCount: 0 },
      inventory: { outOfStockCount: 0, belowReorderCount: 0, expiring60DaysCount: 0 },
      dataQuality: { completedWithoutPayment: 0, panelVisitWithoutPanel: 0, consultationWithoutFee: 0 },
    };
    expect(buildClinicAlerts(metrics)).toHaveLength(0);
  });

  it('links unpaid completed visits to the focused queue view', () => {
    const metrics: ClinicHealthMetrics = {
      financial: { revenue: 0, profit: 0, marginPct: 0 },
      visits: { registered: 1, completed: 1, cancelled: 0, noShow: 0 },
      claims: { outstandingAmount: 0, unsubmittedCount: 0, overdueCount: 0 },
      panelFees: { activePanels: 0, missingDefaultCount: 0, mismatchedVisitCount: 0 },
      inventory: { outOfStockCount: 0, belowReorderCount: 0, expiring60DaysCount: 0 },
      dataQuality: { completedWithoutPayment: 1, panelVisitWithoutPanel: 0, consultationWithoutFee: 0 },
    };
    expect(buildClinicAlerts(metrics, '2026-07-26').find((alert) => alert.id === 'missing-payment')?.href)
      .toBe('/clinic/queue?focus=missing-payment&date=2026-07-26');
  });
});
