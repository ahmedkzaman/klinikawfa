import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Insight from '@/pages/clinic/Insight';

const {
  useFinancialControlSummaryMock,
  useFinancialInsightsMock,
  useSalesInsightsMock,
} = vi.hoisted(() => ({
  useFinancialControlSummaryMock: vi.fn(),
  useFinancialInsightsMock: vi.fn(),
  useSalesInsightsMock: vi.fn(),
}));

vi.mock('@/hooks/clinic/useFinancialControl', () => ({
  useFinancialControlSummary: useFinancialControlSummaryMock,
}));

vi.mock('@/hooks/clinic/useFinancialInsights', () => ({
  useFinancialInsights: useFinancialInsightsMock,
}));

vi.mock('@/hooks/clinic/useSalesInsights', () => ({
  useSalesInsights: useSalesInsightsMock,
}));

vi.mock('@/components/clinic/insight/ClinicHealthTab', () => ({
  ClinicHealthTab: () => <div>Clinic health content</div>,
}));
vi.mock('@/components/clinic/insight/ScoreboardsTab', () => ({
  ScoreboardsTab: () => <div>Scoreboards content</div>,
}));
vi.mock('@/components/clinic/insight/LeaderboardsTab', () => ({
  LeaderboardsTab: () => <div>Leaderboards content</div>,
}));
vi.mock('@/components/clinic/insight/ValuationTab', () => ({
  ValuationTab: () => <div>Valuation content</div>,
}));
vi.mock('@/components/clinic/insight/BankHealthTab', () => ({
  BankHealthTab: () => <div>Bank health content</div>,
}));

const emptySummary = {
  period: {
    billedRevenue: 0,
    cashCollected: 0,
    cohortCollected: 0,
    olderDebtCollected: 0,
    collectionRate: 0,
    cogs: 0,
    grossProfit: 0,
    grossMarginPct: 0,
    cohortOutstanding: 0,
    totalOutstanding: 0,
    averageBill: 0,
    completedVisits: 0,
    attributionComplete: true,
    costComplete: true,
    incompleteVisits: 0,
    missingCostItems: 0,
  },
  comparison: {
    billedRevenue: 0,
    cashCollected: 0,
    cohortCollected: 0,
    olderDebtCollected: 0,
    collectionRate: 0,
    cogs: 0,
    grossProfit: 0,
    grossMarginPct: 0,
    cohortOutstanding: 0,
    totalOutstanding: 0,
    averageBill: 0,
    completedVisits: 0,
    attributionComplete: true,
    costComplete: true,
    incompleteVisits: 0,
    missingCostItems: 0,
  },
  reconciliation: {
    billedCohort: 0,
    cashCollected: 0,
    cohortCollected: 0,
    olderDebtCollected: 0,
    discounts: 0,
    taxes: 0,
    refunds: 0,
    adjustments: 0,
    corrections: 0,
    cohortOutstanding: 0,
    selfPayOutstanding: 0,
    panelOutstanding: 0,
    totalOutstanding: 0,
    attributionComplete: true,
    incompleteVisits: 0,
  },
  alerts: [],
  generated_at: '2026-08-03T04:00:00Z',
};

function clickManagementTab() {
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Management' }), {
    button: 0,
    ctrlKey: false,
  });
}

describe('Insight Management integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 3, 12));
    useFinancialInsightsMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
    });
    useSalesInsightsMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
    });
    useFinancialControlSummaryMock.mockReturnValue({
      data: emptySummary,
      isLoading: false,
      isError: false,
      error: null,
    });
  });

  it('keeps every existing Insight tab and adds Management at the same level', () => {
    render(<Insight />);

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Clinic Health',
      'Overview',
      'Scoreboards',
      'Leaderboards',
      'Valuation',
      'Bank Health',
      'Management',
    ]);
  });

  it('passes the exact selected dates and renders no later-phase Management tabs', () => {
    render(<Insight />);

    fireEvent.click(screen.getByRole('button', { name: 'This month' }));
    clickManagementTab();

    expect(useFinancialControlSummaryMock).toHaveBeenLastCalledWith({
      from: new Date(2026, 7, 1),
      to: new Date(2026, 7, 3, 12),
    });
    expect(screen.getByRole('heading', { name: 'Financial Control' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /alerts/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /margin/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /export/i })).not.toBeInTheDocument();
  });

  it('keeps the Insight shell and its tabs visible when the Management summary fails', () => {
    useFinancialControlSummaryMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Summary unavailable'),
    });

    render(<Insight />);
    clickManagementTab();

    expect(screen.getByRole('heading', { name: 'Financial Insights' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Management' })).toBeInTheDocument();
    expect(screen.getByText('Financial control summary unavailable')).toBeInTheDocument();
    expect(screen.getByText('Summary unavailable')).toBeInTheDocument();
  });
});
