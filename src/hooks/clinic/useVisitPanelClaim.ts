import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface VisitPanelClaim {
  amount: number;
  receivedAmount: number;
  status: string | null;
}

export function useVisitPanelClaim(queueEntryId?: string | null) {
  return useQuery<VisitPanelClaim | null>({
    queryKey: ['visit-panel-claim', queueEntryId ?? ''],
    enabled: Boolean(queueEntryId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('panel_claims')
        .select('amount, received_amount, status')
        .eq('queue_entry_id', queueEntryId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (!data?.length) return null;
      const active = data.filter((claim) =>
        ['pending', 'submitted', 'approved', 'received'].includes(String(claim.status).toLowerCase()),
      );
      const source = active.length ? active : data.slice(0, 1);
      return {
        amount: source.reduce((sum, claim) => sum + Number(claim.amount ?? 0), 0),
        receivedAmount: source.reduce((sum, claim) => sum + Number(claim.received_amount ?? 0), 0),
        status: active.length ? String(active[0].status) : String(source[0].status),
      };
    },
  });
}
