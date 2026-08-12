import { describe, expect, it } from 'vitest';

import { aggregatePanelBilledClaims } from '@/lib/clinic/panelBilledInsights';

describe('aggregatePanelBilledClaims', () => {
  it('sums original amounts for billable statuses and excludes rejected and cancelled claims', () => {
    expect(aggregatePanelBilledClaims([
      { amount: '100.50', status: 'pending' },
      { amount: 50, status: 'submitted' },
      { amount: '75', status: 'approved' },
      { amount: 25, status: 'received' },
      { amount: 500, status: 'rejected' },
      { amount: 900, status: 'cancelled' },
    ])).toEqual({ totalBilled: 250.5, claimCount: 4 });
  });

  it('returns zero totals for no eligible claims and normalizes invalid amounts to zero', () => {
    expect(aggregatePanelBilledClaims([
      { amount: 'invalid', status: 'pending' },
      { amount: 20, status: 'cancelled' },
    ])).toEqual({ totalBilled: 0, claimCount: 1 });
    expect(aggregatePanelBilledClaims([])).toEqual({ totalBilled: 0, claimCount: 0 });
  });
});
