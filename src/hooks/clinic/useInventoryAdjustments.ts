import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface StockChange {
  inventory_item_id: string;
  previous_stock: number;
  new_stock: number;
}

export function useReconcileStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      changes,
      reason,
    }: {
      changes: StockChange[];
      reason?: string | null;
    }) => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) throw new Error('Not authenticated');

      for (const ch of changes) {
        if (ch.previous_stock === ch.new_stock) continue;

        const { error: insErr } = await supabase
          .from('inventory_adjustments')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert({
            inventory_item_id: ch.inventory_item_id,
            previous_stock: ch.previous_stock,
            new_stock: ch.new_stock,
            reason: reason || null,
            adjusted_by: uid,
          } as any);
        if (insErr) throw insErr;

        const { error: updErr } = await supabase
          .from('inventory_items')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .update({ stock: ch.new_stock } as any)
          .eq('id', ch.inventory_item_id);
        if (updErr) throw updErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory_items'] });
      qc.invalidateQueries({ queryKey: ['clinic', 'inventory-dashboard'] });
    },
  });
}
