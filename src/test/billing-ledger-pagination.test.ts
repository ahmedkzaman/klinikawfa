import { describe, expect, it } from 'vitest';
import { fetchAllBillingRows } from '@/lib/clinic/fetchAllBillingRows';

describe('fetchAllBillingRows', () => {
  it('keeps fetching after the Supabase 1,000-row response limit', async () => {
    const source = Array.from({ length: 1_089 }, (_, id) => ({ id }));
    const requestedRanges: Array<[number, number]> = [];

    const rows = await fetchAllBillingRows(async (from, to) => {
      requestedRanges.push([from, to]);
      return source.slice(from, to + 1);
    });

    expect(rows).toHaveLength(1_089);
    expect(rows.at(-1)).toEqual({ id: 1_088 });
    expect(requestedRanges).toEqual([[0, 999], [1_000, 1_999]]);
  });
});
