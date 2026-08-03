import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DateRange } from 'react-day-picker';
import type {
  FinancialControlAlertKey,
  FinancialControlDetailFilters,
  FinancialControlDetailResponse,
  FinancialControlGroupBy,
  FinancialControlMetric,
  FinancialControlSummary,
} from '@/lib/clinic/financialControl';

const useQuery = vi.hoisted(() => vi.fn());
const rpc = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({ useQuery }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

import {
  useFinancialControlDetails,
  useFinancialControlSummary,
} from '@/hooks/clinic/useFinancialControl';

interface QueryOptions<T> {
  queryKey: readonly unknown[];
  queryFn: () => Promise<T>;
  enabled: boolean;
}

const metrics: FinancialControlMetric[] = [
  'billed_revenue',
  'cash_collected',
  'cohort_outstanding',
  'total_outstanding',
  'cogs',
  'gross_profit',
  'adjustments',
  'alerts',
  'margin',
];

const groupings: FinancialControlGroupBy[] = [
  'visit',
  'medicine',
  'procedure',
  'package',
  'doctor',
  'payment_type',
  'panel_provider',
];

const alertKeys: FinancialControlAlertKey[] = [
  'unpaid_self_pay',
  'unsubmitted_panel',
  'overdue_panel',
  'missing_cost',
  'zero_price',
  'negative_margin',
  'large_discount',
  'refund_void_correction',
  'payment_mismatch',
  'duplicate_or_excess_payment',
];

const completePeriod = {
  billedRevenue: 125,
  cashCollected: 100,
  cohortCollected: 100,
  olderDebtCollected: 0,
  collectionRate: 80,
  cogs: 40,
  grossProfit: 85,
  grossMarginPct: 68,
  cohortOutstanding: 25,
  totalOutstanding: 25,
  averageBill: 125,
  completedVisits: 1,
  attributionComplete: true,
  costComplete: true,
  incompleteVisits: 0,
  missingCostItems: 0,
};

const summaryResponse: FinancialControlSummary = {
  period: completePeriod,
  comparison: completePeriod,
  reconciliation: {
    billedCohort: 125,
    cashCollected: 100,
    cohortCollected: 100,
    olderDebtCollected: 0,
    discounts: 0,
    taxes: 0,
    refunds: 0,
    adjustments: 0,
    corrections: 0,
    cohortOutstanding: 25,
    selfPayOutstanding: 25,
    panelOutstanding: 0,
    totalOutstanding: 25,
    attributionComplete: true,
    incompleteVisits: 0,
  },
  alerts: alertKeys.map((key) => ({
    key,
    severity: 'low',
    count: 0,
    amount: 0,
    oldestAgeDays: 0,
    attributionComplete: true,
    incompleteRows: 0,
  })),
  generated_at: '2026-08-07T04:00:00Z',
};

const detailResponse: FinancialControlDetailResponse = {
  rows: [{
    queueEntryId: 'queue-1',
    consultationId: 'consultation-1',
    completedDate: '2026-08-01',
    patientName: 'Patient One',
    doctorName: 'Dr One',
    paymentType: 'self_pay',
    paymentMethod: 'card',
    panelProviderName: null,
    claimStatus: null,
    claimCreatedDate: null,
    claimDueDate: null,
    groupKey: 'queue-1',
    groupLabel: 'Patient One',
    billed: 125,
    paid: 100,
    paidInPeriod: 100,
    outstanding: 25,
    cogs: 40,
    profit: 85,
    marginPct: 68,
    discount: 0,
    tax: 0,
    refund: 0,
    corrections: 0,
    missingCostCount: 0,
    zeroPriceCount: 0,
    amount: 125,
    alertKeys: [],
    attributionComplete: true,
    costComplete: true,
    visitCount: 1,
  }],
  total: 1,
  page: 1,
  pageSize: 20,
  totals: {
    billed: 125,
    paid: 100,
    outstanding: 25,
    cogs: 40,
    profit: 85,
    attributionComplete: true,
    costComplete: true,
    incompleteRows: 0,
  },
};

const incompleteDetailTotals = {
  billed: null,
  paid: null,
  outstanding: null,
  cogs: null,
  profit: null,
  attributionComplete: false,
  costComplete: false,
  incompleteRows: 1,
};

const augustRange: DateRange = {
  from: new Date(2026, 7, 1, 12),
  to: new Date(2026, 7, 7, 12),
};

function detailFilters(overrides: Partial<FinancialControlDetailFilters> = {}): FinancialControlDetailFilters {
  return {
    startDate: new Date(2026, 7, 1, 12),
    endDate: new Date(2026, 7, 7, 12),
    metric: 'billed_revenue',
    groupBy: 'visit',
    alertKey: null,
    page: 1,
    pageSize: 20,
    ...overrides,
  };
}

function latestOptions<T>(): QueryOptions<T> {
  return useQuery.mock.calls.at(-1)?.[0] as QueryOptions<T>;
}

describe('useFinancialControlSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useQuery.mockImplementation((options) => options);
  });

  it('uses Malaysia-local date keys and a preceding equal comparison period', async () => {
    rpc.mockResolvedValue({ data: summaryResponse, error: null });

    useFinancialControlSummary(augustRange);
    const options = latestOptions<FinancialControlSummary>();

    expect(options.enabled).toBe(true);
    expect(options.queryKey).toEqual([
      'financial-control',
      'summary',
      '2026-08-01',
      '2026-08-07',
      '2026-07-25',
      '2026-07-31',
      '2026-08-07',
    ]);
    await expect(options.queryFn()).resolves.toEqual(summaryResponse);
    expect(rpc).toHaveBeenCalledWith('get_financial_control_summary', {
      _start_date: '2026-08-01',
      _end_date: '2026-08-07',
      _comparison_start: '2026-07-25',
      _comparison_end: '2026-07-31',
      _as_of_date: '2026-08-07',
    });
  });

  it.each([
    ['missing end', { from: new Date(2026, 7, 1, 12) }],
    ['invalid start', { from: new Date('invalid'), to: new Date(2026, 7, 7, 12) }],
    ['reversed', { from: new Date(2026, 7, 8, 12), to: new Date(2026, 7, 7, 12) }],
    ['over one year', { from: new Date(2025, 6, 31, 12), to: new Date(2026, 7, 1, 12) }],
  ])('disables the query for a %s range', (_label, range) => {
    useFinancialControlSummary(range as DateRange);

    expect(latestOptions().enabled).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('preserves the exact RPC error', async () => {
    const error = new Error('summary unavailable');
    rpc.mockResolvedValue({ data: null, error });

    useFinancialControlSummary(augustRange);

    await expect(latestOptions().queryFn()).rejects.toBe(error);
  });

  it('rejects malformed summary JSON', async () => {
    rpc.mockResolvedValue({
      data: { ...summaryResponse, period: { ...completePeriod, billedRevenue: '125.00' } },
      error: null,
    });

    useFinancialControlSummary(augustRange);

    await expect(latestOptions().queryFn()).rejects.toThrow('Invalid financial control response');
  });
});

