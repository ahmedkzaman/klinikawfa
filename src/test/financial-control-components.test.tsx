import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InsightShell } from '@/components/clinic/insight/InsightShell';
import { FinancialControlTab } from '@/components/clinic/insight/management/FinancialControlTab';
import { FinancialSummaryStrip } from '@/components/clinic/insight/management/FinancialSummaryStrip';
import { ManagementTab } from '@/components/clinic/insight/management/ManagementTab';
import type {
  FinancialControlAlert,
  FinancialControlDetailFilters,
  FinancialControlDetailResponse,
  FinancialControlDetailRow,
  FinancialControlMetric,
  FinancialControlPeriodSummary,
  FinancialControlSummary,
} from '@/lib/clinic/financialControl';

const useFinancialControlSummaryMock = vi.hoisted(() => vi.fn());
const useFinancialControlDetailsMock = vi.hoisted(() => vi.fn());
const financialControlRpcMock = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/clinic/useFinancialControl', () => ({
  useFinancialControlSummary: useFinancialControlSummaryMock,
  useFinancialControlDetails: useFinancialControlDetailsMock,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: financialControlRpcMock },
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

const alerts: FinancialControlAlert[] = [
  { key: 'zero_price', severity: 'medium', count: 2, amount: 200, oldestAgeDays: 4, attributionComplete: true, incompleteRows: 0 },
  { key: 'refund_void_correction', severity: 'low', count: 1, amount: 75, oldestAgeDays: 2, attributionComplete: true, incompleteRows: 0 },
  { key: 'payment_mismatch', severity: 'critical', count: 3, amount: 600, oldestAgeDays: 6, attributionComplete: true, incompleteRows: 0 },
  { key: 'unsubmitted_panel', severity: 'medium', count: 5, amount: 700, oldestAgeDays: 8, attributionComplete: true, incompleteRows: 0 },
  { key: 'missing_cost', severity: 'high', count: 4, amount: 0, oldestAgeDays: 1, attributionComplete: false, incompleteRows: 1 },
  { key: 'negative_margin', severity: 'critical', count: 2, amount: 900, oldestAgeDays: 3, attributionComplete: true, incompleteRows: 0 },
  { key: 'large_discount', severity: 'medium', count: 2, amount: 200, oldestAgeDays: 4, attributionComplete: true, incompleteRows: 0 },
  { key: 'unpaid_self_pay', severity: 'high', count: 6, amount: 500, oldestAgeDays: 10, attributionComplete: true, incompleteRows: 0 },
  { key: 'duplicate_or_excess_payment', severity: 'critical', count: 1, amount: 900, oldestAgeDays: 10, attributionComplete: true, incompleteRows: 0 },
  { key: 'overdue_panel', severity: 'high', count: 3, amount: 500, oldestAgeDays: 20, attributionComplete: true, incompleteRows: 0 },
];

const detailRow = {
  queueEntryId: 'queue-1',
  consultationId: 'consultation-1',
  completedDate: '2026-08-06',
  patientName: 'Aisyah Rahman',
  doctorName: 'Dr Lim',
  paymentType: 'panel',
  paymentMethod: 'bank_transfer',
  panelProviderName: 'Acme Health',
  claimStatus: 'submitted',
  claimCreatedDate: '2026-08-06',
  claimDueDate: '2026-09-05',
  groupKey: 'group-1',
  groupLabel: 'Amoxicillin 500 mg with a deliberately long dispensing label',
  billed: 250,
  paid: 100,
  paidInPeriod: 100,
  outstanding: 150,
  cogs: 80,
  profit: 170,
  marginPct: 68,
  discount: 10,
  tax: 0,
  refund: 0,
  corrections: 0,
  missingCostCount: 0,
  zeroPriceCount: 0,
  amount: 250,
  alertKeys: ['unpaid_self_pay'],
  attributionComplete: true,
  costComplete: true,
  visitCount: 1,
  clinicalNotes: 'Private clinical note must never render',
  diagnosis: 'Private diagnosis must never render',
  attachments: ['private-document.pdf'],
} satisfies FinancialControlDetailRow & Record<'clinicalNotes' | 'diagnosis' | 'attachments', unknown>;

