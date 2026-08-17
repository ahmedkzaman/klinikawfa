import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ClinicHealthTab } from '@/components/clinic/insight/ClinicHealthTab';
import type { FinancialControlSummary } from '@/lib/clinic/financialControl';
import type { ClinicHealthMetrics } from '@/lib/clinic/insight/healthScore';

const hooks = vi.hoisted(() => ({ clinic: vi.fn(), financial: vi.fn(), attendance: vi.fn() }));
vi.mock('@/hooks/clinic/useClinicHealth', () => ({ useClinicHealth: hooks.clinic }));
vi.mock('@/hooks/clinic/useFinancialControl', () => ({ useFinancialControlSummary: hooks.financial }));
vi.mock('@/hooks/clinic/useAttendanceHeatmap', () => ({ useAttendanceHeatmap: hooks.attendance }));

const metrics: ClinicHealthMetrics = {
  financial: { revenue: 0, profit: 0, marginPct: 0 },
  visits: { registered: 1, completed: 1, cancelled: 0, noShow: 0 },
  claims: { outstandingAmount: 0, unsubmittedCount: 0, overdueCount: 0 },
  panelFees: { activePanels: 0, missingDefaultCount: 0, mismatchedVisitCount: 0 },
  inventory: { outOfStockCount: 0, belowReorderCount: 0, expiring60DaysCount: 0 },
  dataQuality: { completedWithoutPayment: 0, panelVisitWithoutPanel: 0, consultationWithoutFee: 0 },
};

const financial: FinancialControlSummary = {
  period: { billedRevenue: 100, cashCollected: 100, cohortCollected: 100, olderDebtCollected: 0, collectionRate: 100, cogs: 20, grossProfit: 80, grossMarginPct: 80, cohortOutstanding: 0, totalOutstanding: 0, averageBill: 100, completedVisits: 1, attributionComplete: true, costComplete: true, incompleteVisits: 0, missingCostItems: 0 },
  comparison: { billedRevenue: 0, cashCollected: 0, cohortCollected: 0, olderDebtCollected: 0, collectionRate: null, cogs: 0, grossProfit: 0, grossMarginPct: null, cohortOutstanding: 0, totalOutstanding: 0, averageBill: null, completedVisits: 0, attributionComplete: true, costComplete: true, incompleteVisits: 0, missingCostItems: 0 },
  reconciliation: { billedCohort: 100, cashCollected: 100, cohortCollected: 100, olderDebtCollected: 0, discounts: 0, taxes: 0, refunds: 0, adjustments: 0, corrections: 0, cohortOutstanding: 0, selfPayOutstanding: 0, panelOutstanding: 0, totalOutstanding: 0, attributionComplete: true, incompleteVisits: 0 },
  alerts: [], generated_at: '2026-08-17T02:00:00.000Z',
};

const completeCells = Array.from({ length: 112 }, (_, index) => ({
  weekday: (Math.floor(index / 16) + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7,
  hour: 8 + (index % 16), totalVisits: 1, averageWaitMinutes: 10, waitMeasuredVisits: 1, coverage: 'complete',
}));
const result = (data: unknown, overrides: Record<string, unknown> = {}) => ({ data, isLoading: false, isError: false, error: null, dataUpdatedAt: Date.parse('2026-08-17T02:00:00.000Z'), refetch: vi.fn(), ...overrides });

function confidence(label: string): HTMLElement {
  const summary = screen.getAllByText(label).find((node) => node.closest('details'));
  return summary?.closest('details') as HTMLElement;
}

describe('Command Centre cached source failures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hooks.clinic.mockReturnValue(result({ metrics, alerts: [] }));
    hooks.financial.mockReturnValue(result(financial));
    hooks.attendance.mockReturnValue(result({ cells: completeCells, hasAttendanceData: true }));
  });

  it('marks cached clinic health as partial/insufficient and retries it after refetch failure', () => {
    const retryClinic = vi.fn();
    hooks.clinic.mockReturnValue(result({ metrics, alerts: [] }, { isError: true, error: new Error('clinic refresh failed'), refetch: retryClinic }));

    render(<MemoryRouter><ClinicHealthTab startDate={new Date('2026-08-01')} endDate={new Date('2026-08-17')} /></MemoryRouter>);

    expect(screen.getByRole('status')).toHaveTextContent(/could not be loaded/i);
    expect(within(confidence('Patient flow')).getByText('Insufficient')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /retry command centre sources/i }));
    expect(retryClinic).toHaveBeenCalledTimes(1);
  });

  it('marks cached financial control as partial/insufficient and retries it after refetch failure', () => {
    const retryFinancial = vi.fn();
    hooks.financial.mockReturnValue(result(financial, { isError: true, error: new Error('financial refresh failed'), refetch: retryFinancial }));

    render(<MemoryRouter><ClinicHealthTab startDate={new Date('2026-08-01')} endDate={new Date('2026-08-17')} /></MemoryRouter>);

    expect(screen.getByRole('status')).toHaveTextContent(/could not be loaded/i);
    expect(within(confidence('Financial control')).getByText('Insufficient')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /retry command centre sources/i }));
    expect(retryFinancial).toHaveBeenCalledTimes(1);
  });
});
