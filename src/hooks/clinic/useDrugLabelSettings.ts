import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export interface DrugLabelSettings {
  id: string;
  show_address: boolean;
  show_tel_number: boolean;
  show_precaution: boolean;
  show_quantity: boolean;
  show_date: boolean;
  show_expiry_date: boolean;
  show_duration: boolean;
  show_indication: boolean;
  font_size_clinic: number;
  font_size_medicine: number;
  font_size_instruction: number;
  updated_at: string;
}

const QUERY_KEY = ['drug-label-settings'] as const;

/**
 * Fetch the singleton drug-label settings row. The table is locked to a
 * single row by a UNIQUE constraint on `singleton`, so a `.maybeSingle()`
 * scoped to `singleton = true` will always return the canonical config.
 */
export function useDrugLabelSettings() {
  return useQuery<DrugLabelSettings | null>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('drug_label_settings')
        .select('*')
        .eq('singleton', true)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as DrugLabelSettings | null;
    },
    staleTime: 60_000,
  });
}

type ToggleablePatch = Partial<
  Pick<
    DrugLabelSettings,
    | 'show_address'
    | 'show_tel_number'
    | 'show_precaution'
    | 'show_quantity'
    | 'show_date'
    | 'show_expiry_date'
    | 'show_duration'
    | 'show_indication'
  >
>;

/**
 * Optimistically updates the singleton settings row. The preview reflects
 * the new value before the round-trip completes; on error we roll back the
 * cache and surface a toast so the user knows the change didn't persist.
 */
export function useUpdateDrugLabelSettings() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (patch: ToggleablePatch) => {
      const { error } = await supabase
        .from('drug_label_settings')
        .update(patch)
        .eq('singleton', true);
      if (error) throw error;
    },
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: QUERY_KEY });
      const previous = qc.getQueryData<DrugLabelSettings | null>(QUERY_KEY);
      if (previous) {
        qc.setQueryData<DrugLabelSettings | null>(QUERY_KEY, {
          ...previous,
          ...patch,
        });
      }
      return { previous };
    },
    onError: (err, _patch, ctx) => {
      if (ctx?.previous) qc.setQueryData(QUERY_KEY, ctx.previous);
      toast.error((err as Error).message || 'Failed to update label settings');
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