function detailResult(
  overrides: Partial<FinancialControlDetailResponse> = {},
  queryOverrides: Record<string, unknown> = {},
) {
  return {
    data: {
      rows: [detailRow],
      total: 51,
      page: 1,
      pageSize: 25,
      totals: {
        billed: 250,
        paid: 100,
        outstanding: 150,
        cogs: 80,
        profit: 170,
        attributionComplete: true,
        costComplete: true,
        incompleteRows: 0,
      },
      ...overrides,
    },
    isLoading: false,
    isError: false,
    error: null,
    ...queryOverrides,
  };
}

function latestDetailFilters(): FinancialControlDetailFilters {
  return useFinancialControlDetailsMock.mock.calls.at(-1)?.[0] as FinancialControlDetailFilters;
}

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

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
    financialControlRpcMock.mockReset();
    useFinancialControlSummaryMock.mockReturnValue(summaryResult());
    useFinancialControlDetailsMock.mockImplementation((filters: FinancialControlDetailFilters) => detailResult({
      page: filters.page,
      pageSize: filters.pageSize,
    }));
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
    expect(screen.getByText('Financial summary is temporarily unavailable. Please retry.')).toBeInTheDocument();
    expect(screen.queryByText('Summary unavailable')).not.toBeInTheDocument();
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
    expect(within(screen.getByRole('button', { name: /Billed Revenue details/i }))
      .getByText('Comparison unavailable — incomplete attribution')).toBeInTheDocument();
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
      const trigger = screen.getByRole('button', { name: new RegExp(`${label} details`, 'i') });
      fireEvent.click(trigger);
      expect(onMetricSelect).toHaveBeenLastCalledWith(metric, trigger);
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
    expect(within(billed).getByText('Comparison unavailable — missing period data')).toBeInTheDocument();
    expect(within(cash).getByText('Comparison unavailable — prior period is zero')).toBeInTheDocument();
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
    financialControlRpcMock.mockReset();
    useFinancialControlSummaryMock.mockReturnValue(summaryResult());
    useFinancialControlDetailsMock.mockImplementation((filters: FinancialControlDetailFilters) => detailResult({
      page: filters.page,
      pageSize: filters.pageSize,
    }));
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
    expect(screen.queryByText(/Historical data note:/)).not.toBeInTheDocument();
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
    expect(screen.getByText('Historical data note:').parentElement).toHaveTextContent(
      'Historical data note: Financial Control was introduced after these visits were completed. Older completion and payment dates were inferred from existing queue and transaction timestamps. Figures are usable for management insights but may not match the exact original completion time.',
    );
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

