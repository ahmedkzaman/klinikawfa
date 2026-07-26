import { describe, expect, it } from 'vitest';
import { resolveConsultationFee } from '@/lib/clinic/resolveConsultationFee';

describe('resolveConsultationFee', () => {
  it('uses a configured panel fee', () => {
    expect(resolveConsultationFee({ panelId: 'panel-1', panelFee: 18, cashFee: 35 }))
      .toEqual({ amount: 18, source: 'panel' });
  });

  it('preserves a zero panel fee', () => {
    expect(resolveConsultationFee({ panelId: 'panel-1', panelFee: 0, cashFee: 35 }))
      .toEqual({ amount: 0, source: 'panel' });
  });

  it('falls back to cash when the panel fee is blank', () => {
    expect(resolveConsultationFee({ panelId: 'panel-1', panelFee: null, cashFee: 35 }))
      .toEqual({ amount: 35, source: 'cash-fallback' });
  });

  it('uses cash pricing for a cash visit even if a panel fee is supplied', () => {
    expect(resolveConsultationFee({ panelId: null, panelFee: 18, cashFee: 35 }))
      .toEqual({ amount: 35, source: 'cash' });
  });
});
