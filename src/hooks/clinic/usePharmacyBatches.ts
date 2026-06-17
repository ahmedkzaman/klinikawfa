import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface InventoryBatch {
  id: string;
  inventory_item_id: string;
  batch_number: string;
  expiry_date: string;
  quantity_initial: number;
  quantity_remaining: number;
  cost_price: number | null;
  received_at: string;
  notes: string | null;
}

export interface InventoryTransactionRow {
  id: string;
  inventory_item_id: string;
  batch_id: string | null;
  transaction_type:
    | 'restock'
    | 'dispense'
    | 'adjustment'
    | 'return'
    | 'write-off'
    | 'expire'
    | 'owe_slip_fulfilled';
  qty_change: number;
  consultation_id: string | null;
  patient_id: string | null;
  reason_code: string | null;
  notes: string | null;
  performed_by: string | null;
  created_at: string;
}

export type BatchHealth = 'expired' | 'expiring' | 'ok';

export function batchHealth(b: Pick<InventoryBatch, 'expiry_date' | 'quantity_remaining'>): BatchHealth {
  if (b.quantity_remaining <= 0) return 'expired';
  const t = new Date(b.expiry_date).getTime();
  if (Number.isNaN(t)) return 'ok';
  const now = Date.now();
  if (t < now) return 'expired';
  if (t - now <= 90 * 24 * 60 * 60 * 1000) return 'expiring';
  return 'ok';
}

export function useInventoryBatches(itemId: string | undefined) {
  return useQuery({
    queryKey: ['inventory_item_batches', itemId],
    enabled: !!itemId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_item_batches' as never)
        .select('*')
        .eq('inventory_item_id', itemId!)
        .order('expiry_date', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as InventoryBatch[];
    },
  });
}

export function useInventoryTransactions(itemId: string | undefined) {
  return useQuery({
    queryKey: ['inventory_transactions', itemId],
    enabled: !!itemId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_transactions' as never)
        .select('*')
        .eq('inventory_item_id', itemId!)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as InventoryTransactionRow[];
    },
  });
}

export function useAddBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      itemId: string;
      batchNumber: string;
      expiryDate: string;
      quantity: number;
      costPrice?: number | null;
      notes?: string | null;
    }) => {
      const { data, error } = await supabase.rpc('add_inventory_batch' as never, {
        _item_id: input.itemId,
        _batch_number: input.batchNumber,
        _expiry: input.expiryDate,
        _qty: input.quantity,
        _cost: input.costPrice ?? null,
        _po_id: null,
        _notes: input.notes ?? null,
      } as never);
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['inventory_item_batches', vars.itemId] });
      qc.invalidateQueries({ queryKey: ['inventory_transactions', vars.itemId] });
      qc.invalidateQueries({ queryKey: ['clinic', 'inventory-dashboard'] });
      qc.invalidateQueries({ queryKey: ['inventory_items'] });
      toast.success('Batch added');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useAdjustBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      itemId: string;
      batchId: string;
      delta: number;
      reason: string;
      notes?: string | null;
    }) => {
      const { error } = await supabase.rpc('adjust_inventory_batch' as never, {
        _batch_id: input.batchId,
        _delta: input.delta,
        _reason: input.reason,
        _notes: input.notes ?? null,
      } as never);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['inventory_item_batches', vars.itemId] });
      qc.invalidateQueries({ queryKey: ['inventory_transactions', vars.itemId] });
      qc.invalidateQueries({ queryKey: ['clinic', 'inventory-dashboard'] });
      qc.invalidateQueries({ queryKey: ['inventory_items'] });
      toast.success('Batch adjusted');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
