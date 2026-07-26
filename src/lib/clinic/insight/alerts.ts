import type { ClinicHealthMetrics } from './healthScore';

export interface ClinicHealthAlert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  href: string;
}

export function buildClinicAlerts(metrics: ClinicHealthMetrics): ClinicHealthAlert[] {
  const alerts: ClinicHealthAlert[] = [];
  if (metrics.claims.overdueCount > 0) alerts.push({ id: 'overdue-claims', severity: 'critical', title: 'Overdue panel claims', detail: `${metrics.claims.overdueCount} claims need follow-up.`, href: '/clinic/panel-claims' });
  if (metrics.panelFees.missingDefaultCount > 0) alerts.push({ id: 'missing-panel-fees', severity: 'warning', title: 'Panel fees need configuration', detail: `${metrics.panelFees.missingDefaultCount} active panels have no default consultation fee.`, href: '/clinic/settings/panels' });
  if (metrics.inventory.outOfStockCount > 0) alerts.push({ id: 'out-of-stock', severity: 'critical', title: 'Items out of stock', detail: `${metrics.inventory.outOfStockCount} items are out of stock.`, href: '/clinic/inventory' });
  if (metrics.dataQuality.completedWithoutPayment > 0) alerts.push({ id: 'missing-payment', severity: 'warning', title: 'Completed visits without payment', detail: `${metrics.dataQuality.completedWithoutPayment} completed visits have no payment record.`, href: '/clinic/queue?focus=missing-payment' });
  const rank = { critical: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
