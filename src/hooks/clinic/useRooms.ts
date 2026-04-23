import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ClinicRoom {
  id: string;
  label: string;
}

export function useRooms() {
  return useQuery<ClinicRoom[]>({
    queryKey: ['clinic', 'rooms'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rooms')
        .select('id, label')
        .order('label');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });
}
