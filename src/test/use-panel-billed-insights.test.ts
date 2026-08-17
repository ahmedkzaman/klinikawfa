import { beforeEach, describe, expect, it, vi } from 'vitest';

const useQuery = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn());
const select = vi.hoisted(() => vi.fn());
const gte = vi.hoisted(() => vi.fn());
const lte = vi.hoisted(() => vi.fn());
const rpc = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({ useQuery }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from, rpc } }));

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
    lte.mockReset();
    lte.mockResolvedValue({
      data: [
        { id: 'pending', amount: '100', received_amount: 0, status: 'pending' },
        { id: 'approved', amount: '150', received_amount: 0, status: 'approved' },
        { id: 'rejected', amount: '50', received_amount: 0, status: 'rejected' },
      ],
      error: null,
    });
    rpc.mockResolvedValue({ data: { total_received: 65 }, error: null });
  });

  it('queries all claim lifecycle rows and the authorized receipt-event aggregate', async () => {
    usePanelBilledInsights(new Date(2026, 7, 10, 12), new Date(2026, 7, 10, 18));
    const options = useQuery.mock.calls.at(-1)?.[0] as QueryOptions<unknown>;

    expect(options.queryKey).toEqual(['panel-billed-insights', '2026-08-10', '2026-08-10']);
    await expect(options.queryFn()).resolves.toMatchObject({
      totalBilled: 250,
      totalReceived: 65,
      claimCount: 2,
      claims: expect.arrayContaining([expect.objectContaining({ id: 'rejected' })]),
    });
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith('panel_claims');
    expect(select).toHaveBeenCalledWith(
      'id, queue_entry_id, claim_date, due_date, received_date, amount, received_amount, status, insurance_providers:panel_id ( id, name )',
    );
    expect(gte).toHaveBeenCalledWith('claim_date', '2026-08-10');
    expect(lte).toHaveBeenCalledWith('claim_date', '2026-08-10');
    expect(rpc).toHaveBeenCalledWith('get_panel_receipt_summary', {
      _start_date: '2026-08-10',
      _end_date: '2026-08-10',
    });
  });

  it('attributes RM40 in August and RM60 in September instead of reusing a cumulative parent total', async () => {
    lte
      .mockResolvedValueOnce({
        data: [{ id: 'split-claim', claim_date: '2026-08-15', amount: '100', received_amount: '100', received_date: '2026-09-02', status: 'received' }],
        error: null,
      })
      .mockResolvedValueOnce({ data: [], error: null });
    rpc
      .mockResolvedValueOnce({ data: { total_received: 40 }, error: null })
      .mockResolvedValueOnce({ data: { total_received: 60 }, error: null });

    usePanelBilledInsights(new Date(2026, 7, 1), new Date(2026, 7, 31));
    const august = useQuery.mock.calls.at(-1)?.[0] as QueryOptions<{ totalReceived: number }>;
    await expect(august.queryFn()).resolves.toMatchObject({ totalReceived: 40 });

    usePanelBilledInsights(new Date(2026, 8, 1), new Date(2026, 8, 30));
    const september = useQuery.mock.calls.at(-1)?.[0] as QueryOptions<{ totalReceived: number }>;
    await expect(september.queryFn()).resolves.toMatchObject({ totalReceived: 60 });

    expect(rpc).toHaveBeenNthCalledWith(1, 'get_panel_receipt_summary', {
      _start_date: '2026-08-01', _end_date: '2026-08-31',
    });
    expect(rpc).toHaveBeenNthCalledWith(2, 'get_panel_receipt_summary', {
      _start_date: '2026-09-01', _end_date: '2026-09-30',
    });
  });

  it('preserves the database error', async () => {
    const error = new Error('panel claims unavailable');
    lte.mockReset();
    lte.mockResolvedValueOnce({ data: null, error });
    usePanelBilledInsights(new Date(2026, 7, 10), new Date(2026, 7, 11));
    const options = useQuery.mock.calls.at(-1)?.[0] as QueryOptions<unknown>;

    await expect(options.queryFn()).rejects.toBe(error);
  });

  it('preserves the receipt aggregate error', async () => {
    const error = new Error('receipt history unavailable');
    rpc.mockResolvedValueOnce({ data: null, error });
    usePanelBilledInsights(new Date(2026, 7, 10), new Date(2026, 7, 11));
    const options = useQuery.mock.calls.at(-1)?.[0] as QueryOptions<unknown>;

    await expect(options.queryFn()).rejects.toBe(error);
  });

  it('does not present an incomplete historical receipt total as authoritative', async () => {
    rpc.mockResolvedValueOnce({
      data: { total_received: 60, attribution_complete: false, incomplete_claims: 1 },
      error: null,
    });
    usePanelBilledInsights(new Date(2026, 7, 1), new Date(2026, 7, 31));
    const options = useQuery.mock.calls.at(-1)?.[0] as QueryOptions<unknown>;

    await expect(options.queryFn()).resolves.toMatchObject({ totalReceived: null });
  });
});
