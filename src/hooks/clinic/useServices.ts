import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const QUERY_KEY = ['services'];

export function useServices() {
  const queryClient = useQueryClient();

  const { data: services = [], isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from('services').select('*').order('name');
      if (error) throw error;
      return data;
    },
  });

  const addService = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from('services').insert(values as any);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const updateService = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Record<string, unknown>) => {
      const { error } = await supabase
        .from('services')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(updates as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const deleteService = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('services').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  return { services, isLoading, addService, updateService, deleteService };
}

/* ------------------------------------------------------------------ */
/* Named mutation hooks (Step 12 catalog management)                  */
/* ------------------------------------------------------------------ */

export type ServiceCategory =
  | 'General Service'
  | 'Procedure'
  | 'Laboratory Investigation'
  | 'Other';

export interface ServiceInput {
  name: string;
  cost: number;
  /** Self-pay price. Maps to DB column `price_to_patient`. */
  price: number;
  /** Standard panel rate. Maps to DB column `standard_panel_price`. */
  standard_panel_price?: number;
  status?: 'active' | 'inactive';
  /** Visual grouping in Inventory settings. Maps to DB column `category`. */
  category?: ServiceCategory;
  /** Natural key (SKU) used for legacy-inventory UPSERTs. Maps to DB column `item_code`. */
  item_code?: string | null;
}

function mapServicePayload(input: Partial<ServiceInput>) {
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = input.name;
  if (input.cost !== undefined) payload.cost = input.cost;
  if (input.price !== undefined) payload.price_to_patient = input.price;
  if (input.standard_panel_price !== undefined) {
    payload.standard_panel_price = input.standard_panel_price;
  }
  if (input.status !== undefined) payload.status = input.status;
  if (input.category !== undefined) payload.category = input.category;
  if (input.item_code !== undefined) {
    payload.item_code = input.item_code?.toString().trim() || null;
  }
  return payload;
}


export function useAddService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ServiceInput): Promise<{ id: string }> => {
      const { data, error } = await supabase
        .from('services')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(mapServicePayload(input) as any)
        .select('id')
        .single();
      if (error) throw error;
      return { id: (data as { id: string }).id };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useUpdateService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: { id: string } & Partial<ServiceInput>): Promise<{ id: string }> => {
      const { error } = await supabase
        .from('services')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(mapServicePayload(input) as any)
        .eq('id', id);
      if (error) throw error;
      return { id };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
