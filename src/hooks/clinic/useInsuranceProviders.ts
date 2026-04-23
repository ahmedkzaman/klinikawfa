import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export type InsuranceProviderRow =
  Database['public']['Tables']['insurance_providers']['Row'];

export function useInsuranceProviders() {
  return useQuery<InsuranceProviderRow[]>({
    queryKey: ['insurance_providers', 'active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('insurance_providers')
        .select('*')
        .eq('status', 'active')
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as InsuranceProviderRow[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
