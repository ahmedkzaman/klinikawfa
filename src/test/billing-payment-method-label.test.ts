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
});
