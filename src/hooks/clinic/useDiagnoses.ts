import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useDiagnoses() {
  const queryClient = useQueryClient();
  const queryKey = ['diagnoses'];

  const { data: diagnoses = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('diagnoses')
        .select('id, name, status, group_category, created_at, updated_at')
        .order('group_category', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const addDiagnosis = useMutation({
    mutationFn: async (payload: { name: string; group_category?: string }) => {
      const { error } = await supabase.from('diagnoses').insert({
        name: payload.name,
        group_category: payload.group_category ?? 'Uncategorized',
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const updateDiagnosis = useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: {
      id: string;
      name?: string;
      status?: string;
      group_category?: string;
    }) => {
      const { error } = await supabase.from('diagnoses').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const deleteDiagnosis = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('diagnoses').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  return { diagnoses, isLoading, addDiagnosis, updateDiagnosis, deleteDiagnosis };
}
