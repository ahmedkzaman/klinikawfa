import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const QUERY_KEY = ['inventory_items'];

export function useInventoryItems() {
  const queryClient = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_items')
        .select('*')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const addItem = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { error } = await supabase
        .from('inventory_items')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(values as any);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const updateItem = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Record<string, unknown>) => {
      const { error } = await supabase
        .from('inventory_items')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(updates as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('inventory_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  return { items, isLoading, addItem, updateItem, deleteItem };
}

/* ------------------------------------------------------------------ */
/* Named mutation hooks (Step 12 catalog management)                  */
/* ------------------------------------------------------------------ */

export interface InventoryItemInput {
  name: string;
  cost_price: number;
  /** Maps to DB column `price_to_patient_max` */
  selling_price: number;
  /** Maps to DB column `stock` */
  current_stock: number;
  status: 'active' | 'inactive';
}

function mapItemPayload(input: Partial<InventoryItemInput>) {
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = input.name;
  if (input.cost_price !== undefined) payload.cost_price = input.cost_price;
  if (input.selling_price !== undefined) {
    payload.price_to_patient_max = input.selling_price;
    payload.price_to_patient_min = input.selling_price;
  }
  if (input.current_stock !== undefined) payload.stock = input.current_stock;
  if (input.status !== undefined) payload.status = input.status;
  return payload;
}

export function useAddInventoryItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: InventoryItemInput) => {
      const { error } = await supabase
        .from('inventory_items')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(mapItemPayload(input) as any);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useUpdateInventoryItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string } & Partial<InventoryItemInput>) => {
      const { error } = await supabase
        .from('inventory_items')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(mapItemPayload(input) as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
