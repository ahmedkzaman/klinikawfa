import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { CommandCentreTab } from '@/components/clinic/insight/command/CommandCentreTab';
import {
  buildAttendanceSummary,
  buildCommandActions,
} from '@/lib/clinic/insight/commandCentre';
import type { FinancialControlSummary } from '@/lib/clinic/financialControl';
import type { ClinicHealthMetrics } from '@/lib/clinic/insight/healthScore';

const healthMetrics: ClinicHealthMetrics = {
  financial: { revenue: 0, profit: 0, marginPct: 0 },
  visits: { registered: 12, completed: 8, cancelled: 1, noShow: 1 },
  claims: { outstandingAmount: 450, unsubmittedCount: 0, overdueCount: 2 },
  panelFees: { activePanels: 4, missingDefaultCount: 0, mismatchedVisitCount: 0 },
  inventory: { outOfStockCount: 1, belowReorderCount: 0, expiring60DaysCount: 0 },
  dataQuality: { completedWithoutPayment: 1, panelVisitWithoutPanel: 0, consultationWithoutFee: 0 },
};

const financialSummary: FinancialControlSummary = {
  period: {
    billedRevenue: 1250,
    cashCollected: 900,
    cohortCollected: 800,
    olderDebtCollected: 100,
    collectionRate: 64,
    cogs: 400,
    grossProfit: 850,
    grossMarginPct: 68,
    cohortOutstanding: 450,
    totalOutstanding: 500,
    averageBill: 156.25,
    completedVisits: 8,
    attributionComplete: false,
    costComplete: true,
    incompleteVisits: 1,
    missingCostItems: 0,
  },
  comparison: {
    billedRevenue: 1000,
    cashCollected: 700,
    cohortCollected: 650,
    olderDebtCollected: 50,
    collectionRate: 65,
    cogs: 300,
    grossProfit: 700,
    grossMarginPct: 70,
    cohortOutstanding: 350,
    totalOutstanding: 400,
    averageBill: 142.86,
    completedVisits: 7,
    attributionComplete: true,
    costComplete: true,
    incompleteVisits: 0,
    missingCostItems: 0,
  },
  reconciliation: {
    billedCohort: 1250,
    cashCollected: 900,
    cohortCollected: 800,
    olderDebtCollected: 100,
    discounts: 0,
    taxes: 0,
    refunds: 0,
    adjustments: 0,
    corrections: 0,
    cohortOutstanding: 450,
    selfPayOutstanding: 50,
    panelOutstanding: 400,
    totalOutstanding: 450,
    attributionComplete: false,
    incompleteVisits: 1,
  },
  alerts: [
    { key: 'unpaid_self_pay', severity: 'high', count: 0, amount: 0, oldestAgeDays: 0, attributionComplete: true, incompleteRows: 0 },
    { key: 'overdue_panel', severity: 'critical', count: 2, amount: 400, oldestAgeDays: 9, attributionComplete: false, incompleteRows: 1 },
  ],
  generated_at: '2026-08-16T08:00:00.000Z',
};

describe('buildCommandActions', () => {
  it('hides zero-count actions and keeps the panel financial-detail deep link', () => {
    const actions = buildCommandActions({ unpaidSelfPay: 0, overduePanel: 4 });

    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      group: 'Panels',
      count: 4,
      title: expect.stringMatching(/panel/i),
      href: expect.stringMatching(/section=finance.*alert=overdue_panel/),
    });
  });

  it('keeps incomplete attribution in confidence instead of creating another action', () => {
    const actions = buildCommandActions({ financialAlerts: financialSummary.alerts });

    expect(actions.map((action) => action.key)).toEqual(['overdue_panel']);
    expect(actions[0].confidence.level).toBe('partial');
  });

  it('marks cached clinic actions insufficient when the clinic source refresh failed', () => {
    const actions = buildCommandActions({
      clinicSourceFailed: true,
      clinicAlerts: [{
        id: 'out-of-stock',
        severity: 'critical',
        title: 'Items out of stock',
        detail: '1 item is out of stock.',
        count: 1,
        href: '/clinic/inventory',
      }],
    });

    expect(actions).toHaveLength(1);
    expect(actions[0].confidence).toMatchObject({
      level: 'insufficient',
      source: 'clinic-health',
      reason: expect.stringMatching(/clinic-health.*failed/i),
    });
  });
});