describe('useFinancialControlDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useQuery.mockImplementation((options) => options);
    rpc.mockResolvedValue({ data: detailResponse, error: null });
  });

  it('includes every filter and pagination input in the stable query key and RPC call', async () => {
    const filters = detailFilters({
      metric: 'alerts',
      groupBy: 'panel_provider',
      alertKey: 'overdue_panel',
      page: 3,
      pageSize: 100,
    });

    useFinancialControlDetails(filters);
    const options = latestOptions<FinancialControlDetailResponse>();

    expect(options.enabled).toBe(true);
    expect(options.queryKey).toEqual([
      'financial-control',
      'details',
      '2026-08-01',
      '2026-08-07',
      '2026-08-07',
      'alerts',
      'panel_provider',
      'overdue_panel',
      3,
      100,
    ]);
    await expect(options.queryFn()).resolves.toEqual(detailResponse);
    expect(rpc).toHaveBeenCalledWith('get_financial_control_details', {
      _start_date: '2026-08-01',
      _end_date: '2026-08-07',
      _as_of_date: '2026-08-07',
      _metric: 'alerts',
      _group_by: 'panel_provider',
      _alert_key: 'overdue_panel',
      _page: 3,
      _page_size: 100,
    });
  });

  it.each(metrics)('accepts the %s metric at the RPC boundary', async (metric) => {
    useFinancialControlDetails(detailFilters({ metric }));

    await latestOptions().queryFn();

    expect(rpc).toHaveBeenCalledWith(
      'get_financial_control_details',
      expect.objectContaining({ _metric: metric }),
    );
  });

  it.each(groupings)('accepts the %s grouping at the RPC boundary', async (groupBy) => {
    useFinancialControlDetails(detailFilters({ groupBy }));

    await latestOptions().queryFn();

    expect(rpc).toHaveBeenCalledWith(
      'get_financial_control_details',
      expect.objectContaining({ _group_by: groupBy }),
    );
  });

  it.each(alertKeys)('accepts the %s alert at the RPC boundary', async (alertKey) => {
    useFinancialControlDetails(detailFilters({ metric: 'alerts', alertKey }));

    await latestOptions().queryFn();

    expect(rpc).toHaveBeenCalledWith(
      'get_financial_control_details',
      expect.objectContaining({ _alert_key: alertKey }),
    );
  });

  it.each([
    ['metric', { metric: 'not_a_metric' }],
    ['grouping', { groupBy: 'not_a_group' }],
    ['alert', { alertKey: 'not_an_alert' }],
    ['page below one', { page: 0 }],
    ['fractional page', { page: 1.5 }],
    ['page size below one', { pageSize: 0 }],
    ['page size above 100', { pageSize: 101 }],
    ['fractional page size', { pageSize: 20.5 }],
  ])('rejects an invalid %s before calling the RPC', async (_label, override) => {
    useFinancialControlDetails(detailFilters(override as Partial<FinancialControlDetailFilters>));

    await expect(latestOptions().queryFn()).rejects.toBeInstanceOf(Error);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['missing start', { startDate: undefined }],
    ['invalid end', { endDate: new Date('invalid') }],
    ['reversed', { startDate: new Date(2026, 7, 8, 12), endDate: new Date(2026, 7, 7, 12) }],
    ['over one year', { startDate: new Date(2025, 6, 31, 12), endDate: new Date(2026, 7, 1, 12) }],
  ])('disables the query for a %s range', (_label, override) => {
    useFinancialControlDetails(detailFilters(override as Partial<FinancialControlDetailFilters>));

    expect(latestOptions().enabled).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('preserves the exact RPC error independently of the summary query', async () => {
    const error = new Error('details unavailable');
    rpc.mockResolvedValue({ data: null, error });

    useFinancialControlDetails(detailFilters());

    await expect(latestOptions().queryFn()).rejects.toBe(error);
  });

  it('rejects malformed detail JSON', async () => {
    rpc.mockResolvedValue({
      data: { ...detailResponse, totals: { ...detailResponse.totals, billed: '125.00' } },
      error: null,
    });

    useFinancialControlDetails(detailFilters());

    await expect(latestOptions().queryFn()).rejects.toThrow('Invalid financial control response');
  });

  it('accepts an attribution-incomplete visit row with unavailable count fields', async () => {
    const incompleteVisitRow = {
      ...detailResponse.rows[0],
      billed: null,
      paid: null,
      paidInPeriod: null,
      outstanding: null,
      cogs: null,
      profit: null,
      marginPct: null,
      discount: null,
      tax: null,
      refund: null,
      corrections: null,
      missingCostCount: null,
      zeroPriceCount: null,
      amount: null,
      attributionComplete: false,
      costComplete: false,
    };
    rpc.mockResolvedValue({
      data: { ...detailResponse, rows: [incompleteVisitRow], totals: incompleteDetailTotals },
      error: null,
    });

    useFinancialControlDetails(detailFilters());

    await expect(latestOptions().queryFn()).resolves.toEqual({
      ...detailResponse,
      rows: [incompleteVisitRow],
      totals: incompleteDetailTotals,
    });
  });

  it('accepts an attribution-incomplete grouped row with unavailable count fields', async () => {
    const groupedRow = {
      queueEntryId: 'queue-1',
      consultationId: null,
      completedDate: '2026-08-01',
      patientName: null,
      doctorName: 'Dr One',
      paymentType: null,
      paymentMethod: null,
      panelProviderName: null,
      groupKey: 'unavailable',
      groupLabel: 'Unavailable attribution',
      billed: null,
      paid: null,
      outstanding: null,
      cogs: null,
      profit: null,
      marginPct: null,
      discount: null,
      tax: null,
      refund: null,
      corrections: null,
      missingCostCount: null,
      zeroPriceCount: null,
      amount: null,
      alertKeys: [],
      attributionComplete: false,
      costComplete: false,
      visitCount: 1,
    };
    rpc.mockResolvedValue({
      data: { ...detailResponse, rows: [groupedRow], totals: incompleteDetailTotals },
      error: null,
    });

    useFinancialControlDetails(detailFilters({ groupBy: 'doctor' }));

    await expect(latestOptions().queryFn()).resolves.toEqual({
      ...detailResponse,
      rows: [{
        ...groupedRow,
        claimStatus: null,
        claimCreatedDate: null,
        claimDueDate: null,
        paidInPeriod: null,
      }],
      totals: incompleteDetailTotals,
    });
  });
});
