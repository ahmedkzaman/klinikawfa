import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export type InsuranceProviderRow =
  Database['public']['Tables']['insurance_providers']['Row'];
export type InsuranceProviderInsert =
  Database['public']['Tables']['insurance_providers']['Insert'];
export type InsuranceProviderUpdate =
  Database['public']['Tables']['insurance_providers']['Update'];

interface UseInsuranceProvidersOptions {
  activeOnly?: boolean;
}

export function useInsuranceProviders(options: UseInsuranceProvidersOptions = {}) {
  const { activeOnly = false } = options;
  return useQuery<InsuranceProviderRow[]>({
    queryKey: ['insurance_providers', activeOnly ? 'active' : 'all'],
    queryFn: async () => {
      let query = supabase
        .from('insurance_providers')
        .select('*')
        .order('name', { ascending: true });
      if (activeOnly) query = query.eq('status', 'active');
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as InsuranceProviderRow[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['insurance_providers'] });
}

export function useAddInsuranceProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: InsuranceProviderInsert) => {
      const { data, error } = await supabase
        .from('insurance_providers')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as InsuranceProviderRow;
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useUpdateInsuranceProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: InsuranceProviderUpdate;
    }) => {
      const { data, error } = await supabase
        .from('insurance_providers')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as InsuranceProviderRow;
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useDeleteInsuranceProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Soft-delete by setting status='inactive' to preserve FK refs in
      // queue_entries / panel_claims / panel_price_overrides.
      const { error } = await supabase
        .from('insurance_providers')
        .update({ status: 'inactive' })
        .eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => invalidate(qc),
  });
}
