export interface BillingPayerInput {
  queuePaymentMethod: string | null | undefined;
  panelId: string | null | undefined;
  panelProviderName: string | null | undefined;
  hasActiveClaim: boolean;
  paymentTypes: Array<string | null | undefined>;
}

export function classifyBillingPayer(input: BillingPayerInput): {
  expectsPanel: boolean;
  paymentType: 'self_pay' | 'panel';
} {
  const expectsPanel = input.queuePaymentMethod === 'panel'
    || Boolean(input.panelId)
    || Boolean(input.panelProviderName)
    || input.hasActiveClaim
    || input.paymentTypes.some((type) => type === 'panel' || type === 'insurance');
  return { expectsPanel, paymentType: expectsPanel ? 'panel' : 'self_pay' };
}
