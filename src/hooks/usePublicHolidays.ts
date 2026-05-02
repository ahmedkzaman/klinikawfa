import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface PublicHoliday {
  id: string;
  holiday_date: string; // YYYY-MM-DD
  name: string;
}

export const usePublicHolidays = () => {
  return useQuery({
    queryKey: ['public_holidays'],
    queryFn: async (): Promise<PublicHoliday[]> => {
      const { data, error } = await supabase
        .from('public_holidays')
        .select('id, holiday_date, name')
        .order('holiday_date', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });
};

export const useAddPublicHoliday = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ date, name }: { date: string; name: string }) => {
      const { error } = await supabase
        .from('public_holidays')
        .insert({ holiday_date: date, name });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['public_holidays'] });
      toast.success('Public holiday added');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to add holiday'),
  });
};

export const useDeletePublicHoliday = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('public_holidays').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['public_holidays'] });
      toast.success('Holiday removed');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to remove holiday'),
  });
};
