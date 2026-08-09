import { describe, expect, it } from 'vitest';

import { calculateDualLedger } from '@/lib/clinic/dualLedger';

describe('calculateDualLedger', () => {
  it('separates a panel co-payment from the amount receivable from the panel', () => {
    expect(calculateDualLedger({
      billedTotal: 224,
      patientPayments: [10],
      expectsPanel: true,
      panelClaim: { amount: 214, receivedAmount: 0, status: 'pending' },
    })).toMatchObject({
      patientPaid: 10,
      panelCovered: 214,
      patientOutstanding: 0,
      panelOutstanding: 214,
      unattributedBalance: 0,
      settlement: 'panel_due',
    });
  });

  it('reduces panel receivable without counting it as patient cash', () => {
    expect(calculateDualLedger({
      billedTotal: 224,
      patientPayments: [10],
      expectsPanel: true,
      panelClaim: { amount: 214, receivedAmount: 100, status: 'approved' },
    })).toMatchObject({
      patientPaid: 10,
      panelReceived: 100,
      patientOutstanding: 0,
      panelOutstanding: 114,
      settlement: 'panel_due',
    });
  });

  it('flags a missing panel claim instead of turning its balance into patient debt', () => {
    expect(calculateDualLedger({
      billedTotal: 224,
      patientPayments: [10],
      expectsPanel: true,
      panelClaim: null,
    })).toMatchObject({
      patientOutstanding: 0,
      panelOutstanding: 0,
      unattributedBalance: 214,
      settlement: 'needs_attention',
    });
  });

  it('flags legacy over-attribution when co-payment plus panel claim exceeds the bill', () => {
    expect(calculateDualLedger({
      billedTotal: 224,
      patientPayments: [10],
      expectsPanel: true,
      panelClaim: { amount: 224, receivedAmount: 0, status: 'pending' },
    })).toMatchObject({
      patientOutstanding: 0,
      excessAttribution: 10,
      settlement: 'needs_attention',
    });
  });

  it('flags a rejected claim without silently transferring it to the patient', () => {
    expect(calculateDualLedger({
      billedTotal: 224,
      patientPayments: [10],
      expectsPanel: true,
      panelClaim: { amount: 214, receivedAmount: 0, status: 'rejected' },
    })).toMatchObject({
      patientOutstanding: 0,
      panelOutstanding: 0,
      unattributedBalance: 214,
      settlement: 'needs_attention',
    });
  });

  it('keeps ordinary self-pay balances in the patient ledger', () => {
    expect(calculateDualLedger({
      billedTotal: 224,
      patientPayments: [224],
      expectsPanel: false,
    })).toMatchObject({
      patientPaid: 224,
      patientOutstanding: 0,
      panelOutstanding: 0,
      unattributedBalance: 0,
      settlement: 'settled',
    });
  });
});
