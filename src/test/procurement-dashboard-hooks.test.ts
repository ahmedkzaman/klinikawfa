import { beforeEach, describe, expect, it, vi } from 'vitest';

const useQuery = vi.hoisted(() => vi.fn());
const useMutation = vi.hoisted(() => vi.fn());
const useQueryClient = vi.hoisted(() => vi.fn());
const rpc = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn());
const storageFrom = vi.hoisted(() => vi.fn());
const remove = vi.hoisted(() => vi.fn());
const invalidateQueries = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({ useQuery, useMutation, useQueryClient }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc, from, storage: { from: storageFrom } },
}));

import { useProcurementDashboard } from '@/hooks/clinic/useProcurementDashboard';
import { useSaveProcurementBudgets } from '@/hooks/clinic/useProcurementBudgets';
import { useProcurementAttachments } from '@/hooks/clinic/useProcurementAttachments';
import { usePurchaseOrders } from '@/hooks/clinic/usePurchaseOrders';

type QueryOptions = { queryKey: unknown[]; queryFn: () => Promise<unknown> };
type MutationOptions<TInput, TResult> = {
  mutationFn: (input: TInput) => Promise<TResult>;
  onSuccess?: (data: TResult, vars: TInput) => void;
};

const validReport = {
  month: '2026-08-01',
  budgetRows: [
    { category: 'medicines', budget: 1000, committed: 0, received: 0, remaining: 1000 },
    { category: 'consumables', budget: 0, committed: 0, received: 0, remaining: 0 },
    { category: 'vaccines', budget: 0, committed: 0, received: 0, remaining: 0 },
    { category: 'other', budget: 0, committed: 0, received: 0, remaining: 0 },
  ],
  totals: { budget: 1000, committed: 0, received: 0, remaining: 1000 },
  counts: { stockoutRisk: 0, awaitingApproval: 0, awaitingDelivery: 0, overdue: 0, expiringSoon: 0 },
  actions: [],
};

describe('useProcurementDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useQueryClient.mockReturnValue({ invalidateQueries });
    useMutation.mockImplementation((options: unknown) => options);
  });

  it('parses the dashboard RPC and keys it by month', async () => {
    rpc.mockResolvedValue({ data: validReport, error: null });
    let captured: QueryOptions | undefined;
    useQuery.mockImplementation((options: QueryOptions) => {
      captured = options;
      return { data: undefined, isLoading: true };
    });

    useProcurementDashboard('2026-08-01');
    expect(captured?.queryKey).toEqual(['procurement', 'dashboard', '2026-08-01']);
    await expect(captured!.queryFn()).resolves.toMatchObject({ month: '2026-08-01' });
    expect(rpc).toHaveBeenCalledWith('get_procurement_dashboard', { _month: '2026-08-01' });
  });

  it('rejects malformed summary JSON instead of returning false zeroes', async () => {
    rpc.mockResolvedValue({ data: { totals: null }, error: null });
    let captured: QueryOptions | undefined;
    useQuery.mockImplementation((options: QueryOptions) => {
      captured = options;
      return { data: undefined, isLoading: true };
    });

    useProcurementDashboard('2026-08-01');
    await expect(captured!.queryFn()).rejects.toThrow('Invalid procurement dashboard response');
  });

  it('surfaces the RPC error', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('permission denied') });
    let captured: QueryOptions | undefined;
    useQuery.mockImplementation((options: QueryOptions) => {
      captured = options;
      return { data: undefined, isLoading: true };
    });

    useProcurementDashboard('2026-08-01');
    await expect(captured!.queryFn()).rejects.toThrow('permission denied');
  });
});

