import { describe, expect, it } from 'vitest';
import { buildComparisonPeriod } from '@/lib/clinic/insight/periods';

describe('buildComparisonPeriod', () => {
  it('builds an equal seven-day prior period', () => {
    expect(buildComparisonPeriod(new Date(2026, 6, 20), new Date(2026, 6, 26))).toEqual({
      startKey: '2026-07-20',
      endKey: '2026-07-26',
      priorStartKey: '2026-07-13',
      priorEndKey: '2026-07-19',
      days: 7,
    });
  });

  it('handles a one-day range and month boundaries', () => {
    expect(buildComparisonPeriod(new Date(2026, 6, 1), new Date(2026, 6, 1))).toMatchObject({
      startKey: '2026-07-01',
      endKey: '2026-07-01',
      priorStartKey: '2026-06-30',
      priorEndKey: '2026-06-30',
      days: 1,
    });
  });
});
