import { beforeEach, describe, expect, it, vi } from 'vitest';

const useQuery = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn());
const select = vi.hoisted(() => vi.fn());
const gte = vi.hoisted(() => vi.fn());
const lte = vi.hoisted(() => vi.fn());
const not = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({ useQuery }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from } }));

import { usePanelBilledInsights } from '@/hooks/clinic/usePanelBilledInsights';

interface QueryOptions<T> {
  queryKey: readonly unknown[];
  queryFn: () => Promise<T>;
}

describe('usePanelBilledInsights', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useQuery.mockImplementation((options) => options);
    from.mockReturnValue({ select });
    select.mockReturnValue({ gte });
    gte.mockReturnValue({ lte });
    lte.mockReturnValue({ not });
    not.mockResolvedValue({
      data: [
        { amount: '100', status: 'pending' },
        { amount: '150', status: 'approved' },
      ],
      error: null,
    });
  });

  it('queries the inclusive claim date range and excludes rejected and cancelled claims', async () => {
    usePanelBilledInsights(new Date(2026, 7, 10, 12), new Date(2026, 7, 10, 18));
    const options = useQuery.mock.calls.at(-1)?.[0] as QueryOptions<unknown>;

    expect(options.queryKey).toEqual(['panel-billed-insights', '2026-08-10', '2026-08-10']);
    await expect(options.queryFn()).resolves.toMatchObject({ totalBilled: 250, claimCount: 2, claims: expect.any(Array) });
    expect(from).toHaveBeenCalledWith('panel_claims');
    expect(select).toHaveBeenCalledWith('queue_entry_id, claim_date, amount, status');
    expect(gte).toHaveBeenCalledWith('claim_date', '2026-08-10');
    expect(lte).toHaveBeenCalledWith('claim_date', '2026-08-10');
    expect(not).toHaveBeenCalledWith('status', 'in', '(rejected,cancelled)');
  });

  it('preserves the database error', async () => {
    const error = new Error('panel claims unavailable');
    not.mockResolvedValue({ data: null, error });
    usePanelBilledInsights(new Date(2026, 7, 10), new Date(2026, 7, 11));
    const options = useQuery.mock.calls.at(-1)?.[0] as QueryOptions<unknown>;

    await expect(options.queryFn()).rejects.toBe(error);
  });
});
