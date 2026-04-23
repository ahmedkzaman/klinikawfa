import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export type PaymentMethodRow = Database['public']['Tables']['payment_methods']['Row'];

export function usePaymentMethods() {
  return useQuery<PaymentMethodRow[]>({
    queryKey: ['payment_methods', 'active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_methods')
        .select('*')
        .eq('status', 'active')
        .order('display_order', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as PaymentMethodRow[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
