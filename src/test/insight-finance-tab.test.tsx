import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InsightShell } from '@/components/clinic/insight/InsightShell';
import { FinanceTab } from '@/components/clinic/insight/finance/FinanceTab';

const useFinancialControlSummaryMock = vi.hoisted(() => vi.fn());
const useFinancialControlDetailsMock = vi.hoisted(() => vi.fn());
const useFinancialInsightsMock = vi.hoisted(() => vi.fn());
const useSalesInsightsMock = vi.hoisted(() => vi.fn());
const usePanelBilledInsightsMock = vi.hoisted(() => vi.fn());
const receiptDialogMock = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/clinic/useFinancialControl', () => ({
  useFinancialControlSummary: useFinancialControlSummaryMock,
  useFinancialControlDetails: useFinancialControlDetailsMock,
}));
vi.mock('@/hooks/clinic/useFinancialInsights', () => ({ useFinancialInsights: useFinancialInsightsMock }));
vi.mock('@/hooks/clinic/useSalesInsights', () => ({ useSalesInsights: useSalesInsightsMock }));
vi.mock('@/hooks/clinic/usePanelBilledInsights', () => ({ usePanelBilledInsights: usePanelBilledInsightsMock }));
vi.mock('@/components/clinic/insight/management/FinancialDetailSheet', () => ({ FinancialDetailSheet: () => null }));
vi.mock('@/components/clinic/billing/PrintReceiptDialog', () => ({
  PrintReceiptDialog: (props: { open: boolean; paymentId: string | null }) => {
    receiptDialogMock(props);
    return props.open ? <div>Receipt opened for {props.paymentId}</div> : null;
  },
}));
vi.mock('@/components/clinic/insight/BankHealthTab', () => ({
  BankHealthTab: ({ canSeeNamedDoctors }: { canSeeNamedDoctors?: boolean }) => (
    <div>Bank health advanced content · named {String(canSeeNamedDoctors)}</div>
  ),
}));
vi.mock('@/components/clinic/insight/ValuationTab', () => ({ ValuationTab: () => <div>Valuation advanced content</div> }));

const financialControl = {
  period: {
    billedRevenue: 143, cashCollected: 98, cohortCollected: 98, olderDebtCollected: 0,
    collectionRate: 68.5, cogs: 30, grossProfit: 113, grossMarginPct: 79,
    cohortOutstanding: 45, totalOutstanding: 45, averageBill: 143, completedVisits: 1,
    attributionComplete: true, costComplete: true, incompleteVisits: 0, missingCostItems: 0,
  },
  comparison: {
    billedRevenue: 100, cashCollected: 80, cohortCollected: 80, olderDebtCollected: 0,
    collectionRate: 80, cogs: 20, grossProfit: 80, grossMarginPct: 80,
    cohortOutstanding: 20, totalOutstanding: 20, averageBill: 100, completedVisits: 1,
    attributionComplete: true, costComplete: true, incompleteVisits: 0, missingCostItems: 0,
  },
  reconciliation: {
    billedCohort: 143, cashCollected: 98, cohortCollected: 98, olderDebtCollected: 0,
    discounts: 0, taxes: 0, refunds: 0, adjustments: 0, corrections: 0,
    cohortOutstanding: 45, selfPayOutstanding: 0, panelOutstanding: 45,
    totalOutstanding: 45, attributionComplete: true, incompleteVisits: 0,
  },
  alerts: [],
  generated_at: '2026-08-16T04:00:00Z',
};

const dates = { startDate: new Date(2026, 7, 1), endDate: new Date(2026, 7, 16) };

function renderFinance(canViewAdvanced = true, canSeeNamedDoctors = true) {
  window.history.replaceState({}, '', '/clinic/insight?section=finance');
  return render(
    <InsightShell
      section="finance"
      onSectionChange={vi.fn()}
      range={{ from: dates.startDate, to: dates.endDate }}
      onRangeChange={vi.fn()}
      comparisonEnabled={false}
      onComparisonChange={vi.fn()}
      onRefresh={vi.fn()}
      exportItems={[]}
      confidence="reliable"
    >
      <FinanceTab {...dates} canViewAdvanced={canViewAdvanced} canSeeNamedDoctors={canSeeNamedDoctors} />
    </InsightShell>,
  );
}

