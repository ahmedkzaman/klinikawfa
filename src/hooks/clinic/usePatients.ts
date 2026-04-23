import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { PatientInsert, PatientRow } from '@/types/clinic';

/**
 * Patients lookup. Empty search → 50 most recent.
 * Non-empty search → ilike across name / phone / national_id.
 */
export function usePatients(search?: string) {
  const trimmed = search?.trim() ?? '';

  return useQuery<PatientRow[]>({
    queryKey: ['clinic', 'patients', trimmed],
    queryFn: async () => {
      let query = supabase
        .from('patients')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (trimmed.length > 0) {
        const escaped = trimmed.replace(/[%_]/g, (m) => `\\${m}`);
        query = query.or(
          `name.ilike.%${escaped}%,phone.ilike.%${escaped}%,national_id.ilike.%${escaped}%`,
        );
      }

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 10_000,
  });
}

export function useCreatePatient() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: PatientInsert) => {
      const { data, error } = await supabase
        .from('patients')
        .insert(input)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clinic', 'patients'] });
    },
  });
}
