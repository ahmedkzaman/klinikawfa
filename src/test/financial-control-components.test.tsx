import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FinancialControlTab } from '@/components/clinic/insight/management/FinancialControlTab';
import { FinancialSummaryStrip } from '@/components/clinic/insight/management/FinancialSummaryStrip';
import { ManagementTab } from '@/components/clinic/insight/management/ManagementTab';
import type {
  FinancialControlMetric,
  FinancialControlPeriodSummary,
  FinancialControlSummary,
} from '@/lib/clinic/financialControl';

const useFinancialControlSummaryMock = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/clinic/useFinancialControl', () => ({
  useFinancialControlSummary: useFinancialControlSummaryMock,
}));

const period: FinancialControlPeriodSummary = {
  billedRevenue: 1250,
  cashCollected: 900,
  cohortCollected: 800,
  olderDebtCollected: 100,
  collectionRate: 64,
  cogs: 300,
  grossProfit: 950,
  grossMarginPct: 76,
  cohortOutstanding: 450,
  totalOutstanding: 700,
  averageBill: 250,
  completedVisits: 5,
  attributionComplete: true,
  costComplete: true,
  incompleteVisits: 0,
  missingCostItems: 0,
};

const comparison: FinancialControlPeriodSummary = {
  ...period,
  billedRevenue: 1000,
  cashCollected: 1000,
  cohortOutstanding: 450,
  totalOutstanding: 700,
  cogs: 250,
  grossProfit: 750,
  grossMarginPct: 75,
  averageBill: 200,
};

const summary: FinancialControlSummary = {
  period,
  comparison,
  reconciliation: {
    billedCohort: 1250,
    cashCollected: 900,
    cohortCollected: 800,
    olderDebtCollected: 100,
    discounts: 80,
    taxes: 30,
    refunds: 20,
    adjustments: -70,
    corrections: 2,
    cohortOutstanding: 450,
    selfPayOutstanding: 300,
    panelOutstanding: 400,
    totalOutstanding: 700,
    attributionComplete: true,
    incompleteVisits: 0,
  },
  alerts: [],
  generated_at: '2026-08-07T04:15:00Z',
};

const dates = {
  startDate: new Date(2026, 7, 1, 12),
  endDate: new Date(2026, 7, 7, 12),
};

function summaryResult(overrides: Record<string, unknown> = {}) {
  return {
    data: summary,
    isLoading: false,
    isError: false,
    error: null,
    ...overrides,
  };
}

describe('Financial Control Management shell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFinancialControlSummaryMock.mockReturnValue(summaryResult());
  });

  it('renders only Financial Control in the Management release', () => {
    render(<ManagementTab {...dates} />);

    expect(screen.getByRole('heading', { name: 'Financial Control' })).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
  });

  it('keeps loading, empty, and error states local to the financial summary section', () => {
    const { rerender } = render(<FinancialControlTab {...dates} />);

    useFinancialControlSummaryMock.mockReturnValue(summaryResult({
      data: undefined,
      isLoading: true,
    }));
    rerender(<FinancialControlTab {...dates} />);
    expect(screen.getByText('Loading financial control summary')).toBeInTheDocument();

    useFinancialControlSummaryMock.mockReturnValue(summaryResult({
      data: {
        ...summary,
        period: {
          ...period,
          billedRevenue: 0,
          cashCollected: 0,
          cohortOutstanding: 0,
          totalOutstanding: 0,
          cogs: 0,
          grossProfit: 0,
          completedVisits: 0,
        },
      },
    }));
    rerender(<FinancialControlTab {...dates} />);
    expect(screen.getByText('No financial activity in this period')).toBeInTheDocument();

    useFinancialControlSummaryMock.mockReturnValue(summaryResult({
      data: undefined,
      isError: true,
      error: new Error('Summary unavailable'),
    }));
    rerender(<FinancialControlTab {...dates} />);
    expect(screen.getByText('Financial control summary unavailable')).toBeInTheDocument();
    expect(screen.getByText('Summary unavailable')).toBeInTheDocument();
  });
});

