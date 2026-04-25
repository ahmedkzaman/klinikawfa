import { useEffect, useState } from 'react';
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

/**
 * Live search for Principal patients only (those who themselves have no
 * `principal_id`). Used by the Composite Registration dialog when linking a
 * dependant to their Principal. Disabled until the user has typed >= 2 chars.
 */
export function useSearchPatients(searchQuery: string) {
  const trimmed = searchQuery?.trim() ?? '';

  return useQuery<PatientRow[]>({
    queryKey: ['clinic', 'patients', 'search', trimmed],
    enabled: trimmed.length >= 2,
    queryFn: async () => {
      const escaped = trimmed.replace(/[%_]/g, (m) => `\\${m}`);
      const { data, error } = await supabase
        .from('patients')
        .select('*')
        .or(`name.ilike.%${escaped}%,national_id.ilike.%${escaped}%`)
        .is('principal_id', null)
        .order('name', { ascending: true })
        .limit(10);

      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5_000,
  });
}

/** Tiny debounce helper so Combobox queries don't fire on every keystroke. */
export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
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
