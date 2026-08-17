import { format } from 'date-fns';
import { describe, expect, it } from 'vitest';
import { buildComparisonPeriod, getInsightQuickRanges } from '@/lib/clinic/insight/periods';

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

describe('getInsightQuickRanges', () => {
  it('preserves the six Malaysian calendar presets', () => {
    const ranges = getInsightQuickRanges(new Date(2026, 7, 16));
    expect(ranges.map(({ label }) => label)).toEqual(['Today', 'This week', 'This month', 'Last month', 'This quarter', 'Year to date']);
    expect(format(ranges[3].range.from!, 'yyyy-MM-dd')).toBe('2026-07-01');
    expect(format(ranges[3].range.to!, 'yyyy-MM-dd')).toBe('2026-07-31');
  });
});
