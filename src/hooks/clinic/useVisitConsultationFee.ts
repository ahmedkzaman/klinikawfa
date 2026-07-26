import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { resolveConsultationFee } from '@/lib/clinic/resolveConsultationFee';

export async function fetchVisitPanelFee(panelId: string | null): Promise<number | null> {
  if (!panelId) return null;

  const { data, error } = await supabase
    .from('insurance_providers')
    .select('consultation_fee_override')
    .eq('id', panelId)
    .single();

  if (error) throw error;

  return data.consultation_fee_override === null
    ? null
    : Number(data.consultation_fee_override);
}

export function useVisitConsultationFee(panelId: string | null, cashFee: number) {
  return useQuery({
    queryKey: ['visit-consultation-fee', panelId, cashFee],
    queryFn: async () =>
      resolveConsultationFee({
        panelId,
        panelFee: await fetchVisitPanelFee(panelId),
        cashFee,
      }),
    enabled: Number.isFinite(cashFee),
    staleTime: 5 * 60 * 1000,
  });
}
