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

  it('caps a legacy full-bill panel claim after a patient co-payment', () => {
    expect(calculateDualLedger({
      billedTotal: 224,
      patientPayments: [10],
      expectsPanel: true,
      panelClaim: { amount: 224, receivedAmount: 0, status: 'pending' },
    })).toMatchObject({
      patientOutstanding: 0,
      panelCovered: 214,
      panelOutstanding: 214,
      excessAttribution: 0,
      settlement: 'panel_due',
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

  it('does not count a panel allocation row as patient payment or panel remittance', () => {
    expect(calculateDualLedger({
      billedTotal: 103,
      patientPayments: [
        { amount: 93, paymentMethod: 'panel' },
        { amount: 10, paymentMethod: 'qr_pay' },
      ],
      expectsPanel: true,
      panelClaim: { amount: 103, receivedAmount: 0, status: 'submitted' },
      panelPayments: 93,
    })).toMatchObject({
      patientPaid: 10,
      panelCovered: 93,
      panelReceived: 0,
      patientOutstanding: 0,
      panelOutstanding: 93,
      settlement: 'panel_due',
    });
  });

  it('keeps QR patient payment separate and caps panel receivable to the unpaid bill balance', () => {
    expect(calculateDualLedger({
      billedTotal: 143,
      patientPayments: [
        { amount: 45, paymentMethod: 'panel' },
        { amount: 98, paymentMethod: 'qr_pay' },
      ],
      expectsPanel: true,
      panelClaim: { amount: 143, receivedAmount: 0, status: 'pending' },
      panelPayments: 45,
    })).toMatchObject({
      patientPaid: 98,
      panelCovered: 45,
      panelReceived: 0,
      patientOutstanding: 0,
      panelOutstanding: 45,
      unattributedBalance: 0,
      excessAttribution: 0,
      settlement: 'panel_due',
    });
  });
});