describe('useSaveProcurementBudgets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useQueryClient.mockReturnValue({ invalidateQueries });
    useMutation.mockImplementation((options: unknown) => options);
  });

  it('upserts all four categories and invalidates the dashboard', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    from.mockReturnValue({ upsert });

    const { saveBudgets } = useSaveProcurementBudgets('2026-08-01') as unknown as {
      saveBudgets: MutationOptions<
        { budgets: Record<string, number>; updatedBy: string },
        void
      >;
    };
    await saveBudgets.mutationFn({
      budgets: { medicines: 100, consumables: 200, vaccines: 0, other: 50 },
      updatedBy: 'user-1',
    });

    expect(upsert).toHaveBeenCalledTimes(1);
    const rows = upsert.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.category).sort()).toEqual([
      'consumables',
      'medicines',
      'other',
      'vaccines',
    ]);
    expect(rows.every((r) => r.budget_month === '2026-08-01' && r.updated_by === 'user-1')).toBe(true);
  });

  it('rejects non-finite or negative amounts', async () => {
    const upsert = vi.fn();
    from.mockReturnValue({ upsert });
    const { saveBudgets } = useSaveProcurementBudgets('2026-08-01') as unknown as {
      saveBudgets: MutationOptions<{ budgets: Record<string, number>; updatedBy: string }, void>;
    };
    await expect(
      saveBudgets.mutationFn({ budgets: { medicines: -5, consumables: 0, vaccines: 0, other: 0 }, updatedBy: 'u' }),
    ).rejects.toThrow();
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe('usePurchaseOrders transitionOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useQuery.mockReturnValue({ data: [], isLoading: false });
    useQueryClient.mockReturnValue({ invalidateQueries });
    useMutation.mockImplementation((options: unknown) => options);
  });

  it('uses the transition RPC and returns the actual status', async () => {
    rpc.mockResolvedValue({ data: 'Awaiting approval', error: null });
    const { transitionOrder } = usePurchaseOrders() as unknown as {
      transitionOrder: MutationOptions<{ id: string; status: string }, string>;
    };
    await expect(transitionOrder.mutationFn({ id: 'po-1', status: 'Ordered' }))
      .resolves.toBe('Awaiting approval');
    expect(rpc).toHaveBeenCalledWith('transition_purchase_order', {
      _po_id: 'po-1',
      _requested_status: 'Ordered',
    });
  });

  it('invalidates list, detail, and dashboard keys after transition', async () => {
    rpc.mockResolvedValue({ data: 'Ordered', error: null });
    const { transitionOrder } = usePurchaseOrders() as unknown as {
      transitionOrder: MutationOptions<{ id: string; status: string }, string>;
    };
    // The mocked useMutation returns raw options; React Query itself would
    // invoke onSuccess after a resolved mutationFn. Emulate that here.
    const result = await transitionOrder.mutationFn({ id: 'po-1', status: 'Ordered' });
    transitionOrder.onSuccess?.(result, { id: 'po-1', status: 'Ordered' });
    const keys = invalidateQueries.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(keys.some((k) => k.includes('purchase_orders'))).toBe(true);
    expect(keys.some((k) => k.includes('dashboard'))).toBe(true);
  });
});

