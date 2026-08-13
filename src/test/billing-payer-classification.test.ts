import { describe, expect, it } from 'vitest';
import { classifyBillingPayer } from '@/lib/clinic/billingPayer';

describe('billing payer classification', () => {
  it('keeps a panel visit classified as panel after a later self-pay copy', () => {
    expect(classifyBillingPayer({
      queuePaymentMethod: 'panel',
      panelId: 'inactive-provider',
      panelProviderName: 'Legacy Panel',
      hasActiveClaim: false,
      paymentTypes: ['panel', 'self_pay'],
    })).toEqual({ expectsPanel: true, paymentType: 'panel' });
  });

  it('uses claim evidence when a legacy queue payer marker is missing', () => {
    expect(classifyBillingPayer({
      queuePaymentMethod: 'cash',
      panelId: null,
      panelProviderName: null,
      hasActiveClaim: true,
      paymentTypes: ['self_pay'],
    }).expectsPanel).toBe(true);
  });
});
