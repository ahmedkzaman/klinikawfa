import { describe, expect, it } from 'vitest';

import { aggregatePanelBilledClaims } from '@/lib/clinic/panelBilledInsights';

describe('aggregatePanelBilledClaims', () => {
  it('sums billable statuses while preserving rejected and cancelled claims for lifecycle reporting', () => {
    const summary = aggregatePanelBilledClaims([
      { amount: '100.50', status: 'pending' },
      { amount: 50, status: 'submitted' },
      { amount: '75', status: 'approved' },
      { amount: 25, status: 'received' },
      { amount: 500, status: 'rejected' },
      { amount: 900, status: 'cancelled' },
    ]);
    expect(summary).toMatchObject({ totalBilled: 250.5, claimCount: 4 });
    expect(summary.claims).toHaveLength(6);
  });

  it('returns zero totals for no eligible claims and normalizes invalid amounts to zero', () => {
    expect(aggregatePanelBilledClaims([
      { amount: 'invalid', status: 'pending' },
      { amount: 20, status: 'cancelled' },
    ])).toMatchObject({ totalBilled: 0, claimCount: 1 });
    expect(aggregatePanelBilledClaims([])).toMatchObject({ totalBilled: 0, claimCount: 0 });
  });
});
