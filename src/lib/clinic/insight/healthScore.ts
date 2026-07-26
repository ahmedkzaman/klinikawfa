export interface ClinicHealthMetrics {
  financial: { revenue: number; profit: number; marginPct: number };
  visits: { registered: number; completed: number; cancelled: number; noShow: number };
  claims: { outstandingAmount: number; unsubmittedCount: number; overdueCount: number };
  panelFees: { activePanels: number; missingDefaultCount: number; mismatchedVisitCount: number };
  inventory: { outOfStockCount: number; belowReorderCount: number; expiring60DaysCount: number };
  dataQuality: { completedWithoutPayment: number; panelVisitWithoutPanel: number; consultationWithoutFee: number };
}

export interface ClinicHealthScore {
  status: 'scored' | 'insufficient-data';
  total: number | null;
  dimensions: Record<string, { score: number; explanation: string }>;
}

const clamp = (value: number) => Math.max(0, Math.min(100, value));

export function scoreClinicHealth(metrics: ClinicHealthMetrics | null | undefined): ClinicHealthScore {
  if (!metrics) return { status: 'insufficient-data', total: null, dimensions: {} };

  const dimensions = {
    financial: {
      score: clamp(metrics.financial.marginPct * 2),
      explanation: `Gross margin is ${metrics.financial.marginPct.toFixed(1)}%.`,
    },
    operations: {
      score: clamp(metrics.visits.registered > 0 ? (metrics.visits.completed / metrics.visits.registered) * 100 : 0),
      explanation: `${metrics.visits.completed} of ${metrics.visits.registered} visits completed.`,
    },
    claims: {
      score: clamp(100 - metrics.claims.overdueCount * 10 - metrics.claims.unsubmittedCount * 5),
      explanation: `${metrics.claims.overdueCount} overdue and ${metrics.claims.unsubmittedCount} unsubmitted claims.`,
    },
    inventory: {
      score: clamp(100 - metrics.inventory.outOfStockCount * 15 - metrics.inventory.belowReorderCount * 5),
      explanation: `${metrics.inventory.outOfStockCount} out of stock and ${metrics.inventory.belowReorderCount} below reorder level.`,
    },
    patients: {
      score: clamp(metrics.visits.registered > 0 ? (1 - metrics.visits.noShow / metrics.visits.registered) * 100 : 0),
      explanation: `${metrics.visits.noShow} no-show visits out of ${metrics.visits.registered}.`,
    },
    dataQuality: {
      score: clamp(100 - metrics.dataQuality.completedWithoutPayment * 10 - metrics.dataQuality.panelVisitWithoutPanel * 10 - metrics.dataQuality.consultationWithoutFee * 5),
      explanation: `${metrics.dataQuality.completedWithoutPayment + metrics.dataQuality.panelVisitWithoutPanel + metrics.dataQuality.consultationWithoutFee} data-quality exceptions found.`,
    },
  };
  const weights = { financial: .25, operations: .20, claims: .20, inventory: .15, patients: .10, dataQuality: .10 } as const;
  const total = Object.entries(weights).reduce((sum, [key, weight]) => sum + dimensions[key as keyof typeof dimensions].score * weight, 0);
  return { status: 'scored', total: clamp(total), dimensions };
}
