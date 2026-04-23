import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

const STOCK_MSG = 'Not enough stock available for this item.';

function isInsufficientStock(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; message?: string };
  return e.code === 'P0001' || (e.message?.includes('insufficient_stock') ?? false);
}

export function useConsultationItems(consultationId: string | undefined) {
  return useQuery({
    queryKey: ['consultation_items', consultationId],
    enabled: !!consultationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('consultation_items')
        .select('*')
        .eq('consultation_id', consultationId!)
        .is('deleted_at', null)
        .order('created_at');
      if (error) throw error;
      return data;
    },
  });
}

export function useAddConsultationItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: {
      consultation_id: string;
      item_name: string;
      quantity?: number;
      dosage?: string;
      price?: number;
    }) => {
      const { error } = await supabase.from('consultation_items').insert(item);
      if (error) {
        if (isInsufficientStock(error)) {
          toast.error(STOCK_MSG);
          throw new Error(STOCK_MSG);
        }
        throw error;
      }
    },
    onSuccess: (_, vars) =>
      qc.invalidateQueries({ queryKey: ['consultation_items', vars.consultation_id] }),
  });
}

export function useRemoveConsultationItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      consultationId,
    }: {
      id: string;
      consultationId: string;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('consultation_items')
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: user?.id ?? null,
        })
        .eq('id', id);
      if (error) throw error;
      return consultationId;
    },
    onSuccess: (consultationId) =>
      qc.invalidateQueries({ queryKey: ['consultation_items', consultationId] }),
  });
}

export function useUpdateConsultationItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      consultationId,
      ...updates
    }: {
      id: string;
      consultationId: string;
      quantity?: number;
      price?: number;
      price_tier?: string | null;
      indication?: string | null;
      dosage_qty?: number | null;
      dosage_unit?: string | null;
      frequency?: string | null;
      instruction?: string | null;
      duration?: string | null;
      precaution?: string | null;
    }) => {
      const { error } = await supabase
        .from('consultation_items')
        .update(updates)
        .eq('id', id);
      if (error) {
        if (isInsufficientStock(error)) {
          toast.error(STOCK_MSG);
          throw new Error(STOCK_MSG);
        }
        throw error;
      }
      return consultationId;
    },
    onSuccess: (consultationId) =>
      qc.invalidateQueries({ queryKey: ['consultation_items', consultationId] }),
  });
}
