import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ClinicRoom {
  id: string;
  label: string;
  status?: string;
}

const ROOMS_KEY = ['clinic', 'rooms'] as const;

/**
 * Active rooms only (status = 'active'), used by queue/consultation pickers.
 */
export function useRooms() {
  return useQuery<ClinicRoom[]>({
    queryKey: [...ROOMS_KEY, 'active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rooms')
        .select('id, label, status')
        .eq('status', 'active')
        .order('label');
      if (error) throw error;
      return (data ?? []) as ClinicRoom[];
    },
    staleTime: 60_000,
  });
}

/**
 * All rooms (active + inactive), for the settings management page.
 */
export function useAllRooms() {
  return useQuery<ClinicRoom[]>({
    queryKey: [...ROOMS_KEY, 'all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rooms')
        .select('id, label, status')
        .order('label');
      if (error) throw error;
      return (data ?? []) as ClinicRoom[];
    },
    staleTime: 30_000,
  });
}

export function useCreateRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (label: string) => {
      const trimmed = label.trim();
      if (!trimmed) throw new Error('Room label is required');
      const { data, error } = await supabase
        .from('rooms')
        .insert({ label: trimmed })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ROOMS_KEY }),
  });
}

export function useUpdateRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; label?: string; status?: string }) => {
      const { error } = await supabase.from('rooms').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ROOMS_KEY }),
  });
}