describe('FinancialControlTab alerts and drill-down', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    financialControlRpcMock.mockReset();
    useFinancialControlSummaryMock.mockReturnValue(summaryResult({
      data: { ...summary, alerts },
    }));
    useFinancialControlDetailsMock.mockImplementation((filters: FinancialControlDetailFilters) => detailResult({
      page: filters.page,
      pageSize: filters.pageSize,
    }));
  });

  it('renders all ten alerts in deterministic urgency order', () => {
    render(<FinancialControlTab {...dates} />);

    const table = screen.getByRole('table', { name: 'Financial alerts' });
    const alertRows = within(table).getAllByRole('row').slice(1);
    const labels = alertRows.map((row) => within(row).getAllByRole('cell')[0].textContent);

    expect(labels).toEqual([
      'Possible duplicate or under-recorded bill',
      'Negative margin',
      'Payment mismatch',
      'Overdue panel claim',
      'Unpaid self-pay bill',
      'Missing cost',
      'Unsubmitted panel claim',
      'Large discount',
      'Zero price',
      'Refund, void, or correction',
    ]);
    expect(within(table).getAllByRole('button', { name: /^View / })).toHaveLength(10);
  });

  it('selects an alert and opens its visit-level detail sheet', async () => {
    render(<FinancialControlTab {...dates} />);

    fireEvent.click(screen.getByRole('button', { name: 'View Overdue panel claim' }));

    expect(await screen.findByRole('dialog', { name: 'Overdue panel claim details' })).toBeInTheDocument();
    await waitFor(() => {
      expect(latestDetailFilters()).toMatchObject({
        metric: 'alerts',
        groupBy: 'visit',
        alertKey: 'overdue_panel',
        page: 1,
        pageSize: 25,
      });
    });
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('explains how to resolve an unsubmitted panel claim and links to pending claims', async () => {
    render(<FinancialControlTab {...dates} />);

    fireEvent.click(screen.getByRole('button', { name: 'View Unsubmitted panel claim' }));

    const dialog = await screen.findByRole('dialog', { name: 'Unsubmitted panel claim details' });
    expect(within(dialog).getByRole('heading', { name: 'How to resolve' })).toBeInTheDocument();
    expect(within(dialog).getByText(/pending for at least 2 business days/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: /Open pending panel claims/i })).toHaveAttribute(
      'href',
      '/clinic/panel-claims?tab=pending',
    );
  });

  it('explains that excess-payment rows may be under-recorded bills rather than duplicates', async () => {
    render(<FinancialControlTab {...dates} />);

    fireEvent.click(screen.getByRole('button', { name: 'View Possible duplicate or under-recorded bill' }));

    const dialog = await screen.findByRole('dialog', { name: 'Possible duplicate or under-recorded bill details' });
    expect(within(dialog).getByText(/one receipt.*missing charge/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/more than one receipt.*duplicate/i)).toBeInTheDocument();
  });

  it('uses exact server grouping values and resets the page when detail filters change', async () => {
    render(<FinancialControlTab {...dates} />);
    fireEvent.click(screen.getByRole('button', { name: /Gross Margin details/i }));

    expect(await screen.findByRole('dialog', { name: 'Gross Margin details' })).toBeInTheDocument();
    expect(latestDetailFilters()).toMatchObject({ metric: 'margin', groupBy: 'medicine', page: 1 });

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(latestDetailFilters().page).toBe(2));

    const switches: Array<[string, FinancialControlDetailFilters['groupBy']]> = [
      ['Medicine', 'medicine'],
      ['Procedure / service', 'procedure'],
      ['Package', 'package'],
      ['Doctor', 'doctor'],
      ['Payment type', 'payment_type'],
      ['Panel provider', 'panel_provider'],
    ];
    for (const [label, groupBy] of switches) {
      fireEvent.click(screen.getByRole('button', { name: label }));
      await waitFor(() => expect(latestDetailFilters()).toMatchObject({ groupBy, page: 1 }));
    }

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Gross Margin details' })).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /COGS details/i }));
    await waitFor(() => expect(latestDetailFilters()).toMatchObject({ metric: 'cogs', page: 1 }));
  });

  it('paginates within fixed boundaries and keeps page size inside the server contract', async () => {
    render(<FinancialControlTab {...dates} />);
    fireEvent.click(screen.getByRole('button', { name: /Billed Revenue details/i }));

    const previous = await screen.findByRole('button', { name: 'Previous' });
    const next = screen.getByRole('button', { name: 'Next' });
    expect(previous).toBeDisabled();
    expect(next).toBeEnabled();
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();

    fireEvent.click(next);
    await waitFor(() => expect(latestDetailFilters().page).toBe(2));
    expect(previous).toBeEnabled();

    fireEvent.change(screen.getByLabelText('Rows per page'), { target: { value: '100' } });
    await waitFor(() => expect(latestDetailFilters()).toMatchObject({ page: 1, pageSize: 100 }));
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('resets detail pagination when the selected date range changes', async () => {
    useFinancialControlDetailsMock.mockImplementation((filters: FinancialControlDetailFilters) => {
      const isShortRange = filters.startDate.getDate() === 2;
      return detailResult({
        page: filters.page,
        pageSize: filters.pageSize,
        total: isShortRange ? 1 : 51,
      });
    });

    const { rerender } = render(<FinancialControlTab {...dates} />);
    fireEvent.click(screen.getByRole('button', { name: /Billed Revenue details/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }));
    await waitFor(() => expect(latestDetailFilters().page).toBe(2));

    rerender(
      <FinancialControlTab
        startDate={new Date(2026, 7, 2, 12)}
        endDate={new Date(2026, 7, 2, 12)}
      />,
    );

    await waitFor(() => expect(latestDetailFilters()).toMatchObject({ page: 1 }));
    const shortRangeCalls = useFinancialControlDetailsMock.mock.calls
      .map(([filters]) => filters as FinancialControlDetailFilters)
      .filter((filters) => filters.startDate.getDate() === 2);
    expect(shortRangeCalls.every((filters) => filters.page === 1)).toBe(true);
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
    expect(screen.queryByText('Page 2 of 1')).not.toBeInTheDocument();
  });

  it('restores focus to the exact KPI and alert launchers after close or Escape', async () => {
    render(<FinancialControlTab {...dates} />);

    const kpi = screen.getByRole('button', { name: /Billed Revenue details/i });
    fireEvent.click(kpi);
    expect(await screen.findByRole('dialog', { name: 'Billed Revenue details' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(kpi).toHaveFocus());

    const alertView = screen.getByRole('button', { name: 'View Overdue panel claim' });
    fireEvent.click(alertView);
    expect(await screen.findByRole('dialog', { name: 'Overdue panel claim details' })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Overdue panel claim details' }), { key: 'Escape' });
    await waitFor(() => expect(alertView).toHaveFocus());
  });

  it('suppresses percentage comparisons when the comparison attribution is incomplete', () => {
    render(
      <FinancialSummaryStrip
        period={period}
        comparison={{ ...comparison, attributionComplete: false, incompleteVisits: 2 }}
        comparisonLabel="25-31 Jul"
        comparisonAttributionComplete={false}
        comparisonIncompleteVisits={2}
        selectedMetric="billed_revenue"
        onMetricSelect={vi.fn()}
      />,
    );

    expect(within(screen.getByRole('button', { name: /Billed Revenue details/i }))
      .getByText('Comparison unavailable — incomplete attribution')).toBeInTheDocument();
  });

  it('keeps a controlled financial detail open while its shell export is selected, then closes intentionally', async () => {
    useFinancialControlDetailsMock.mockImplementation((filters: FinancialControlDetailFilters) => detailResult({
      total: 1,
      page: filters.page,
      pageSize: filters.pageSize,
    }));
    const downloads: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      downloads.push(this.download);
    });
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:financial-control-shell'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });

    render(
      <InsightShell
        section="finance"
        onSectionChange={vi.fn()}
        range={{ from: dates.startDate, to: dates.endDate }}
        onRangeChange={vi.fn()}
        comparisonEnabled={false}
        onComparisonChange={vi.fn()}
        onRefresh={vi.fn()}
        exportItems={[]}
        confidence="current period"
      >
        <FinancialControlTab {...dates} />
      </InsightShell>,
    );

    const detailTrigger = screen.getByRole('button', { name: /Billed Revenue details/i });
    fireEvent.click(detailTrigger);
    expect(await screen.findByRole('dialog', { name: 'Billed Revenue details' })).toBeInTheDocument();

    const exportTrigger = screen.getByRole('button', { name: 'Export' });
    fireEvent(exportTrigger, new MouseEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      ctrlKey: false,
    }));
    expect(exportTrigger).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(exportTrigger);

    expect(exportTrigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('dialog', { hidden: true })).toHaveAttribute('data-state', 'open');
    const exportItem = await screen.findByRole('menuitem', { name: 'Financial details CSV' });
    fireEvent(exportItem, new MouseEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      ctrlKey: false,
    }));
    fireEvent.click(exportItem);
    await waitFor(() => expect(downloads).toEqual([
      'financial_control_2026-08-01_to_2026-08-07_billed_revenue_visit.csv',
    ]));

    fireEvent.keyDown(screen.getByRole('menu', { name: 'Export' }), { key: 'Escape' });
    await waitFor(() => expect(exportTrigger).toHaveAttribute('aria-expanded', 'false'));
    expect(screen.getByRole('dialog', { name: 'Billed Revenue details' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Billed Revenue details' })).not.toBeInTheDocument());
    await waitFor(() => expect(detailTrigger).toHaveFocus());
  });

  it('keeps summary and reconciliation visible for detail loading, zero rows, and errors', async () => {
    useFinancialControlDetailsMock.mockReturnValue(detailResult({}, { data: undefined, isLoading: true }));
    const { rerender } = render(<FinancialControlTab {...dates} />);
    fireEvent.click(screen.getByRole('button', { name: /Billed Revenue details/i }));

    expect(await screen.findByText('Loading financial details')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Reconciliation' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Financial control summary' })).toBeInTheDocument();

    useFinancialControlDetailsMock.mockReturnValue(detailResult({ rows: [], total: 0 }));
    rerender(<FinancialControlTab {...dates} />);
    expect(screen.getByText('No financial rows match these filters')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Reconciliation' })).toBeInTheDocument();

    useFinancialControlDetailsMock.mockReturnValue(detailResult({}, {
      data: undefined,
      isError: true,
      error: new Error('Detail unavailable'),
    }));
    rerender(<FinancialControlTab {...dates} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Financial details unavailable');
    expect(screen.getByRole('alert')).toHaveTextContent('Financial details are temporarily unavailable. Please retry.');
    expect(screen.getByRole('heading', { name: 'Reconciliation' })).toBeInTheDocument();
  });

  it('renders only financial fields and exact visit and bill destinations', async () => {
    render(<FinancialControlTab {...dates} />);
    fireEvent.click(screen.getByRole('button', { name: /Billed Revenue details/i }));

    expect(await screen.findByText('Aisyah Rahman')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open visit' })).toHaveAttribute('href', '/clinic/visits/queue-1');
    expect(screen.getByRole('link', { name: 'Open bill' })).toHaveAttribute('href', '/clinic/billings?queue=queue-1');
    expect(screen.queryByText('Private clinical note must never render')).not.toBeInTheDocument();
    expect(screen.queryByText('Private diagnosis must never render')).not.toBeInTheDocument();
    expect(screen.queryByText('private-document.pdf')).not.toBeInTheDocument();
  });

  it('downloads every filtered page with the current dates, metric, grouping, and page size', async () => {
    useFinancialControlDetailsMock.mockImplementation((filters: FinancialControlDetailFilters) => detailResult({
      rows: [detailRow],
      total: 101,
      page: filters.page,
      pageSize: filters.pageSize,
    }));
    financialControlRpcMock.mockImplementation(async (_name: string, args: Record<string, unknown>) => {
      const page = args._page as number;
      const rows = Array.from({ length: page === 1 ? 100 : 1 }, (_, index) => ({
        ...detailRow,
        groupKey: `${page}-${index}`,
        groupLabel: page === 1 && index === 0 ? '=Unsafe group' : `Group ${page}-${index}`,
      }));
      return {
        data: detailResult({ rows, total: 101, page, pageSize: 100 }).data,
        error: null,
      };
    });
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:financial-control');
    const downloads: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      downloads.push(this.download);
    });
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });

    render(<FinancialControlTab {...dates} />);
    fireEvent.click(screen.getByRole('button', { name: /Gross Margin details/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Payment type' }));
    fireEvent.change(screen.getByLabelText('Rows per page'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Export financial details as CSV' }));

    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    expect(financialControlRpcMock).toHaveBeenCalledTimes(2);
    expect(financialControlRpcMock.mock.calls.map(([, args]) => args)).toEqual([
      expect.objectContaining({
        _start_date: '2026-08-01',
        _end_date: '2026-08-07',
        _metric: 'margin',
        _group_by: 'payment_type',
        _alert_key: null,
        _page: 1,
        _page_size: 100,
      }),
      expect.objectContaining({ _page: 2, _page_size: 100 }),
    ]);
    expect(downloads).toEqual([
      'financial_control_2026-08-01_to_2026-08-07_margin_payment_type.csv',
    ]);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    const csv = await readBlob(blob);
    expect(blob.size).toBe(new TextEncoder().encode(csv).length + 3);
    expect(csv).toContain('Group,Completed,Doctor,Payment,Billed,Paid,Outstanding,COGS,Profit,Margin,Links');
    expect(csv).toContain("'=Unsafe group");
    expect(csv).not.toContain('clinicalNotes');
    expect(csv).not.toContain('Consultation ID');
    expect(screen.getByRole('button', { name: 'Export financial details as CSV' })).toBeEnabled();
    click.mockRestore();
  });

  it('passes the selected alert filter to the export request', async () => {
    useFinancialControlDetailsMock.mockImplementation((filters: FinancialControlDetailFilters) => detailResult({
      total: 26,
      page: filters.page,
      pageSize: filters.pageSize,
    }));
    financialControlRpcMock.mockImplementation(async (_name: string, args: Record<string, unknown>) => ({
      data: detailResult({
        rows: [detailRow],
        total: 26,
        page: args._page as number,
        pageSize: 25,
      }).data,
      error: null,
    }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:financial-control-alert') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });

    render(<FinancialControlTab {...dates} />);
    fireEvent.click(screen.getByRole('button', { name: 'View Overdue panel claim' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Export financial details as CSV' }));

    await waitFor(() => expect(financialControlRpcMock).toHaveBeenCalled());
    expect(financialControlRpcMock.mock.calls[0][1]).toMatchObject({
      _metric: 'alerts',
      _group_by: 'visit',
      _alert_key: 'overdue_panel',
      _page_size: 25,
    });
    click.mockRestore();
  });

  it('shows a clear notice when an export is capped at 10,000 rows', async () => {
    useFinancialControlDetailsMock.mockImplementation((filters: FinancialControlDetailFilters) => detailResult({
      rows: [detailRow],
      total: 10_001,
      page: filters.page,
      pageSize: filters.pageSize,
    }));
    financialControlRpcMock.mockImplementation(async (_name: string, args: Record<string, unknown>) => ({
      data: detailResult({
        rows: Array.from({ length: 100 }, (_, index) => ({
          ...detailRow,
          groupKey: `${args._page}-${index}`,
        })),
        total: 10_001,
        page: args._page as number,
        pageSize: 100,
      }).data,
      error: null,
    }));
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:financial-control-cap') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });

    render(<FinancialControlTab {...dates} />);
    fireEvent.click(screen.getByRole('button', { name: /Billed Revenue details/i }));
    fireEvent.change(await screen.findByLabelText('Rows per page'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Export financial details as CSV' }));

    expect(await screen.findByText('Export limited to the first 10,000 of 10,001 rows.')).toBeInTheDocument();
    expect(financialControlRpcMock).toHaveBeenCalledTimes(100);
    expect(financialControlRpcMock.mock.calls.at(-1)?.[1]).toMatchObject({ _page: 100, _page_size: 100 });
  });

  it('keeps detail data visible and retries only the failed summary query', async () => {
    const retrySummary = vi.fn();
    const { rerender } = render(<FinancialControlTab {...dates} />);
    fireEvent.click(screen.getByRole('button', { name: /Billed Revenue details/i }));
    expect(await screen.findByText('Aisyah Rahman')).toBeInTheDocument();

    useFinancialControlSummaryMock.mockReturnValue(summaryResult({
      data: undefined,
      isError: true,
      error: new Error('Summary refresh failed'),
      refetch: retrySummary,
    }));
    rerender(<FinancialControlTab {...dates} />);

    expect(screen.getByText('Aisyah Rahman')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry financial summary' }));
    expect(retrySummary).toHaveBeenCalledTimes(1);
  });

  it('keeps summary data visible and retries only the failed detail query', async () => {
    const retrySummary = vi.fn();
    const retryDetails = vi.fn();
    useFinancialControlSummaryMock.mockReturnValue(summaryResult({ refetch: retrySummary }));
    useFinancialControlDetailsMock.mockReturnValue(detailResult({}, {
      data: undefined,
      isError: true,
      error: new Error('Detail refresh failed'),
      refetch: retryDetails,
    }));

    render(<FinancialControlTab {...dates} />);
    fireEvent.click(screen.getByRole('button', { name: /Billed Revenue details/i }));

    expect(screen.getByRole('region', { name: 'Financial control summary' })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Retry financial details' }));
    expect(retryDetails).toHaveBeenCalledTimes(1);
    expect(retrySummary).not.toHaveBeenCalled();
  });

  it('labels stale summary and detail data while retaining the server update time', async () => {
    useFinancialControlSummaryMock.mockReturnValue(summaryResult({
      isError: true,
      error: new Error('Summary refresh failed'),
      refetch: vi.fn(),
    }));
    useFinancialControlDetailsMock.mockReturnValue(detailResult({}, {
      isError: true,
      error: new Error('Detail refresh failed'),
      refetch: vi.fn(),
    }));

    render(<FinancialControlTab {...dates} />);
    expect(screen.getByText('Summary data is stale. Please retry to refresh it.')).toBeInTheDocument();
    expect(screen.getByText('Last updated 7 Aug 2026, 12:15')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Billed Revenue details/i }));

    expect(await screen.findByText('Detail data is stale. Please retry to refresh it.')).toBeInTheDocument();
    expect(screen.getByText('Aisyah Rahman')).toBeInTheDocument();
  });
});
