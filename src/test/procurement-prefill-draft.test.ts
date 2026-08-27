import { beforeEach, describe, expect, it, vi } from 'vitest';

const useQuery = vi.hoisted(() => vi.fn());
const useMutation = vi.hoisted(() => vi.fn());
const useQueryClient = vi.hoisted(() => vi.fn());
const rpc = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn());
const invalidateQueries = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({ useQuery, useMutation, useQueryClient }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc, from } }));

import { usePurchaseOrders } from '@/hooks/clinic/usePurchaseOrders';

type MutationOptions<TInput, TResult> = {
  mutationFn: (input: TInput) => Promise<TResult>;
};

function purchaseOrderQuery(options: { lineError?: Error } = {}) {
  const deleteEq = vi.fn().mockResolvedValue({ error: null });
  const purchaseOrders = {
    insert: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({ data: { id: 'po-1' }, error: null }),
      })),
    })),
    delete: vi.fn(() => ({ eq: deleteEq })),
  };
  const inventoryItems = {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({ data: { cost_price: 2.5 }, error: null }),
      })),
    })),
  };
  const lineInsert = vi.fn().mockResolvedValue({ error: options.lineError ?? null });

  from.mockImplementation((table: string) => {
    if (table === 'suppliers') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'supplier-1' } }),
              })),
            })),
          })),
        })),
      };
    }
    if (table === 'purchase_orders') return purchaseOrders;
    if (table === 'inventory_items') return inventoryItems;
    if (table === 'purchase_order_items') return { insert: lineInsert };
    throw new Error(`Unexpected table ${table}`);
  });

  return { deleteEq, lineInsert };
}

describe('purchase order recommendation prefill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useQuery.mockReturnValue({ data: [], isLoading: false });
    useQueryClient.mockReturnValue({ invalidateQueries });
    useMutation.mockImplementation((options) => options);
    rpc.mockResolvedValue({ data: 'PO-2026-001', error: null });
  });

  it('creates the recommended line with a normalized quantity and inventory cost', async () => {
    const { lineInsert, deleteEq } = purchaseOrderQuery();
    const { createDraft } = usePurchaseOrders();
    const mutation = createDraft as unknown as MutationOptions<{
      inventory_item_id: string;
      order_qty: number;
    }, { id: string }>;

    await expect(mutation.mutationFn({ inventory_item_id: 'item-1', order_qty: 7.4 }))
      .resolves.toEqual({ id: 'po-1' });
    expect(lineInsert).toHaveBeenCalledWith({
      po_id: 'po-1',
      inventory_item_id: 'item-1',
      order_qty: 7,
      unit_cost: 2.5,
    });
    expect(deleteEq).not.toHaveBeenCalled();
  });

  it('removes the orphan draft when the recommended line cannot be created', async () => {
    const lineError = new Error('line insert failed');
    const { deleteEq } = purchaseOrderQuery({ lineError });
    const { createDraft } = usePurchaseOrders();
    const mutation = createDraft as unknown as MutationOptions<{
      inventory_item_id: string;
      order_qty: number;
    }, { id: string }>;

    await expect(mutation.mutationFn({ inventory_item_id: 'item-1', order_qty: 3 }))
      .rejects.toBe(lineError);
    expect(deleteEq).toHaveBeenCalledWith('id', 'po-1');
  });
});
