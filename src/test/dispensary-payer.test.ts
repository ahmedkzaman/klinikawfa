import { describe, expect, it } from 'vitest';
import { buildDispensaryPayerUpdate } from '@/lib/clinic/dispensaryPayer';

describe('buildDispensaryPayerUpdate', () => {
  it('clears panel billing for self pay', () => {
    expect(buildDispensaryPayerUpdate('self')).toEqual({
      panel_id: null,
      payment_method: 'cash',
    });
  });

  it('saves the selected provider for panel billing', () => {
    expect(buildDispensaryPayerUpdate('panel', 'panel-123')).toEqual({
      panel_id: 'panel-123',
      payment_method: 'panel',
    });
  });

  it('rejects panel billing without a provider', () => {
    expect(() => buildDispensaryPayerUpdate('panel', null)).toThrow(
      'Select a panel provider.',
    );
  });
});
