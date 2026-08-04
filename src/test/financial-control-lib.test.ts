import { describe, expect, it, vi } from 'vitest';
import {
  collectFinancialControlExportRows,
  financialControlExportFilename,
  financialControlRowsToCsv,
  getFinancialAttributionIssues,
  type FinancialControlDetailFilters,
  type FinancialControlDetailResponse,
  type FinancialControlDetailRow,
} from '@/lib/clinic/financialControl';

function detailRow(overrides: Partial<FinancialControlDetailRow> = {}): FinancialControlDetailRow {
  return {
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
    discount: 5,
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
    ...overrides,
  };
}

describe('financial attribution explanations', () => {
  it('identifies the missing history fields for an incomplete visit', () => {
    expect(getFinancialAttributionIssues(detailRow({
      attributionComplete: false,
      paid: null,
      paidInPeriod: null,
      cogs: null,
      corrections: null,
    }))).toEqual(['payment history', 'cost history', 'correction history']);
  });

  it('does not label a fully attributed visit as incomplete', () => {
    expect(getFinancialAttributionIssues(detailRow())).toEqual([]);
  });
});

describe('financialControlRowsToCsv', () => {
  it('exports only visible visit columns with a BOM, safe formulas, and two-decimal money', () => {
    const csv = financialControlRowsToCsv([
      detailRow({
        patientName: '=HYPERLINK("https://example.test","Doe, Jane")\nFollow-up',
        doctorName: '+SUM(1,1)',
        paymentType: '-unsafe',
        paymentMethod: '@command',
        billed: 1234.5,
        paid: null,
        outstanding: 1225.5,
        cogs: null,
        profit: null,
        marginPct: null,
      }),
    ], 'visit');

    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain(
      'Patient / visit,Completed,Doctor,Payment,Billed,Paid,Outstanding,COGS,Profit,Margin,Links\r\n',
    );
    expect(csv).toContain(
      '"\'=HYPERLINK(""https://example.test"",""Doe, Jane"")\nFollow-up"',
    );
    expect(csv).toContain("'+SUM(1,1)");
    expect(csv).toContain("'-unsafe / @command");
    expect(csv).toContain(',1234.50,,1225.50,,,,');
    expect(csv).not.toContain('Consultation ID');
    expect(csv).not.toContain('Claim Status');
    expect(csv).not.toContain('Missing Cost Count');
  });

  it('neutralizes grouped labels that begin with every spreadsheet formula character', () => {
    for (const prefix of ['=', '+', '-', '@']) {
      const csv = financialControlRowsToCsv([
        detailRow({ groupLabel: `${prefix}unsafe` }),
      ], 'medicine');

      expect(csv).toContain(`\r\n'${prefix}unsafe,`);
    }
  });

  it('neutralizes negative numeric profit and margin cells after formatting', () => {
    const csv = financialControlRowsToCsv([
      detailRow({ profit: -85, marginPct: -12.5 }),
    ]);

    expect(csv).toContain("40.00,'-85.00,'-12.5%,");
    expect(csv).not.toContain('40.00,-85.00,-12.5%,');
  });

  it('builds the filename from local date, metric, and grouping filters', () => {
    expect(financialControlExportFilename({
      startDate: new Date(2026, 7, 1, 12),
      endDate: new Date(2026, 7, 7, 12),
      metric: 'alerts',
      groupBy: 'panel_provider',
      alertKey: 'overdue_panel',
      page: 4,
      pageSize: 50,
    })).toBe('financial_control_2026-08-01_to_2026-08-07_alerts_panel_provider.csv');
  });
});

describe('collectFinancialControlExportRows', () => {
  const filters: FinancialControlDetailFilters = {
    startDate: new Date(2026, 7, 1, 12),
    endDate: new Date(2026, 7, 7, 12),
    metric: 'alerts',
    groupBy: 'visit',
    alertKey: 'overdue_panel',
    page: 2,
    pageSize: 2,
  };

  function response(page: number, rows: FinancialControlDetailRow[], total: number): FinancialControlDetailResponse {
    return {
      rows,
      total,
      page,
      pageSize: filters.pageSize,
      totals: {
        billed: null,
        paid: null,
        outstanding: null,
        cogs: null,
        profit: null,
        attributionComplete: true,
        costComplete: true,
        incompleteRows: 0,
      },
    };
  }

  it('requests every filtered page sequentially from page one', async () => {
    const fetchPage = vi.fn(async (pageFilters: FinancialControlDetailFilters) => response(
      pageFilters.page,
      pageFilters.page === 1
        ? [detailRow({ groupKey: '1' }), detailRow({ groupKey: '2' })]
        : pageFilters.page === 2
          ? [detailRow({ groupKey: '3' }), detailRow({ groupKey: '4' })]
          : [detailRow({ groupKey: '5' })],
      5,
    ));

    const result = await collectFinancialControlExportRows(filters, 5, fetchPage);

    expect(fetchPage.mock.calls.map(([pageFilters]) => pageFilters)).toEqual([
      { ...filters, page: 1 },
      { ...filters, page: 2 },
      { ...filters, page: 3 },
    ]);
    expect(result.rows.map((row) => row.groupKey)).toEqual(['1', '2', '3', '4', '5']);
    expect(result.truncated).toBe(false);
  });

  it('stops at 10,000 rows and never requests an unbounded page', async () => {
    const cappedFilters = { ...filters, pageSize: 100 };
    const fetchPage = vi.fn(async (pageFilters: FinancialControlDetailFilters) => response(
      pageFilters.page,
      Array.from({ length: 100 }, (_, index) => detailRow({
        groupKey: `${pageFilters.page}-${index}`,
      })),
      10_001,
    ));

    const result = await collectFinancialControlExportRows(cappedFilters, 10_001, fetchPage);

    expect(result.rows).toHaveLength(10_000);
    expect(result.truncated).toBe(true);
    expect(fetchPage).toHaveBeenCalledTimes(100);
    expect(fetchPage.mock.calls.at(-1)?.[0]).toMatchObject({ page: 100, pageSize: 100 });
  });
});
