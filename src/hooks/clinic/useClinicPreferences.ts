import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface ClinicPreference {
  id: string;
  key: string;
  value: string;
}

export function useClinicPreferences() {
  const queryClient = useQueryClient();

  const { data: preferences = [], isLoading } = useQuery<ClinicPreference[]>({
    queryKey: ['clinic_preferences'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clinic_preferences').select('*');
      if (error) throw error;
      return data ?? [];
    },
  });

  const getPreference = useCallback(
    (key: string, defaultValue = '') => {
      const pref = preferences.find((p) => p.key === key);
      return pref?.value ?? defaultValue;
    },
    [preferences],
  );

  const setPreference = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const existing = preferences.find((p) => p.key === key);
      if (existing) {
        const { error } = await supabase
          .from('clinic_preferences')
          .update({ value })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('clinic_preferences').insert({ key, value });
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clinic_preferences'] }),
  });

  return { preferences, isLoading, getPreference, setPreference };
}

/**
 * Mutation hook for upserting a single clinic preference by `key`.
 * Used by Settings → General Preferences to save individual fields.
 */
export function useUpdateClinicPreference() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const { error } = await supabase
        .from('clinic_preferences')
        .upsert({ key, value }, { onConflict: 'key' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinic_preferences'] }),
  });
}
