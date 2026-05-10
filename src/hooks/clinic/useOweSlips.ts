import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface OweSlipRow {
  id: string;
  consultation_item_id: string;
  consultation_id: string | null;
  patient_id: string | null;
  inventory_item_id: string;
  qty_owed: number;
  qty_fulfilled: number;
  status: 'open' | 'partially_fulfilled' | 'fulfilled' | 'cancelled';
  notes: string | null;
  created_at: string;
  closed_at: string | null;
  // joined
  patients?: { name: string | null; phone: string | null } | null;
  inventory_items?: { name: string | null } | null;
}

export function useOweSlips(opts: { statuses?: OweSlipRow['status'][] } = {}) {
  const statuses = opts.statuses ?? ['open', 'partially_fulfilled'];
  return useQuery({
    queryKey: ['pharmacy_owe_slips', statuses.join(',')],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pharmacy_owe_slips' as never)
        .select(
          'id, consultation_item_id, consultation_id, patient_id, inventory_item_id, qty_owed, qty_fulfilled, status, notes, created_at, closed_at, patients(name,phone), inventory_items(name)',
        )
        .in('status', statuses)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as OweSlipRow[];
    },
  });
}

export function useOweSlipsCountByItem(itemId: string | undefined) {
  return useQuery({
    queryKey: ['pharmacy_owe_slips', 'count_by_item', itemId],
    enabled: !!itemId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('pharmacy_owe_slips' as never)
        .select('id', { count: 'exact', head: true })
        .eq('inventory_item_id', itemId!)
        .in('status', ['open', 'partially_fulfilled']);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useFulfillOweSlip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { slipId: string; qty: number; notes?: string | null }) => {
      const { data, error } = await supabase.rpc('fulfill_owe_slip' as never, {
        _slip_id: input.slipId,
        _qty: input.qty,
        _notes: input.notes ?? null,
      } as never);
      if (error) throw error;
      return data as { status: string; qty_fulfilled: number };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pharmacy_owe_slips'] });
      qc.invalidateQueries({ queryKey: ['inventory_items'] });
      qc.invalidateQueries({ queryKey: ['clinic', 'inventory-dashboard'] });
      toast.success('Owe slip updated');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