describe('FinancialSummaryStrip', () => {
  it('keeps billed revenue and cash collected distinct with equal-period comparisons', () => {
    render(
      <FinancialSummaryStrip
        period={period}
        comparison={comparison}
        comparisonLabel="25-31 Jul"
        selectedMetric="billed_revenue"
        onMetricSelect={vi.fn()}
      />,
    );

    const billed = screen.getByRole('button', { name: /Billed Revenue details/i });
    const cash = screen.getByRole('button', { name: /Cash Collected details/i });

    expect(within(billed).getByText('RM 1,250.00')).toBeInTheDocument();
    expect(within(billed).getByText('Bills completed in this period')).toBeInTheDocument();
    expect(within(billed).getByText('up 25.0% vs 25-31 Jul')).toBeInTheDocument();
    expect(within(cash).getByText('RM 900.00')).toBeInTheDocument();
    expect(within(cash).getByText('Payments received in this period')).toBeInTheDocument();
    expect(within(cash).getByText('down 10.0% vs 25-31 Jul')).toBeInTheDocument();
  });

  it('warns when the preceding comparison period is incomplete', () => {
    render(
      <FinancialSummaryStrip
        period={period}
        comparison={{
          ...comparison,
          attributionComplete: false,
          costComplete: false,
          incompleteVisits: 2,
          missingCostItems: 0,
        }}
        comparisonLabel="25-31 Jul"
        comparisonAttributionComplete={false}
        comparisonCostComplete={false}
        comparisonIncompleteVisits={2}
        comparisonMissingCostItems={0}
        selectedMetric="billed_revenue"
        onMetricSelect={vi.fn()}
      />,
    );

    expect(screen.getByText('Comparison period: 25-31 Jul')).toBeInTheDocument();
    expect(screen.getByText(/Comparison incomplete: attribution for 2 visits/)).toBeInTheDocument();
    expect(screen.getByText(/cost completeness unknown because attribution is incomplete/)).toBeInTheDocument();
    expect(within(screen.getByRole('button', { name: /Billed Revenue details/i })).getByText('up 25.0% vs 25-31 Jul')).toBeInTheDocument();
  });

  it('emits the exact metric for every selectable KPI', () => {
    const onMetricSelect = vi.fn();
    const expected: Array<[string, FinancialControlMetric]> = [
      ['Billed Revenue', 'billed_revenue'],
      ['Cash Collected', 'cash_collected'],
      ['Cohort Outstanding', 'cohort_outstanding'],
      ['Total Outstanding', 'total_outstanding'],
      ['COGS', 'cogs'],
      ['Gross Profit', 'gross_profit'],
      ['Gross Margin', 'margin'],
    ];

    render(
      <FinancialSummaryStrip
        period={period}
        comparison={comparison}
        comparisonLabel="25-31 Jul"
        selectedMetric="billed_revenue"
        onMetricSelect={onMetricSelect}
      />,
    );

    for (const [label, metric] of expected) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`${label} details`, 'i') }));
      expect(onMetricSelect).toHaveBeenLastCalledWith(metric);
    }
    expect(screen.getByText('Average Bill').closest('button')).toBeNull();
  });

  it('handles null and zero comparisons without inventing values or Infinity', () => {
    render(
      <FinancialSummaryStrip
        period={{ ...period, billedRevenue: null, cashCollected: 25, cogs: 0 }}
        comparison={{ ...comparison, billedRevenue: 100, cashCollected: 0, cogs: 0 }}
        comparisonLabel="25-31 Jul"
        selectedMetric="billed_revenue"
        onMetricSelect={vi.fn()}
      />,
    );

    const billed = screen.getByRole('button', { name: /Billed Revenue details/i });
    const cash = screen.getByRole('button', { name: /Cash Collected details/i });
    const cogs = screen.getByRole('button', { name: /COGS details/i });

    expect(within(billed).getByText('Unavailable')).toBeInTheDocument();
    expect(within(billed).getByText('Comparison unavailable')).toBeInTheDocument();
    expect(within(cash).getByText('up from RM 0.00 vs 25-31 Jul')).toBeInTheDocument();
    expect(within(cogs).getByText('no change vs 25-31 Jul')).toBeInTheDocument();
    expect(screen.queryByText(/Infinity/)).not.toBeInTheDocument();
  });

  it('keeps negative-baseline comparison direction and absolute-denominator math', () => {
    render(
      <FinancialSummaryStrip
        period={{ ...period, billedRevenue: -50 }}
        comparison={{ ...comparison, billedRevenue: -100 }}
        comparisonLabel="25-31 Jul"
        selectedMetric="billed_revenue"
        onMetricSelect={vi.fn()}
      />,
    );

    expect(screen.getByText('up 50.0% vs 25-31 Jul')).toBeInTheDocument();
  });
});

