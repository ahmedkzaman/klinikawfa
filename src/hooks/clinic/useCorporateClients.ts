import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CorporateClient {
  id: string;
  name: string;
  address: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export type CorporateClientInput = Omit<CorporateClient, 'id' | 'created_at' | 'updated_at'>;

const KEY = ['corporate_clients'];

export function useCorporateClients() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<CorporateClient[]> => {
      const { data, error } = await supabase
        .from('corporate_clients')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as CorporateClient[];
    },
  });
}

export function useCreateCorporateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CorporateClientInput) => {
      const { error } = await supabase
        .from('corporate_clients')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(input as any);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateCorporateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<CorporateClientInput> }) => {
      const { error } = await supabase
        .from('corporate_clients')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(patch as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
