export type DispensaryPayerType = 'self' | 'panel';

export function buildDispensaryPayerUpdate(
  payerType: DispensaryPayerType,
  panelId?: string | null,
): { panel_id: string | null; payment_method: 'cash' | 'panel' } {
  if (payerType === 'self') {
    return { panel_id: null, payment_method: 'cash' };
  }
  if (!panelId) throw new Error('Select a panel provider.');
  return { panel_id: panelId, payment_method: 'panel' };
}
