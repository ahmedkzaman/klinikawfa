import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Insight from '@/pages/clinic/Insight';

const {
  useFinancialInsightsMock,
  useSalesInsightsMock,
  usePanelBilledInsightsMock,
} = vi.hoisted(() => ({
  useFinancialInsightsMock: vi.fn(),
  useSalesInsightsMock: vi.fn(),
  usePanelBilledInsightsMock: vi.fn(),
}));

vi.mock('@/hooks/clinic/useFinancialInsights', () => ({
  useFinancialInsights: useFinancialInsightsMock,
}));
vi.mock('@/hooks/clinic/useSalesInsights', () => ({
  useSalesInsights: useSalesInsightsMock,
}));
vi.mock('@/hooks/clinic/usePanelBilledInsights', () => ({
  usePanelBilledInsights: usePanelBilledInsightsMock,
}));

vi.mock('@/components/clinic/insight/ClinicHealthTab', () => ({ ClinicHealthTab: () => null }));
vi.mock('@/components/clinic/insight/ScoreboardsTab', () => ({ ScoreboardsTab: () => null }));
vi.mock('@/components/clinic/insight/LeaderboardsTab', () => ({ LeaderboardsTab: () => null }));
vi.mock('@/components/clinic/insight/ValuationTab', () => ({ ValuationTab: () => null }));
vi.mock('@/components/clinic/insight/BankHealthTab', () => ({ BankHealthTab: () => null }));
vi.mock('@/components/clinic/insight/management/ManagementTab', () => ({ ManagementTab: () => null }));

const financialData = {
  summary: {
    totalRevenue: 300,
    totalCogs: 100,
    totalProfit: 200,
    marginPct: 66.67,
    patientVolume: 2,
    missingCogsLineCount: 0,
  },
  dailyTrends: [],
  topItems: [],
  ltvSegment: [],
  rows: [],
};

function openOverview() {
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Overview' }), {
    button: 0,
    ctrlKey: false,
  });
}

describe('Insight panel billed card', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFinancialInsightsMock.mockReturnValue({
      data: financialData,
      isLoading: false,
      isError: false,
      error: null,
    });
    useSalesInsightsMock.mockReturnValue({
      data: {
        summary: { totalCollected: 200, paymentCount: 1, visitCount: 1 },
        dailyTrends: [],
        byMethod: [{ method: 'cash', collected: 200, paymentCount: 1 }],
        rows: [],
      },
      isLoading: false,
      isError: false,
      error: null,
    });
    usePanelBilledInsightsMock.mockReturnValue({
      data: { totalBilled: 450, claimCount: 3 },
      isLoading: false,
      isError: false,
      error: null,
    });
  });

  it('shows billed panel claims without changing total collected', () => {
    render(<Insight />);
    openOverview();

    expect(screen.getByText('Panel Billed')).toBeInTheDocument();
    expect(screen.getByText('RM 450.00')).toBeInTheDocument();
    expect(screen.getByText('Total Visit Billing').parentElement?.parentElement)
      .toHaveTextContent('RM 750.00');
    expect(screen.getByText('3 claims')).toBeInTheDocument();
    expect(screen.getByText('Total Collected').parentElement?.parentElement)
      .toHaveTextContent('RM 200.00');
  });

  it('keeps the zero-valued card visible on a panel-only day', () => {
    useSalesInsightsMock.mockReturnValue({
      data: {
        summary: { totalCollected: 0, paymentCount: 0, visitCount: 0 },
        dailyTrends: [],
        byMethod: [],
        rows: [],
      },
      isLoading: false,
      isError: false,
      error: null,
    });
    usePanelBilledInsightsMock.mockReturnValue({
      data: { totalBilled: 0, claimCount: 0 },
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<Insight />);
    openOverview();

    expect(screen.getByText('Panel Billed')).toBeInTheDocument();
    expect(screen.getAllByText('RM 0.00').length).toBeGreaterThan(0);
    expect(screen.getByText('0 claims')).toBeInTheDocument();
  });
});
