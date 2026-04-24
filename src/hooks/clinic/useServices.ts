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

export interface ServiceInput {
  name: string;
  cost: number;
  /** Maps to DB column `price_to_patient` */
  price: number;
}

function mapServicePayload(input: Partial<ServiceInput>) {
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = input.name;
  if (input.cost !== undefined) payload.cost = input.cost;
  if (input.price !== undefined) payload.price_to_patient = input.price;
  return payload;
}

export function useAddService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ServiceInput) => {
      const { error } = await supabase
        .from('services')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(mapServicePayload(input) as any);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useUpdateService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string } & Partial<ServiceInput>) => {
      const { error } = await supabase
        .from('services')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(mapServicePayload(input) as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
