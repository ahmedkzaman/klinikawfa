import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type DiagnosisRow = {
  id: string;
  name: string;
  status: string;
  group_category: string;
  icd10_code: string | null;
  created_at: string;
  updated_at: string;
};

const SELECT_COLS =
  'id, name, status, group_category, icd10_code, created_at, updated_at';

export function useDiagnoses() {
  const queryClient = useQueryClient();
  const queryKey = ['diagnoses'];

  const { data: diagnoses = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('diagnoses')
        .select(SELECT_COLS)
        .order('group_category', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as DiagnosisRow[];
    },
  });

  const addDiagnosis = useMutation({
    mutationFn: async (payload: {
      name: string;
      group_category?: string;
      icd10_code?: string | null;
    }) => {
      const { data, error } = await supabase
        .from('diagnoses')
        .insert({
          name: payload.name,
          group_category: payload.group_category ?? 'Uncategorized',
          icd10_code: payload.icd10_code ?? null,
        })
        .select(SELECT_COLS)
        .single();
      if (error) throw error;
      return data as DiagnosisRow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['diagnoses', 'active'] });
      queryClient.invalidateQueries({ queryKey: ['diagnoses', 'uncategorized'] });
    },
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
      icd10_code?: string | null;
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

/** Active diagnoses for the consultation combobox. */
export function useActiveDiagnoses() {
  return useQuery({
    queryKey: ['diagnoses', 'active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('diagnoses')
        .select(SELECT_COLS)
        .eq('status', 'active')
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as DiagnosisRow[];
    },
  });
}

export function useUncategorizedDiagnoses() {
  return useQuery({
    queryKey: ['diagnoses', 'uncategorized'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('diagnoses')
        .select(SELECT_COLS)
        .or('group_category.is.null,group_category.eq.,group_category.eq.Uncategorized')
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as DiagnosisRow[];
    },
  });
}

export function useUpdateDiagnosisCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      category,
      icd10_code,
    }: {
      id: string;
      category?: string;
      icd10_code?: string | null;
    }) => {
      const updates: Record<string, unknown> = {};
      if (category !== undefined) updates.group_category = category;
      if (icd10_code !== undefined) updates.icd10_code = icd10_code;
      const { error } = await supabase.from('diagnoses').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['diagnoses'] });
    },
  });
}