describe('useProcurementAttachments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useQueryClient.mockReturnValue({ invalidateQueries });
    useMutation.mockImplementation((options: unknown) => options);
  });

  function attachmentChain(listData: unknown[] = []) {
    const order = vi.fn(() => ({ data: listData, error: null }));
    const select = vi.fn(() => ({ eq: vi.fn(() => ({ order })) }));
    from.mockReturnValue({ select });
    return { select, order };
  }

  it('lists attachment metadata for the PO', async () => {
    const chain = attachmentChain([{ id: 'a1', file_name: 'invoice.pdf' }]);
    let captured: QueryOptions | undefined;
    useQuery.mockImplementation((options: QueryOptions) => {
      captured = options;
      return { data: undefined, isLoading: true };
    });
    useProcurementAttachments('po-1');
    expect(captured?.queryKey).toEqual(['procurement', 'attachments', 'po-1']);
    await expect(captured!.queryFn()).resolves.toEqual([{ id: 'a1', file_name: 'invoice.pdf' }]);
  });

  it('removes storage object before deleting metadata, and aborts if storage delete fails', async () => {
    const chain = attachmentChain();
    const metadataDelete = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }));
    from.mockImplementation(() => ({ select: chain.select, delete: metadataDelete }));

    // failing storage remove
    remove.mockResolvedValue({ error: new Error('storage down') });
    storageFrom.mockReturnValue({ remove });

    const { deleteAttachment } = useProcurementAttachments('po-1') as unknown as {
      deleteAttachment: MutationOptions<{ id: string; storagePath: string }, void>;
    };
    await expect(
      deleteAttachment.mutationFn({ id: 'a1', storagePath: 'po-1/x.png' }),
    ).rejects.toThrow('storage down');
    expect(metadataDelete).not.toHaveBeenCalled();

    // succeeding storage remove
    remove.mockResolvedValue({ error: null });
    const result = await deleteAttachment.mutationFn({ id: 'a1', storagePath: 'po-1/x.png' });
    deleteAttachment.onSuccess?.(result, { id: 'a1', storagePath: 'po-1/x.png' });
    expect(remove).toHaveBeenCalledWith(['po-1/x.png']);
    expect(metadataDelete).toHaveBeenCalled();
    expect(invalidateQueries).toHaveBeenCalled();
  });

  it('rejects disallowed file types and oversized files before upload', async () => {
    const chain = attachmentChain();
    const upload = vi.fn();
    const metadataInsert = vi.fn();
    storageFrom.mockReturnValue({ upload });
    from.mockImplementation(() => ({ select: chain.select, insert: metadataInsert }));

    const { uploadAttachment } = useProcurementAttachments('po-1') as unknown as {
      uploadAttachment: MutationOptions<{ file: File }, void>;
    };
    const badType = new File(['x'], 'a.gif', { type: 'image/gif' });
    await expect(uploadAttachment.mutationFn({ file: badType })).rejects.toThrow(/file type/i);
    const bigFile = new File([new ArrayBuffer(11)], 'a.pdf', { type: 'application/pdf' });
    Object.defineProperty(bigFile, 'size', { value: 10 * 1024 * 1024 + 1 });
    await expect(uploadAttachment.mutationFn({ file: bigFile })).rejects.toThrow(/10 MB/i);
    expect(upload).not.toHaveBeenCalled();
    expect(metadataInsert).not.toHaveBeenCalled();
  });

  it('uploads without upsert, inserts metadata, and cleans up the object when metadata insert fails', async () => {
    const chain = attachmentChain();
    const upload = vi.fn().mockResolvedValue({ data: { path: 'po-1/uuid-file.pdf' }, error: null });
    const storageDelete = vi.fn().mockResolvedValue({ error: null });
    storageFrom.mockReturnValue({ upload, remove: storageDelete });
    const metadataInsert = vi
      .fn()
      .mockResolvedValue({ error: new Error('metadata insert failed') });
    from.mockImplementation(() => ({ select: chain.select, insert: metadataInsert }));

    const { uploadAttachment } = useProcurementAttachments('po-1') as unknown as {
      uploadAttachment: MutationOptions<{ file: File }, void>;
    };
    const file = new File(['pdf'], 'invoice.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'size', { value: 1024 });
    await expect(uploadAttachment.mutationFn({ file })).rejects.toThrow('metadata insert failed');
    // Path is `<poId>/<uuid>-<sanitized name>`; assert by shape, not exact UUID.
    const [calledPath, calledFile, calledOpts] = upload.mock.calls[0];
    expect(calledPath).toMatch(/^po-1\/[0-9a-f-]{36}-invoice\.pdf$/);
    expect(calledFile).toBe(file);
    expect(calledOpts).toEqual({ upsert: false });
    expect(storageDelete).toHaveBeenCalledWith([calledPath]);
  });
});