describe('Finance workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFinancialControlSummaryMock.mockReturnValue({
      data: financialControl, isLoading: false, isError: false, error: null, refetch: vi.fn(),
    });
    useFinancialControlDetailsMock.mockReturnValue({ data: undefined, isLoading: false, isError: false, error: null });
    useFinancialInsightsMock.mockReturnValue({
      data: { rows: [], summary: { totalRevenue: 143 }, dailyTrends: [] },
      isLoading: false, isError: false, error: null,
    });
    useSalesInsightsMock.mockReturnValue({
      data: {
        summary: { totalCollected: 98, paymentCount: 2, visitCount: 1 },
        rows: [
          { paymentId: 'cash-1', createdAt: '2026-07-31T16:30:00Z', queueEntryId: 'q1', consultationId: 'c1', paymentType: 'panel', paymentMethod: 'cash', amount: 40 },
          { paymentId: 'qr-1', createdAt: '2026-08-01T01:01:00Z', queueEntryId: 'q1', consultationId: 'c1', paymentType: 'panel', paymentMethod: 'qr_pay', amount: 58 },
        ],
        allRows: [], byMethod: [], dailyTrends: [],
      },
      isLoading: false, isError: false, error: null,
    });
    usePanelBilledInsightsMock.mockReturnValue({
      data: {
        totalBilled: 45,
        totalReceived: 0,
        claimCount: 1,
        claims: [{
          id: 'claim-1', queue_entry_id: 'q1', claim_date: '2026-08-01', amount: 45,
          received_amount: 0, status: 'submitted', provider_name: 'Acme Health',
        }],
      },
      isLoading: false, isError: false, error: null,
    });
  });

  it('shows the six distinct ledger identities and all Finance subsections', () => {
    renderFinance();

    expect(screen.getAllByRole('tab', { hidden: false }).map((tab) => tab.textContent)).toEqual([
      'Command Centre', 'Finance', 'Performance', 'Planning',
      'Summary', 'Collections', 'Panels', 'Costs & Margin', 'Reconciliation', 'Advanced',
    ]);
    expect(within(screen.getByTestId('finance-ledger-summary')).getByText('RM 143.00')).toBeInTheDocument();
    expect(within(screen.getByTestId('finance-ledger-summary')).getByText('RM 98.00')).toBeInTheDocument();
    expect(within(screen.getByTestId('finance-ledger-summary')).getAllByText('RM 45.00')).toHaveLength(2);
    expect(within(screen.getByTestId('finance-ledger-summary')).getAllByText('RM 0.00')).toHaveLength(2);
  });

  it('shows only physical collection methods and panel lifecycle/provider data', () => {
    renderFinance();
    fireEvent.click(screen.getByRole('tab', { name: 'Collections' }));

    expect(screen.getByText('QR Pay').closest('[data-collection-method]')).toHaveTextContent('RM 58.00');
    expect(screen.getByText('Cash').closest('[data-collection-method]')).toHaveTextContent('RM 40.00');
    expect(screen.queryByText('panel', { selector: '[data-collection-method]' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Panels' }));
    expect(screen.getByRole('table', { name: 'Panel claim lifecycle' })).toHaveTextContent('Acme Health');
    expect(screen.getByRole('table', { name: 'Panel claim lifecycle' })).toHaveTextContent('Submitted');
  });

  it('opens collection deep links as method-specific payment rows and receipts', async () => {
    renderFinance();
    fireEvent.click(screen.getByRole('tab', { name: 'Collections' }));
    fireEvent.click(screen.getByText('Cash').closest('button') as HTMLButtonElement);

    expect(window.location.search).toContain('collection=cash');
    expect(screen.getByRole('dialog', { name: 'Cash collections' })).toHaveTextContent('cash-1');
    expect(screen.getByRole('dialog', { name: 'Cash collections' })).not.toHaveTextContent('qr-1');
    expect(screen.getByRole('dialog', { name: 'Cash collections' })).toHaveTextContent('2026-08-01');
    expect(screen.getByRole('dialog', { name: 'Cash collections' })).not.toHaveTextContent('2026-07-31');
    fireEvent.click(screen.getByRole('button', { name: 'Open receipt cash-1' }));
    expect(await screen.findByText('Receipt opened for cash-1')).toBeInTheDocument();
  });

  it('surfaces a failed supporting source as partial and retries that source', () => {
    const retrySales = vi.fn();
    useSalesInsightsMock.mockReturnValue({
      data: { summary: { totalCollected: 98 }, rows: [], allRows: [], byMethod: [], dailyTrends: [] },
      isLoading: false,
      isError: true,
      error: new Error('payments unavailable'),
      refetch: retrySales,
    });
    renderFinance();

    expect(screen.getByRole('status')).toHaveTextContent('Some Finance sources could not be refreshed');
    expect(screen.getByTestId('finance-ledger-summary')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry failed Finance sources' }));
    expect(retrySales).toHaveBeenCalledTimes(1);
  });

  it('shows derived panel lifecycle states and claim-specific records', () => {
    usePanelBilledInsightsMock.mockReturnValue({
      data: {
        totalBilled: 45, totalReceived: 0, claimCount: 1,
        claims: [
          { id: 'claim-overdue', queue_entry_id: 'q1', claim_date: '2026-08-01', due_date: '2026-08-10', amount: 45, received_amount: 0, status: 'pending', provider_name: 'Acme Health' },
          { id: 'claim-rejected', queue_entry_id: 'q2', claim_date: '2026-08-02', due_date: '2026-08-10', amount: 20, received_amount: 0, status: 'rejected', provider_name: 'Acme Health' },
        ],
      },
      isLoading: false, isError: false, error: null, refetch: vi.fn(),
    });
    renderFinance();
    fireEvent.click(screen.getByRole('tab', { name: 'Panels' }));

    expect(screen.getByRole('table', { name: 'Panel claim lifecycle' })).toHaveTextContent('Unsubmitted · Overdue');
    expect(screen.getByRole('table', { name: 'Panel claim lifecycle' })).toHaveTextContent('Rejected');
    const rejectedRow = screen.getByText('Rejected').closest('tr');
    expect(rejectedRow).not.toHaveTextContent('RM 20.00');
    expect(within(rejectedRow as HTMLTableRowElement).getAllByText('RM 0.00')).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'Claim claim-overdue' })).toHaveAttribute('href', '/clinic/panel-claims?tab=all&claim=claim-overdue');
  });

  it('surfaces a stale panel result as partial and retries the panel source', () => {
    const retryPanel = vi.fn();
    usePanelBilledInsightsMock.mockReturnValue({
      data: { totalBilled: 45, totalReceived: 0, claimCount: 1, claims: [] },
      isLoading: false,
      isError: true,
      error: new Error('panel query unavailable'),
      refetch: retryPanel,
    });
    renderFinance();
    fireEvent.click(screen.getByRole('tab', { name: 'Panels' }));

    expect(screen.getByRole('status')).toHaveTextContent('Panel claims could not be refreshed');
    fireEvent.click(screen.getByRole('button', { name: 'Retry panel claims' }));
    expect(retryPanel).toHaveBeenCalledTimes(1);
  });

  it('keeps advanced finance permission-gated', () => {
    const { rerender } = renderFinance(false);
    fireEvent.click(screen.getByRole('tab', { name: 'Advanced' }));
    expect(screen.getByText('Advanced finance is permission restricted.')).toBeInTheDocument();
    expect(screen.queryByText('Bank health advanced content')).not.toBeInTheDocument();

    rerender(
      <InsightShell
        section="finance" onSectionChange={vi.fn()} range={{ from: dates.startDate, to: dates.endDate }}
        onRangeChange={vi.fn()} comparisonEnabled={false} onComparisonChange={vi.fn()}
        onRefresh={vi.fn()} exportItems={[]} confidence="reliable"
      >
        <FinanceTab {...dates} canViewAdvanced />
      </InsightShell>,
    );
    expect(screen.getByText(/Bank health advanced content/)).toBeInTheDocument();
    expect(screen.getByText('Valuation advanced content')).toBeInTheDocument();
  });

  it('passes named-doctor access through to Advanced Finance', () => {
    renderFinance(true, false);
    fireEvent.click(screen.getByRole('tab', { name: 'Advanced' }));
    expect(screen.getByText('Bank health advanced content · named false')).toBeInTheDocument();
  });

  it('registers the five Finance exports in the one shared Export menu', async () => {
    renderFinance();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Export' }), { key: 'Enter' });

    for (const label of [
      'Consultation CSV', 'Collected CSV', 'Daily Consultation Revenue',
      'Panel claim detail', 'Reconciliation detail',
    ]) {
      expect(await screen.findByRole('menuitem', { name: new RegExp(label, 'i') })).toBeInTheDocument();
    }
    expect(document.querySelectorAll('[data-insight-export-control]')).toHaveLength(2);
  });
});
