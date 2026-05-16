import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type MovementStatus = 'fast' | 'normal' | 'slow' | 'dead';

export type InventoryMovementStat = {
  item_id: string;
  name: string;
  current_stock: number;
  reorder_level: number;
  used_30d: number;
  used_90d: number;
  avg_daily_usage: number;
  /** Null = infinite (no usage in 90 days) */
  days_cover: number | null;
  movement_status: MovementStatus;
  last_dispensed_at: string | null;
};

export function useProcurementStats() {
  return useQuery({
    queryKey: ['procurement', 'movement-stats'],
    queryFn: async (): Promise<InventoryMovementStat[]> => {
      const { data, error } = await supabase
        .from('v_inventory_movement_stats' as never)
        .select('*')
        .order('used_30d', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as InventoryMovementStat[];
    },
    staleTime: 60_000,
  });
}

export type InventoryTxType =
  | 'restock'
  | 'dispense'
  | 'adjustment'
  | 'return'
  | 'write-off'
  | 'expire'
  | 'owe_slip_fulfilled';

export type StockMovementRow = {
  id: string;
  created_at: string;
  transaction_type: InventoryTxType;
  qty_change: number;
  reason_code: string | null;
  notes: string | null;
  performed_by: string | null;
  inventory_item_id: string;
  inventory_item: { name: string } | null;
};

export function useStockMovements(opts: {
  limit?: number;
  itemId?: string | null;
  type?: InventoryTxType | null;
} = {}) {
  const { limit = 100, itemId, type } = opts;
  return useQuery({
    queryKey: ['procurement', 'movements', { limit, itemId, type }],
    queryFn: async (): Promise<StockMovementRow[]> => {
      let q = supabase
        .from('inventory_transactions')
        .select('id, created_at, transaction_type, qty_change, reason_code, notes, performed_by, inventory_item_id, inventory_item:inventory_items(name)')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (itemId) q = q.eq('inventory_item_id', itemId);
      if (type) q = q.eq('transaction_type', type);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as StockMovementRow[];
    },
    staleTime: 30_000,
  });
}
