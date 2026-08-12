import { describe, expect, it } from 'vitest';

import { formatBillingPaymentMethod } from '@/lib/clinic/paymentMethod';

describe('formatBillingPaymentMethod', () => {
  it('labels a panel visit with patient payment as panel provider plus copay', () => {
    expect(formatBillingPaymentMethod({
      method: 'panel',
      patientPaid: 98,
      expectsPanel: true,
      panelName: 'PMCare',
    })).toBe('Panel: PMCare + Copay');
  });

  it('keeps a panel-only visit labelled with its provider', () => {
    expect(formatBillingPaymentMethod({
      method: 'panel',
      patientPaid: 0,
      expectsPanel: true,
      panelName: 'AIA',
    })).toBe('Panel: AIA');
  });

  it('keeps the ordinary payment label for a self-pay visit', () => {
    expect(formatBillingPaymentMethod({
      method: 'qr_pay',
      patientPaid: 98,
      expectsPanel: false,
      panelName: null,
    })).toBe('QR Pay');
  });

  it('summarizes every physical method used for a self-pay visit', () => {
    expect(formatBillingPaymentMethod({
      method: 'qr_pay',
      patientPaid: 100,
      expectsPanel: false,
      panelName: null,
      patientMethods: ['cash', 'qr_pay'],
    })).toBe('Cash + QR Pay');
  });

  it('keeps the panel provider and copay label when a panel visit uses multiple physical methods', () => {
    expect(formatBillingPaymentMethod({
      method: 'qr_pay',
      patientPaid: 100,
      expectsPanel: true,
      panelName: 'AIA',
      patientMethods: ['cash', 'qr_pay'],
    })).toBe('Panel: AIA + Copay');
  });
});
