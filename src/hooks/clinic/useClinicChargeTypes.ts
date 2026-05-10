import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export interface ClinicChargeType {
  id: string;
  name: string;
  default_amount: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useClinicChargeTypes(opts?: { activeOnly?: boolean }) {
  const activeOnly = opts?.activeOnly ?? false;
  return useQuery({
    queryKey: ['clinic_charge_types', { activeOnly }],
    queryFn: async () => {
      let q = supabase
        .from('clinic_charge_types')
        .select('*')
        .order('name', { ascending: true });
      if (activeOnly) q = q.eq('is_active', true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ClinicChargeType[];
    },
  });
}

export function useUpsertChargeType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      name: string;
      default_amount: number;
      is_active?: boolean;
    }) => {
      if (input.id) {
        const { error } = await supabase
          .from('clinic_charge_types')
          .update({
            name: input.name,
            default_amount: input.default_amount,
            ...(input.is_active !== undefined ? { is_active: input.is_active } : {}),
          })
          .eq('id', input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('clinic_charge_types').insert({
          name: input.name,
          default_amount: input.default_amount,
          is_active: input.is_active ?? true,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clinic_charge_types'] });
      toast.success('Charge saved');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useToggleChargeType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('clinic_charge_types')
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinic_charge_types'] }),
    onError: (e: Error) => toast.error(e.message),
  });
}
