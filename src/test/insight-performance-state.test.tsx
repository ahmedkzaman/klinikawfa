import { describe, expect, it } from 'vitest';

import { buildPerformanceDailyRevenueCsv } from '@/lib/clinic/insight/performanceExports';

describe('Performance export compatibility', () => {
  it('keeps terminal panel claims out of the legacy daily panel-billed export', () => {
    expect(buildPerformanceDailyRevenueCsv([
      {
        queue_entry_id: 'rejected',
        visit_date: '2026-08-01',
        payment_method: 'panel',
        revenue: 500,
      },
    ], [
      { queue_entry_id: 'active', claim_date: '2026-08-01', amount: 45, status: 'submitted' },
      { queue_entry_id: 'rejected', claim_date: '2026-08-01', amount: 500, status: 'rejected' },
      { queue_entry_id: 'cancelled', claim_date: '2026-08-01', amount: 900, status: 'cancelled' },
    ])).toEqual([
      'date,card,qr_pay,cash,e_wallet,panel_billed,other_methods,consultation_revenue',
      '2026-08-01,0.00,0.00,0.00,0.00,45.00,0.00,45.00',
    ]);
  });
});
