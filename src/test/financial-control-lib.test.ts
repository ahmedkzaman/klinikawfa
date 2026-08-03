import { describe, expect, it } from 'vitest';
import {
  financialControlRowsToCsv,
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

describe('financialControlRowsToCsv', () => {
  it('serializes visible detail columns with RFC 4180 escaping and two-decimal money', () => {
    const csv = financialControlRowsToCsv([
      detailRow({
        patientName: 'Doe, "Jane"\nFollow-up',
        groupLabel: 'Unavailable\ncohort',
        billed: 1234.5,
        paid: null,
        paidInPeriod: 9,
        outstanding: 1225.5,
        cogs: null,
        profit: null,
        marginPct: null,
        discount: 1.2,
        tax: 0,
        refund: 3,
        corrections: null,
        missingCostCount: null,
        zeroPriceCount: null,
        amount: 1234.5,
        alertKeys: ['missing_cost', 'large_discount'],
        attributionComplete: false,
        costComplete: false,
      }),
    ]);

    expect(csv).toBe(
      'Completed Date,Queue Entry ID,Consultation ID,Patient,Doctor,Payment Type,Payment Method,Panel Provider,Claim Status,Claim Created Date,Claim Due Date,Group,Billed,Paid,Paid In Period,Outstanding,COGS,Gross Profit,Margin %,Discount,Tax,Refund,Corrections,Missing Cost Count,Zero Price Count,Amount,Alerts,Attribution Complete,Cost Complete,Visit Count\r\n' +
      '2026-08-01,queue-1,consultation-1,"Doe, ""Jane""\nFollow-up",Dr One,self_pay,card,,,,,"Unavailable\ncohort",1234.50,,9.00,1225.50,,,,1.20,0.00,3.00,,,,1234.50,"missing_cost, large_discount",false,false,1',
    );
  });

  it('returns the header row for an empty result', () => {
    expect(financialControlRowsToCsv([])).toBe(
      'Completed Date,Queue Entry ID,Consultation ID,Patient,Doctor,Payment Type,Payment Method,Panel Provider,Claim Status,Claim Created Date,Claim Due Date,Group,Billed,Paid,Paid In Period,Outstanding,COGS,Gross Profit,Margin %,Discount,Tax,Refund,Corrections,Missing Cost Count,Zero Price Count,Amount,Alerts,Attribution Complete,Cost Complete,Visit Count',
    );
  });
});
