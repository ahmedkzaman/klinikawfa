import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function usePurchaseOrderItems(poId: string | null) {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
    if (poId) queryClient.invalidateQueries({ queryKey: ['purchase_orders', poId] });
  };

  const addLine = useMutation({
    mutationFn: async (input: {
      inventory_item_id: string;
      order_qty: number;
      unit_cost: number;
    }) => {
      if (!poId) throw new Error('No PO selected');
      const { error } = await supabase
        .from('purchase_order_items')
        .insert({ po_id: poId, ...input } as never);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const updateLine = useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: {
      id: string;
      inventory_item_id?: string;
      order_qty?: number;
      unit_cost?: number;
    }) => {
      const { error } = await supabase
        .from('purchase_order_items')
        .update(patch as never)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const removeLine = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('purchase_order_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { addLine, updateLine, removeLine };
}
