import { useQuery } from '@tanstack/react-query';

export interface VisitPanelClaim {
  id: string;
  amount: number;
  receivedAmount: number;
  status: string | null;
  hasConfiguredPortions: boolean;
  isMaterialized: boolean;
}

interface PanelClaimPortionSnapshot {
  id: string;
  received_amount: number | null;
  payment_reference: string | null;
  received_date: string | null;
}

interface PanelClaimSnapshot {
  id: string;
  amount: number | null;
  received_amount: number | null;
  status: string | null;
  submitted_date: string | null;
  approved_amount: number | null;
  payment_reference: string | null;
  received_date: string | null;
  is_materialized: boolean;
  portions: PanelClaimPortionSnapshot[] | null;
}

export function useVisitPanelClaim(queueEntryId?: string | null) {
  return useQuery<VisitPanelClaim | null>({
    queryKey: ['visit-panel-claim', queueEntryId ?? ''],
    enabled: Boolean(queueEntryId),
    queryFn: async () => {
      // Load the client only when the query actually runs. This keeps the
      // read-only visit component testable without requiring browser env vars.
      const { supabase } = await import('@/integrations/supabase/client');
      const { data, error } = await supabase.rpc('get_visit_financial_snapshot', {
        p_queue_entry_id: queueEntryId!,
      });
      if (error) throw error;
      const claim = (data as unknown as { claim?: PanelClaimSnapshot | null } | null)?.claim ?? null;
      if (!claim) return null;
      return {
        id: claim.id,
        amount: Number(claim.amount ?? 0),
        receivedAmount: Number(claim.received_amount ?? 0),
        status: claim.status === null ? null : String(claim.status),
        hasConfiguredPortions: (claim.portions?.length ?? 0) > 0,
        isMaterialized: claim.is_materialized === true,
      };
    },
  });
}
