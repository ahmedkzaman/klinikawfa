import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Doctor {
  id: string;
  user_id: string | null;
  name: string;
  status: 'active' | 'inactive';
  on_duty: boolean;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateDoctorInput {
  user_id: string | null;
  name: string;
  status: 'active' | 'inactive';
  on_duty: boolean;
}

export interface UpdateDoctorInput {
  id: string;
  name?: string;
  status?: 'active' | 'inactive';
  on_duty?: boolean;
}

export function useDoctors() {
  return useQuery<Doctor[]>({
    queryKey: ['doctors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('doctors')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Doctor[];
    },
  });
}

function invalidateDoctorQueries(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['doctors'] });
  qc.invalidateQueries({ queryKey: ['clinic_users'] });
}

export function useCreateDoctor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateDoctorInput) => {
      const { data, error } = await supabase
        .from('doctors')
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data as Doctor;
    },
    onSuccess: () => invalidateDoctorQueries(qc),
  });
}

export function useUpdateDoctor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: UpdateDoctorInput) => {
      const { data, error } = await supabase
        .from('doctors')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as Doctor;
    },
    onSuccess: () => invalidateDoctorQueries(qc),
  });
}