describe('FinancialControlTab summary and reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFinancialControlSummaryMock.mockReturnValue(summaryResult());
  });

  it('shows accounting relationships and the server-generated timestamp', () => {
    render(<FinancialControlTab {...dates} />);

    expect(screen.getByText('Last updated 7 Aug 2026, 12:15')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Billed cohort' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Period cash' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Outstanding' })).toBeInTheDocument();
    expect(screen.getAllByText('Cohort collected')).toHaveLength(2);
    expect(screen.getByText('Older debt collected')).toBeInTheDocument();
    expect(screen.getByText('Net adjustments')).toBeInTheDocument();
    expect(screen.getByText(/2 corrections/)).toBeInTheDocument();
    expect(screen.getByText('Self-pay outstanding')).toBeInTheDocument();
    expect(screen.getByText('Panel outstanding')).toBeInTheDocument();
  });

  it('labels comparison periods across month and year boundaries', () => {
    const { rerender } = render(
      <FinancialControlTab
        startDate={new Date(2026, 2, 1, 12)}
        endDate={new Date(2026, 2, 7, 12)}
      />,
    );

    expect(screen.getByText('Comparison period: 22-28 Feb')).toBeInTheDocument();

    rerender(
      <FinancialControlTab
        startDate={new Date(2026, 0, 1, 12)}
        endDate={new Date(2026, 0, 7, 12)}
      />,
    );

    expect(screen.getByText('Comparison period: 25-31 Dec 2025')).toBeInTheDocument();
  });

  it('shows incomplete attribution and cost status while preserving null accounting values', () => {
    useFinancialControlSummaryMock.mockReturnValue(summaryResult({
      data: {
        ...summary,
        period: {
          ...period,
          billedRevenue: null,
          cogs: null,
          grossProfit: null,
          attributionComplete: false,
          costComplete: false,
          incompleteVisits: 3,
          missingCostItems: 4,
        },
        reconciliation: {
          ...summary.reconciliation,
          billedCohort: null,
          cohortCollected: null,
          cohortOutstanding: null,
          attributionComplete: false,
          incompleteVisits: 3,
        },
      },
    }));

    const { rerender } = render(<FinancialControlTab {...dates} />);

    expect(screen.getByText('Attribution incomplete for 3 visits')).toBeInTheDocument();
    expect(screen.getByText('Cost data incomplete for 4 items')).toBeInTheDocument();
    expect(screen.getAllByText('Unavailable').length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText('RM 0.00', { selector: '[data-null-accounting="true"]' })).not.toBeInTheDocument();

    useFinancialControlSummaryMock.mockReturnValue(summaryResult({
      data: {
        ...summary,
        period: {
          ...period,
          attributionComplete: false,
          costComplete: false,
          incompleteVisits: 3,
          missingCostItems: 0,
        },
      },
    }));
    rerender(<FinancialControlTab {...dates} />);

    expect(screen.getByText('Cost completeness unknown because attribution is incomplete')).toBeInTheDocument();
    expect(screen.queryByText('Cost data incomplete for 0 items')).not.toBeInTheDocument();
  });
});
