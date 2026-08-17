import { describe, expect, it } from 'vitest';

import {
  buildFinanceDailyRevenueCsv,
  buildFinanceLedgerSummary,
  buildPanelClaimsCsv,
  clinicDateKey,
  financeCollectionKey,
  groupFinanceCollections,
  panelClaimHref,
  panelLifecycleLabel,
  parsePanelClaimId,
  parseFinanceSection,
  withFinanceSection,
} from '@/lib/clinic/insight/financeSections';
import { parseCommandFinanceDetail } from '@/lib/clinic/insight/commandCentre';

describe('Finance ledger identity', () => {
  it('keeps a patient co-payment and its panel claim on separate ledgers', () => {
    const summary = buildFinanceLedgerSummary({
      financialControl: {
        period: { billedRevenue: 143, cashCollected: 98 },
        reconciliation: { selfPayOutstanding: 0, panelOutstanding: 45 },
      },
      sales: { summary: { totalCollected: 98 } },
      panelBilled: { totalBilled: 45, totalReceived: 0 },
    });

    expect(summary.visitBilled).toBe(143);
    expect(summary.patientCollected).toBe(98);
    expect(summary.panelBilled).toBe(45);
    expect(summary.panelReceived).toBe(0);
    expect(summary.patientOutstanding).toBe(0);
    expect(summary.panelOutstanding).toBe(45);
  });

  it('never infers panel receipts by subtracting physical collections from a different cash scope', () => {
    expect(buildFinanceLedgerSummary({
      financialControl: {
        period: { billedRevenue: 200, cashCollected: 150 },
        reconciliation: { selfPayOutstanding: 0, panelOutstanding: 30 },
      },
      sales: { summary: { totalCollected: 90 } },
      panelBilled: { totalBilled: 60 },
    }).panelReceived).toBeNull();

    expect(buildFinanceLedgerSummary({
      financialControl: { period: { billedRevenue: 200, cashCollected: 150 } },
      sales: { summary: { totalCollected: 90 } },
      panelBilled: { totalBilled: 60, totalReceived: 25 },
    }).panelReceived).toBe(25);
  });

  it('groups only physical patient collection methods and excludes panel markers', () => {
    expect(groupFinanceCollections([
      { paymentMethod: 'cash', amount: 40 },
      { paymentMethod: 'qr_pay', amount: 58 },
      { paymentMethod: 'panel', amount: 45 },
      { paymentMethod: 'bank_transfer', amount: 12 },
    ])).toEqual([
      { key: 'card', label: 'Card', collected: 0, paymentCount: 0 },
      { key: 'qr_pay', label: 'QR Pay', collected: 58, paymentCount: 1 },
      { key: 'cash', label: 'Cash', collected: 40, paymentCount: 1 },
      { key: 'e_wallet', label: 'E-wallet', collected: 0, paymentCount: 0 },
      { key: 'other', label: 'Other', collected: 12, paymentCount: 1 },
    ]);
  });

  it('maps deep-linked collection methods to the same physical-payment groups', () => {
    expect(financeCollectionKey('credit_card')).toBe('card');
    expect(financeCollectionKey('DuitNow QR')).toBe('qr_pay');
    expect(financeCollectionKey('panel')).toBeNull();
    expect(parseCommandFinanceDetail('?section=finance&finance=collections&metric=cash_collected&collection=cash')).toBeNull();
  });

  it('exports visit billing, physical collections, and panel billing without dropping a panel co-pay', () => {
    expect(buildFinanceDailyRevenueCsv(
      [
        { visit_date: '2026-08-01', revenue: 100 },
        { visit_date: '2026-08-01', revenue: 43 },
      ],
      [
        { createdAt: '2026-07-31T16:30:00.000Z', amount: 40 },
        { createdAt: '2026-08-01T01:00:00.000Z', amount: 58 },
      ],
      [
        { claim_date: '2026-08-01', amount: 45, status: 'submitted' },
        { claim_date: '2026-08-01', amount: 500, status: 'rejected' },
        { claim_date: '2026-08-01', amount: 900, status: 'cancelled' },
      ],
    )).toEqual([
      'date,visit_billed,patient_collected,panel_billed',
      '2026-08-01,143.00,98.00,45.00',
    ]);
  });

  it('exports terminal claims with zero financial billing and zero outstanding', () => {
    expect(buildPanelClaimsCsv([
      { id: 'active', claim_date: '2026-08-01', provider: 'Acme', status: 'submitted', queue_entry_id: 'q1', amount: 45, received_amount: 5 },
      { id: 'rejected', claim_date: '2026-08-02', provider: 'Acme', status: 'rejected', queue_entry_id: 'q2', amount: 500, received_amount: 0 },
      { id: 'cancelled', claim_date: '2026-08-03', provider: 'Acme', status: 'cancelled', queue_entry_id: 'q3', amount: 900, received_amount: 0 },
    ])).toEqual([
      'claim_id,claim_date,provider,status,queue_entry_id,billed,received,outstanding',
      'active,2026-08-01,Acme,submitted,q1,45.00,5.00,40.00',
      'rejected,2026-08-02,Acme,rejected,q2,0.00,0.00,0.00',
      'cancelled,2026-08-03,Acme,cancelled,q3,0.00,0.00,0.00',
    ]);
  });

  it('uses the Malaysia calendar day for collection timestamps', () => {
    expect(clinicDateKey('2026-07-31T16:30:00.000Z')).toBe('2026-08-01');
    expect(clinicDateKey('not-a-date')).toBeNull();
  });

  it('derives unsubmitted and overdue lifecycle states while preserving terminal states', () => {
    expect(panelLifecycleLabel({ status: 'pending', due_date: '2026-08-10', amount: 45, received_amount: 0 }, '2026-08-16'))
      .toBe('Unsubmitted · Overdue');
    expect(panelLifecycleLabel({ status: 'rejected', due_date: '2026-08-10', amount: 45, received_amount: 0 }, '2026-08-16'))
      .toBe('Rejected');
  });

  it('keeps panel navigation claim-specific', () => {
    expect(panelClaimHref('claim-7')).toBe('/clinic/panel-claims?tab=all&claim=claim-7');
    expect(parsePanelClaimId('?tab=all&claim=claim-7')).toBe('claim-7');
    expect(parsePanelClaimId('?tab=all')).toBeNull();
  });
});

describe('Finance subsection query contract', () => {
  it('restores valid subsections, derives cost deep links, and defaults safely', () => {
    expect(parseFinanceSection('?section=finance&finance=panels')).toBe('panels');
    expect(parseFinanceSection('?section=finance&metric=margin')).toBe('costs');
    expect(parseFinanceSection('?section=finance&finance=unknown')).toBe('summary');
  });

  it('updates the subsection while preserving unrelated query state and clearing stale detail filters', () => {
    expect(withFinanceSection('?section=finance&metric=alerts&alert=overdue_panel&keep=1', 'collections'))
      .toBe('?section=finance&keep=1&finance=collections');
  });
});
