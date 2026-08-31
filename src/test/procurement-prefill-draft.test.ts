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

describe('stock planning view contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useQueryClient.mockReturnValue({ invalidateQueries });
    useMutation.mockImplementation((options) => options);
  });

  it('reports the view suggestion net of open orders without re-adding stock on order', async () => {
    const viewRow = {
      item_id: 'item-1',
      name: 'Paracetamol',
      category: 'Medication',
      current_stock: 5,
      reorder_level: 10,
      used_30d: 60,
      avg_daily_usage: 0.667,
      days_cover: 7.5,
      movement_status: 'fast',
      open_order_qty: 40,
      supplier_lead_time_days: 7,
      nearest_expiry_date: null,
      suggested_qty: 5,
      recommendation_reason: 'Based on 90-day usage, lead time, and open orders',
    };
    const select = vi.fn(() => ({
      order: vi.fn(() => ({ data: [viewRow], error: null })),
    }));
    from.mockImplementation((table: string) => {
      if (table === 'v_procurement_stock_planning') return { select };
      throw new Error(`Unexpected table ${table}`);
    });

    let captured: { queryKey: unknown[]; queryFn: () => Promise<unknown> } | undefined;
    useQuery.mockImplementation((options: { queryKey: unknown[]; queryFn: () => Promise<unknown> }) => {
      captured = options;
      return { data: undefined, isLoading: true };
    });

    const { useProcurementStockPlanning } = await import('@/hooks/clinic/useProcurementStats');
    useProcurementStockPlanning();
    const rows = (await captured!.queryFn()) as Array<typeof viewRow>;

    expect(rows).toHaveLength(1);
    // The suggestion already subtracts the 40 units on open orders: the
    // recommendation is 5, NOT (formula result + open order qty).
    expect(rows[0].open_order_qty).toBe(40);
    expect(rows[0].suggested_qty).toBe(5);
  });
});