describe('buildAttendanceSummary', () => {
  it('returns exactly the four operational periods rather than a second heatmap', () => {
    const periods = buildAttendanceSummary([
      { weekday: 1, hour: 8, totalVisits: 4, averageWaitMinutes: 15, waitMeasuredVisits: 4 },
      { weekday: 1, hour: 13, totalVisits: 3, averageWaitMinutes: 20, waitMeasuredVisits: 3 },
      { weekday: 1, hour: 17, totalVisits: 2, averageWaitMinutes: 30, waitMeasuredVisits: 2 },
      { weekday: 1, hour: 21, totalVisits: 1, averageWaitMinutes: null, waitMeasuredVisits: 0 },
    ]);

    expect(periods.map((period) => period.label)).toEqual([
      '08:00–12:00', '12:00–16:00', '16:00–20:00', '20:00–00:00',
    ]);
    expect(periods.map((period) => period.visits)).toEqual([4, 3, 2, 1]);
  });
});

describe('CommandCentreTab', () => {
  it('renders only the six decision KPIs, patient flow, four periods, and accessible actions', () => {
    render(
      <MemoryRouter>
        <CommandCentreTab
          healthMetrics={healthMetrics}
          healthAlerts={[{
            id: 'missing-payment',
            severity: 'warning',
            title: 'Completed visits without payment',
            detail: '1 completed visit has no payment record.',
            count: 1,
            href: '/clinic/queue?focus=missing-payment&date=2026-08-16',
          }]}
          financialSummary={financialSummary}
          attendancePeriods={buildAttendanceSummary([])}
          averageWaitingMinutes={18}
          attendanceConfidence={{
            level: 'reliable',
            reason: 'All expected attendance rows were observed.',
            source: 'clinical-attendance-heatmap',
            dateBasis: 'Queue arrival hour in Asia/Kuala_Lumpur',
            lastRefreshedAt: '2026-08-16T08:00:00.000Z',
            missingCount: 0,
            missingBreakdown: { unobservedRows: 0, attributionRows: 0, incompleteCostRows: 0 },
          }}
        />
      </MemoryRouter>,
    );

    const kpis = screen.getByRole('region', { name: /command centre kpis/i });
    expect(within(kpis).getAllByRole('article')).toHaveLength(6);
    for (const label of ['Total patients', 'Average waiting', 'Visit billing', 'Patient collections', 'Panel receivable', 'Critical actions']) {
      expect(within(kpis).getByText(label)).toBeInTheDocument();
    }
    expect(screen.queryByText(/health score/i)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /patient flow/i })).toBeInTheDocument();
    expect(screen.getAllByTestId('attendance-period')).toHaveLength(4);
    expect(screen.getByRole('link', { name: /view planning analysis/i })).toHaveAttribute('href', '/clinic/insight?section=planning');

    const queueAction = screen.getByRole('link', { name: /completed visits without payment/i });
    expect(queueAction).toHaveAttribute('href', '/clinic/queue?focus=missing-payment&date=2026-08-16');
    expect(queueAction).toHaveAttribute('tabindex', '0');
    expect(screen.getAllByText('Partial')).not.toHaveLength(0);
    expect(screen.getAllByText(/1 row.*attribution/i)).not.toHaveLength(0);
    const patientFlowConfidence = screen.getAllByText('Patient flow').find((element) => element.closest('details'))?.closest('details');
    expect(patientFlowConfidence).toBeTruthy();
    expect(within(patientFlowConfidence as HTMLElement).getByText('Partial')).toBeInTheDocument();
  });
});
