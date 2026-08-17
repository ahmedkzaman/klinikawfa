import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Insight from '@/pages/clinic/Insight';
import type { FinancialControlSummary } from '@/lib/clinic/financialControl';
import type { ClinicHealthMetrics } from '@/lib/clinic/insight/healthScore';

const hooks = vi.hoisted(() => ({
  clinic: vi.fn(),
  financialSummary: vi.fn(),
  financialDetails: vi.fn(),
  attendance: vi.fn(),
}));

vi.mock('@/hooks/clinic/useClinicHealth', () => ({ useClinicHealth: hooks.clinic }));
vi.mock('@/hooks/clinic/useFinancialControl', () => ({
  useFinancialControlSummary: hooks.financialSummary,
  useFinancialControlDetails: hooks.financialDetails,
}));
vi.mock('@/hooks/clinic/useAttendanceHeatmap', () => ({ useAttendanceHeatmap: hooks.attendance }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock('@/components/clinic/insight/BankHealthTab', () => ({ BankHealthTab: () => null }));
vi.mock('@/components/clinic/insight/planning/PlanningTab', () => ({ PlanningTab: () => <div>Planning content</div> }));

const metrics: ClinicHealthMetrics = {
  financial: { revenue: 0, profit: 0, marginPct: 0 },
  visits: { registered: 4, completed: 4, cancelled: 0, noShow: 0 },
  claims: { outstandingAmount: 200, unsubmittedCount: 0, overdueCount: 1 },
  panelFees: { activePanels: 1, missingDefaultCount: 0, mismatchedVisitCount: 0 },
  inventory: { outOfStockCount: 0, belowReorderCount: 0, expiring60DaysCount: 0 },
  dataQuality: { completedWithoutPayment: 0, panelVisitWithoutPanel: 0, consultationWithoutFee: 0 },
};

const financial: FinancialControlSummary = {
  period: { billedRevenue: 400, cashCollected: 200, cohortCollected: 200, olderDebtCollected: 0, collectionRate: 50, cogs: 100, grossProfit: 300, grossMarginPct: 75, cohortOutstanding: 200, totalOutstanding: 200, averageBill: 100, completedVisits: 4, attributionComplete: true, costComplete: true, incompleteVisits: 0, missingCostItems: 0 },
  comparison: { billedRevenue: 0, cashCollected: 0, cohortCollected: 0, olderDebtCollected: 0, collectionRate: null, cogs: 0, grossProfit: 0, grossMarginPct: null, cohortOutstanding: 0, totalOutstanding: 0, averageBill: null, completedVisits: 0, attributionComplete: true, costComplete: true, incompleteVisits: 0, missingCostItems: 0 },
  reconciliation: { billedCohort: 400, cashCollected: 200, cohortCollected: 200, olderDebtCollected: 0, discounts: 0, taxes: 0, refunds: 0, adjustments: 0, corrections: 0, cohortOutstanding: 200, selfPayOutstanding: 0, panelOutstanding: 200, totalOutstanding: 200, attributionComplete: true, incompleteVisits: 0 },
  alerts: [{ key: 'overdue_panel', severity: 'critical', count: 1, amount: 200, oldestAgeDays: 7, attributionComplete: true, incompleteRows: 0 }],
  generated_at: '2026-08-17T02:00:00.000Z',
};

const success = (data: unknown) => ({ data, isLoading: false, isError: false, error: null, dataUpdatedAt: Date.parse('2026-08-17T02:00:00.000Z'), refetch: vi.fn() });

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="Router location">{location.pathname}{location.search}</output>;
}

function renderCommand() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={['/clinic/insight?section=command']}>
      <QueryClientProvider client={client}>
        <LocationProbe />
        <Insight initialSearch="?section=command" />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('Command Centre router integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hooks.clinic.mockReturnValue(success({ metrics, alerts: [{ id: 'overdue-claims', severity: 'critical', title: 'Overdue panel claims', detail: '1 claim needs follow-up.', count: 1, href: '/clinic/panel-claims' }] }));
    hooks.financialSummary.mockReturnValue(success(financial));
    hooks.attendance.mockReturnValue(success({ cells: [], hasAttendanceData: false }));
    hooks.financialDetails.mockReturnValue(success({ rows: [], total: 0, page: 1, pageSize: 25, totals: { billed: 0, paid: 0, outstanding: 0, cogs: 0, profit: 0, attributionComplete: true, costComplete: true, incompleteRows: 0 } }));
  });

  it('selects Planning immediately when its Command link is clicked', async () => {
    renderCommand();

    fireEvent.click(screen.getByRole('link', { name: /view planning analysis/i }));

    await waitFor(() => expect(screen.getByRole('tab', { name: 'Planning' })).toHaveAttribute('aria-selected', 'true'));
    expect(screen.getByLabelText('Router location')).toHaveTextContent('/clinic/insight?section=planning');
    expect(screen.getByText('Planning content')).toBeInTheDocument();
  });

  it('selects Finance and opens the requested alert detail drawer', async () => {
    renderCommand();

    fireEvent.click(screen.getByRole('link', { name: /overdue panel claims/i }));

    await waitFor(() => expect(screen.getByRole('tab', { name: 'Finance' })).toHaveAttribute('aria-selected', 'true'));
    expect(screen.getByLabelText('Router location')).toHaveTextContent('section=finance&metric=alerts&alert=overdue_panel');
    expect(await screen.findByRole('dialog', { name: 'Overdue panel claim details' })).toBeInTheDocument();
  });
});
